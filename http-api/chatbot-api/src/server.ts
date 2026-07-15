import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { getEffectiveChatbotLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import { answerChatQuery, ChatQueryError } from "@/lib/chat/query";
import { getPool } from "@/lib/db/pool";
import { CompanyApiKeyAuthorizer } from "./auth";
import { getApiConfig } from "./config";
import { InMemoryRateLimiter } from "./rate-limit";
import { TenantResolver } from "./tenant-resolution";

type ChatQueryBody = {
  companyName?: string;
  targetAppName?: string;
  environment?: string;
  userId?: string;
  question?: string;
  conversationId?: string;
  topK?: number;
};

const config = getApiConfig();
const tenantResolver = new TenantResolver(config.companyCacheTtlMs, config.targetAppCacheTtlMs);
const authorizer = new CompanyApiKeyAuthorizer(config.authCacheTtlMs, config.legacyApiKey);
const rateLimiter = new InMemoryRateLimiter(config.rateLimitWindowMs, config.rateLimitMaxRequests);

function corsHeaders(origin: string | undefined) {
  const allowAny = config.allowedOrigins.includes("*");
  const allowOrigin = allowAny
    ? "*"
    : origin && config.allowedOrigins.includes(origin)
    ? origin
    : config.allowedOrigins[0] || "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-Request-Id",
    "Access-Control-Max-Age": "600"
  };
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  requestId: string,
  origin: string | undefined,
  extraHeaders: Record<string, string> = {}
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "X-Request-Id": requestId,
    ...corsHeaders(origin),
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function getClientIp(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
}

function rateLimitHeaders(remaining: number, resetAt: number) {
  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(Math.floor(resetAt / 1000))
  };
}

function parseBody(request: IncomingMessage): Promise<ChatQueryBody> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;

    request.on("data", (chunk: Buffer) => {
      received += chunk.length;
      if (received > config.requestBodyLimitBytes) {
        reject(new Error(`Request body exceeds limit (${config.requestBodyLimitBytes} bytes).`));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ChatQueryBody;
        resolve(parsed);
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

async function handleChatQuery(
  response: ServerResponse,
  requestId: string,
  origin: string | undefined,
  body: ChatQueryBody,
  context: {
    company: { id: string; name: string };
    targetApp: { id: string; name: string } | null;
  },
  extraHeaders: Record<string, string>
) {
  const userId = String(body.userId || "").trim();
  const question = String(body.question || "").trim();
  const conversationId = String(body.conversationId || "").trim();

  if (!userId || !question) {
    sendJson(
      response,
      400,
      { message: "userId and question are required." },
      requestId,
      origin,
      extraHeaders
    );
    return;
  }

  const startedAt = Date.now();
  const result = await answerChatQuery({
    company_id: context.company.id,
    user_id: userId,
    target_app_id: context.targetApp?.id,
    question,
    conversation_id: conversationId || undefined,
    top_k: typeof body.topK === "number" ? body.topK : undefined
  });

  sendJson(
    response,
    200,
    {
      requestId,
      company: { id: context.company.id, name: context.company.name },
      targetApp: context.targetApp ? { id: context.targetApp.id, name: context.targetApp.name } : null,
      timingMs: Date.now() - startedAt,
      result
    },
    requestId,
    origin,
    extraHeaders
  );
}

async function handleChatSettings(
  response: ServerResponse,
  requestId: string,
  origin: string | undefined,
  context: {
    company: { id: string; name: string };
    targetApp: { id: string; name: string } | null;
  },
  extraHeaders: Record<string, string>
) {
  const settings = await getEffectiveChatbotLifecycleSettings(context.company.id, context.targetApp?.id);

  sendJson(
    response,
    200,
    {
      requestId,
      company: { id: context.company.id, name: context.company.name },
      targetApp: context.targetApp ? { id: context.targetApp.id, name: context.targetApp.name } : null,
      settings
    },
    requestId,
    origin,
    extraHeaders
  );
}

const server = createServer(async (request, response) => {
  const requestId = String(request.headers["x-request-id"] || randomUUID());
  const origin = typeof request.headers.origin === "string" ? request.headers.origin : undefined;

  try {
    if (!request.url || !request.method) {
      sendJson(response, 400, { message: "Invalid request." }, requestId, origin);
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "X-Request-Id": requestId,
        ...corsHeaders(origin)
      });
      response.end();
      return;
    }

    if (url.pathname === "/health" && request.method === "GET") {
      sendJson(response, 200, { ok: true, service: "chatbot-api" }, requestId, origin);
      return;
    }

    if (url.pathname === "/ready" && request.method === "GET") {
      await getPool().query("SELECT 1");
      sendJson(response, 200, { ok: true, ready: true }, requestId, origin);
      return;
    }

    const isProtectedRoute = url.pathname.startsWith("/v1/");

    let parsedBody: ChatQueryBody | null = null;
    let companyContext: { id: string; name: string } | null = null;
    let targetAppContext: { id: string; name: string } | null = null;
    let authHeaders: Record<string, string> = {};

    if (isProtectedRoute) {
      parsedBody = await parseBody(request);

      const companyName = String(parsedBody.companyName || "").trim();
      const targetAppName = String(parsedBody.targetAppName || "").trim();

      if (!companyName) {
        sendJson(response, 400, { message: "companyName is required." }, requestId, origin);
        return;
      }

      companyContext = await tenantResolver.resolveCompanyByName(companyName);
      targetAppContext = await tenantResolver.resolveTargetAppByName(companyContext.id, targetAppName);

      const requestedEnvironment = String(
        parsedBody.environment || request.headers["x-scout-environment"] || ""
      ).trim();

      const auth = await authorizer.authenticate(
        request,
        companyContext.id,
        requestedEnvironment,
        targetAppContext?.id ?? null
      );
      if (!auth.ok) {
        sendJson(response, 401, { message: auth.error || "Unauthorized." }, requestId, origin);
        return;
      }

      const rateKey = `${auth.apiKeyId || auth.source || "unknown"}:${getClientIp(request)}:${url.pathname}`;
      const rate = rateLimiter.check(rateKey);
      authHeaders = rateLimitHeaders(rate.remaining, rate.resetAt);

      if (!rate.allowed) {
        sendJson(
          response,
          429,
          { message: "Rate limit exceeded for this API key. Try again later." },
          requestId,
          origin,
          authHeaders
        );
        return;
      }
    }

    if (url.pathname === "/v1/context/resolve" && request.method === "POST") {
      if (!companyContext) {
        sendJson(response, 500, { message: "Company context was not resolved." }, requestId, origin, authHeaders);
        return;
      }

      sendJson(
        response,
        200,
        {
          company: { id: companyContext.id, name: companyContext.name },
          targetApp: targetAppContext ? { id: targetAppContext.id, name: targetAppContext.name } : null
        },
        requestId,
        origin,
        authHeaders
      );
      return;
    }

    if (url.pathname === "/v1/chat/settings" && request.method === "POST") {
      if (!companyContext) {
        sendJson(response, 500, { message: "Company context was not resolved." }, requestId, origin, authHeaders);
        return;
      }

      await handleChatSettings(
        response,
        requestId,
        origin,
        {
          company: companyContext,
          targetApp: targetAppContext
        },
        authHeaders
      );
      return;
    }

    if (url.pathname === "/v1/chat/query" && request.method === "POST") {
      if (!parsedBody || !companyContext) {
        sendJson(response, 500, { message: "Request context is missing." }, requestId, origin, authHeaders);
        return;
      }

      await handleChatQuery(
        response,
        requestId,
        origin,
        parsedBody,
        {
          company: companyContext,
          targetApp: targetAppContext
        },
        authHeaders
      );
      return;
    }

    sendJson(response, 404, { message: "Route not found." }, requestId, origin);
  } catch (error) {
    if (error instanceof ChatQueryError) {
      sendJson(response, error.statusCode, { message: error.message }, requestId, origin);
      return;
    }

    sendJson(
      response,
      500,
      { message: error instanceof Error ? error.message : "Unexpected server error." },
      requestId,
      origin
    );
  }
});

server.listen(config.port, config.host, () => {
  console.log(`[chatbot-api] listening on http://${config.host}:${config.port}`);
});
