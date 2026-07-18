import { createServer } from "node:http";
import { loadConfig } from "./config.js";
import { createDatabaseAdapter } from "./database.js";
import type { ExecuteSqlRequest } from "./types.js";

const config = loadConfig();
const adapter = createDatabaseAdapter(config);

function sendJson(response: import("node:http").ServerResponse, statusCode: number, payload: unknown) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  response.end(JSON.stringify(payload));
}

function readBody(request: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function isSqlSafe(sqlText: string) {
  return String(sqlText || "").trim().length > 0;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true, service: "scout-database-executor" });
    return;
  }

  if (request.method === "GET" && url.pathname === "/ready") {
    try {
      await adapter.query("SELECT 1 AS ready_check");
      sendJson(response, 200, { ok: true, databaseType: config.databaseType });
    } catch (error) {
      sendJson(response, 503, { ok: false, message: error instanceof Error ? error.message : "Database unavailable." });
    }
    return;
  }

  if (request.method === "GET" && url.pathname === "/v1/database/metadata") {
    try {
      const metadata = await adapter.metadata();
      sendJson(response, 200, metadata);
    } catch (error) {
      sendJson(response, 500, { message: error instanceof Error ? error.message : "Unable to load database metadata." });
    }
    return;
  }

  if (request.method === "POST" && url.pathname === "/v1/sql/execute") {
    try {
      const bodyText = await readBody(request);
      const payload = (bodyText ? JSON.parse(bodyText) : {}) as ExecuteSqlRequest;
      const sqlText = String(payload.sql || "").trim();

      if (!isSqlSafe(sqlText)) {
        sendJson(response, 400, { message: "sql is required." });
        return;
      }

      const startedAt = Date.now();
      const result = await adapter.query(sqlText);

      sendJson(response, 200, {
        ok: true,
        databaseType: config.databaseType,
        databaseName: config.databaseName,
        durationMs: Date.now() - startedAt,
        rowCount: result.rowCount,
        columns: result.columns,
        rows: result.rows,
      });
    } catch (error) {
      sendJson(response, 400, { message: error instanceof Error ? error.message : "Unable to execute SQL." });
    }
    return;
  }

  sendJson(response, 404, { message: "Not found." });
});

server.listen(config.port, config.host, () => {
  console.log(`Scout Database Executor listening on http://${config.host}:${config.port}`);
});

async function shutdown(signal: NodeJS.Signals) {
  console.log(`Received ${signal}, shutting down database executor...`);
  server.close(() => process.exit(0));
  await adapter.close().catch(() => undefined);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
