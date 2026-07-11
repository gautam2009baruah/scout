import { NextRequest, NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";

function getClientIp(request: NextRequest): string | null {
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

function isHttpsRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === "https";
  }

  return request.nextUrl.protocol === "https:";
}

async function handle(request: NextRequest, params: { shortName: string; pathSegments?: string[] }) {
  const correlationId = newCorrelationId(request.headers.get("x-correlation-id"));
  const clientIp = getClientIp(request);

  if (!isHttpsRequest(request)) {
    return NextResponse.json(
      {
        success: false,
        code: "HTTPS_REQUIRED",
        message: "HTTPS is required for HTTP/API triggers",
        correlationId,
      },
      {
        status: 426,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  const resolved = await resolveHttpTriggerByShortName(params.shortName);
  if (!resolved) {
    return NextResponse.json(
      {
        success: false,
        code: "TRIGGER_NOT_FOUND",
        message: "No published HTTP/API trigger found for this endpoint",
        correlationId,
      },
      {
        status: 404,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  if (resolved.status === "revoked") {
    return NextResponse.json(
      {
        success: false,
        code: "TRIGGER_REVOKED",
        message: "Trigger has been revoked",
        correlationId,
      },
      {
        status: 403,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  if (resolved.status === "suspended") {
    return NextResponse.json(
      {
        success: false,
        code: "TRIGGER_SUSPENDED",
        message: "Trigger is suspended",
        correlationId,
      },
      {
        status: HTTP_TRIGGER_RESPONSE_CODES.suspended,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  if (resolved.status !== "active") {
    return NextResponse.json(
      {
        success: false,
        code: "TRIGGER_INACTIVE",
        message: "Trigger is not active",
        correlationId,
      },
      {
        status: 403,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  const pathSegments = params.pathSegments || [];
  const validation = await validateHttpRequest(request, pathSegments, resolved.triggerId, resolved.config);

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

    return NextResponse.json(
      {
        success: false,
        code: validation.code,
        message: validation.message,
        details: validation.details,
        correlationId,
      },
      {
        status: validation.status,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
  }

  const authResult = authenticateHttpTriggerRequest({
    request,
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

    return NextResponse.json(
      {
        success: false,
        code: authResult.code,
        message: authResult.message,
        correlationId,
      },
      {
        status: authResult.status,
        headers: {
          "x-correlation-id": correlationId,
        },
      }
    );
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

      return NextResponse.json(
        {
          success: false,
          code: "RATE_LIMITED",
          message: "Rate limit exceeded",
          correlationId,
        },
        {
          status: HTTP_TRIGGER_RESPONSE_CODES.rateLimited,
          headers: {
            "x-correlation-id": correlationId,
          },
        }
      );
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

  return NextResponse.json(
    {
      success: true,
      code: "TRIGGER_ACCEPTED",
      message: "Trigger accepted and orchestration execution started",
      executionId: execution.id,
      correlationId,
    },
    {
      status: HTTP_TRIGGER_RESPONSE_CODES.successAccepted,
      headers: {
        "x-correlation-id": correlationId,
      },
    }
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  return handle(request, await context.params);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  return handle(request, await context.params);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  return handle(request, await context.params);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  return handle(request, await context.params);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  return handle(request, await context.params);
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ shortName: string; pathSegments?: string[] }> }
) {
  const response = await handle(request, await context.params);
  return new NextResponse(null, { status: response.status, headers: response.headers });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "allow": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
    },
  });
}
