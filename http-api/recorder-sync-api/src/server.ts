import http from "node:http";
import { URL } from "node:url";
import { appendRecordedActionByToken, GuidedWorkflowError } from "@/lib/admin/guided-workflows";
import { getPool, resetPool } from "@/lib/db/pool";
import type { RecordedAction, RecordedActionType } from "@/shared/guideTypes";

const host = process.env.RECORDER_SYNC_API_HOST || "0.0.0.0";
const port = Number(process.env.RECORDER_SYNC_API_PORT || 4301);
const recordedActionTypes = new Set<RecordedActionType>(["click", "input", "navigation", "submit", "change", "manual-select"]);
const MAX_BODY_BYTES = 256 * 1024;

class PayloadTooLargeError extends Error {}

function isRecordedAction(value: unknown): value is RecordedAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Record<string, unknown>;
  return typeof action.id === "string"
    && typeof action.type === "string"
    && recordedActionTypes.has(action.type as RecordedActionType)
    && typeof action.url === "string"
    && typeof action.timestamp === "number"
    && Number.isFinite(action.timestamp);
}

function setCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = request.headers.origin || "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

function sendJson(request: http.IncomingMessage, response: http.ServerResponse, status: number, body: unknown) {
  setCorsHeaders(request, response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_BODY_BYTES) {
      throw new PayloadTooLargeError("Request body is too large.");
    }

    chunks.push(buffer);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function isDatabaseHealthy() {
  try {
    await getPool().query("SELECT 1");
    return true;
  } catch (error) {
    console.error("[recorder-sync-api] Database health check failed", error);
    return false;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const method = request.method?.toUpperCase() || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      const healthy = await isDatabaseHealthy();
      return sendJson(request, response, healthy ? 200 : 503, { ok: healthy, service: "recorder-sync-api" });
    }

    if (url.pathname !== "/v1/recorder/actions") {
      return sendJson(request, response, 404, { message: "Not found." });
    }

    if (method === "OPTIONS") {
      setCorsHeaders(request, response);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method !== "POST") {
      return sendJson(request, response, 405, { message: "Method not allowed." });
    }

    let body: unknown;

    try {
      body = await readJsonBody(request);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        response.setHeader("Connection", "close");
        return sendJson(request, response, 413, { message: error.message });
      }
      throw error;
    }

    if (!body || typeof body !== "object") {
      return sendJson(request, response, 400, { message: "Recorder payload is required." });
    }

    const payload = body as Record<string, unknown>;
    if (!isRecordedAction(payload.action)) {
      return sendJson(request, response, 400, { message: "A valid recorded action is required." });
    }

    const result = await appendRecordedActionByToken(
      String(payload.recorderToken ?? payload.recorder_token ?? ""),
      payload.action,
      request.headers.origin
    );

    return sendJson(request, response, 200, result);
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return sendJson(request, response, error.statusCode, { message: error.message });
    }

    console.error("[recorder-sync-api] Unhandled request error", error);
    const message = error instanceof Error ? error.message : "Internal server error.";
    return sendJson(request, response, 500, { message });
  }
});

// Keep header/request timeouts short — this service only ever handles small, fast JSON writes.
server.headersTimeout = 8_000;
server.requestTimeout = 20_000;
server.keepAliveTimeout = 5_000;

server.on("error", (error) => {
  console.error("[recorder-sync-api] Server failed to start", error);
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`[recorder-sync-api] listening on http://${host}:${port}`);
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[recorder-sync-api] Received ${signal}, shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("[recorder-sync-api] Graceful shutdown timed out, forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  server.close(async (closeError) => {
    if (closeError) {
      console.error("[recorder-sync-api] Error closing server", closeError);
    }

    try {
      await resetPool();
    } catch (poolError) {
      console.error("[recorder-sync-api] Error closing database pool", poolError);
    }

    clearTimeout(forceExitTimer);
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("[recorder-sync-api] Unhandled promise rejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[recorder-sync-api] Uncaught exception", error);
  process.exit(1);
});
