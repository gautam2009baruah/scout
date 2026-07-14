import http from "node:http";
import { URL } from "node:url";
import {
  HTTP_TRIGGER_RESPONSE_CODES,
} from "@/lib/orchestrations/http-trigger/constants";
import {
  resolveHttpTriggerByShortName,
} from "@/lib/orchestrations/http-trigger/endpoint-resolution";
import { validateHttpRequest, enforceRateLimit } from "@/lib/orchestrations/http-trigger/validation";
import { authenticateHttpTriggerRequest } from "@/lib/orchestrations/http-trigger/auth";
import { dispatchHttpTrigger } from "@/lib/orchestrations/http-trigger/dispatch";
import { newCorrelationId } from "@/lib/orchestrations/http-trigger/security";
import { redactHeaders, writeHttpTriggerAuditLog } from "@/lib/orchestrations/http-trigger/audit";

const host = process.env.HTTP_TRIGGER_API_HOST || "0.0.0.0";
const port = Number(process.env.HTTP_TRIGGER_API_PORT || 4303);

type RequestLike = {
  method: string;
  headers: Headers;
  nextUrl: URL;
  text: () => Promise<string>;
};

function getClientIp(request: RequestLike): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return null;
}

function isHttpsRequest(request: RequestLike): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === "https";
  }

  return request.nextUrl.protocol === "https:";
}

function sendJson(response: http.ServerResponse, status: number, body: unknown, correlationId?: string) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (correlationId) {
    response.setHeader("x-correlation-id", correlationId);
  }
  response.end(JSON.stringify(body));
}

function splitPathSegments(pathname: string): { shortName: string; pathSegments: string[] } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[0] !== "apitrigger") {
    return null;
  }

  const shortName = parts[1] || "";
  if (!shortName) {
    return null;
  }

  return {
    shortName,
    pathSegments: parts.slice(2),
  };
}

async function readRawBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function handle(request: RequestLike, params: { shortName: string; pathSegments?: string[] }) {
  const correlationId = newCorrelationId(request.headers.get("x-correlation-id"));
  const clientIp = getClientIp(request);

  if (!isHttpsRequest(request)) {
    return {
      status: 426,
      correlationId,
      body: {
        success: false,
        code: "HTTPS_REQUIRED",
        message: "HTTPS is required for HTTP/API triggers",
        correlationId,
      },
    };
  }

  const resolved = await resolveHttpTriggerByShortName(params.shortName);
  if (!resolved) {
    return {
      status: 404,
      correlationId,
      body: {
        success: false,
        code: "TRIGGER_NOT_FOUND",
        message: "No published HTTP/API trigger found for this endpoint",
        correlationId,
      },
    };
  }

  if (resolved.status === "revoked") {
    return {
      status: 403,
      correlationId,
      body: {
        success: false,
        code: "TRIGGER_REVOKED",
        message: "Trigger has been revoked",
        correlationId,
      },
    };
  }

  if (resolved.status === "suspended") {
    return {
      status: HTTP_TRIGGER_RESPONSE_CODES.suspended,
      correlationId,
      body: {
        success: false,
        code: "TRIGGER_SUSPENDED",
        message: "Trigger is suspended",
        correlationId,
      },
    };
  }

  if (resolved.status !== "active") {
    return {
      status: 403,
      correlationId,
      body: {
        success: false,
        code: "TRIGGER_INACTIVE",
        message: "Trigger is not active",
        correlationId,
      },
    };
  }

  const pathSegments = params.pathSegments || [];
  const validation = await validateHttpRequest(
    request as never,
    pathSegments,
    resolved.triggerId,
    resolved.config
  );

  if (!validation.valid) {
    await writeHttpTriggerAuditLog({
      triggerId: resolved.triggerId,
      orchestrationId: resolved.orchestrationId,
      status: "failed",
      payload: {
        correlationId,
        code: validation.code,
        method: request.method,
        path: request.nextUrl.pathname,
      },
      errorMessage: validation.message,
    });

    return {
      status: validation.status,
      correlationId,
      body: {
        success: false,
        code: validation.code,
        message: validation.message,
        details: validation.details,
        correlationId,
      },
    };
  }

  const authResult = authenticateHttpTriggerRequest({
    request: request as never,
    config: resolved.config,
    clientIp,
    bodyText: validation.bodyText,
  });

  if (!authResult.ok) {
    await writeHttpTriggerAuditLog({
      triggerId: resolved.triggerId,
      orchestrationId: resolved.orchestrationId,
      status: "failed",
      payload: {
        correlationId,
        code: authResult.code,
        method: request.method,
        path: request.nextUrl.pathname,
      },
      errorMessage: authResult.message,
      triggeredBy: authResult.principal || undefined,
    });

    return {
      status: authResult.status,
      correlationId,
      body: {
        success: false,
        code: authResult.code,
        message: authResult.message,
        correlationId,
      },
    };
  }

  if (resolved.config.rateLimit?.enabled) {
    const result = await enforceRateLimit({
      triggerId: resolved.triggerId,
      clientKey: authResult.principal || clientIp || "anonymous",
      maxRequests: Number(resolved.config.rateLimit.maxRequests || 60),
      windowSeconds: Number(resolved.config.rateLimit.windowSeconds || 60),
    });

    if (!result.allowed) {
      await writeHttpTriggerAuditLog({
        triggerId: resolved.triggerId,
        orchestrationId: resolved.orchestrationId,
        status: "failed",
        payload: {
          correlationId,
          code: "RATE_LIMITED",
          method: request.method,
          path: request.nextUrl.pathname,
        },
        errorMessage: "Rate limit exceeded",
        triggeredBy: authResult.principal || undefined,
      });

      return {
        status: HTTP_TRIGGER_RESPONSE_CODES.rateLimited,
        correlationId,
        body: {
          success: false,
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
          correlationId,
        },
      };
    }
  }

  const redactedHeaders = redactHeaders(validation.headers);

  await writeHttpTriggerAuditLog({
    triggerId: resolved.triggerId,
    orchestrationId: resolved.orchestrationId,
    status: "received",
    payload: {
      correlationId,
      request: {
        method: request.method,
        path: request.nextUrl.pathname,
        query: validation.query,
        pathParameters: validation.pathParameters,
        headers: redactedHeaders,
        contentType: validation.contentType,
        payloadSize: validation.payloadSize,
      },
    },
    triggeredBy: authResult.principal || undefined,
  });

  const execution = await dispatchHttpTrigger({
    triggerId: resolved.triggerId,
    orchestrationId: resolved.orchestrationId,
    orchestrationVersion: resolved.orchestrationVersion,
    config: resolved.config,
    correlationId,
    authType: authResult.authType || "none",
    principal: authResult.principal || null,
    requestContext: {
      url: request.nextUrl.toString(),
      method: request.method,
      headers: redactedHeaders,
      query: validation.query,
      pathParameters: validation.pathParameters,
      body: validation.bodyJson,
      bodyRaw: validation.bodyText,
      contentType: validation.contentType,
      payloadSize: validation.payloadSize,
      clientIp,
    },
  });

  await writeHttpTriggerAuditLog({
    triggerId: resolved.triggerId,
    orchestrationId: resolved.orchestrationId,
    executionId: execution.id,
    status: "validated",
    payload: {
      correlationId,
      authType: authResult.authType,
      principal: authResult.principal,
    },
    triggeredBy: authResult.principal || undefined,
  });

  await writeHttpTriggerAuditLog({
    triggerId: resolved.triggerId,
    orchestrationId: resolved.orchestrationId,
    executionId: execution.id,
    status: "started",
    payload: {
      correlationId,
      executionId: execution.id,
    },
    triggeredBy: authResult.principal || undefined,
  });

  return {
    status: HTTP_TRIGGER_RESPONSE_CODES.successAccepted,
    correlationId,
    body: {
      success: true,
      code: "TRIGGER_ACCEPTED",
      message: "Trigger accepted and orchestration execution started",
      executionId: execution.id,
      correlationId,
    },
  };
}

const server = http.createServer(async (incoming, response) => {
  const method = (incoming.method || "GET").toUpperCase();
  const url = new URL(incoming.url || "/", `http://${incoming.headers.host || "localhost"}`);

  if (url.pathname === "/health") {
    return sendJson(response, 200, { ok: true, service: "http-trigger-api" });
  }

  if (method === "OPTIONS") {
    response.statusCode = 204;
    response.setHeader("allow", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
    response.end();
    return;
  }

  const params = splitPathSegments(url.pathname);
  if (!params) {
    return sendJson(response, 404, { message: "Not found." });
  }

  try {
    const rawBody = await readRawBody(incoming);
    const requestLike: RequestLike = {
      method,
      headers: new Headers(incoming.headers as Record<string, string>),
      nextUrl: url,
      text: async () => rawBody,
    };

    const result = await handle(requestLike, params);

    if (method === "HEAD") {
      response.statusCode = result.status;
      response.setHeader("x-correlation-id", result.correlationId);
      response.end();
      return;
    }

    return sendJson(response, result.status, result.body, result.correlationId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    return sendJson(response, 500, { success: false, message });
  }
});

server.listen(port, host, () => {
  console.log(`[http-trigger-api] listening on http://${host}:${port}`);
});
