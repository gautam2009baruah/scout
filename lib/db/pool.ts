import { Pool } from "pg";
import { getDatabaseConfig } from "@/lib/config/database";

declare global {
  var scoutPgPool: Pool | undefined;
}

function createPool() {
  const pool = new Pool({
    connectionString: getDatabaseConfig().url,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    statement_timeout: 30000
  });

  pool.on("error", (error) => {
    console.error("Unexpected Postgres pool error", error);
  });

  return pool;
}

export function getPool() {
  if (!globalThis.scoutPgPool) {
    globalThis.scoutPgPool = createPool();
  }

  return globalThis.scoutPgPool;
}

export async function resetPool() {
  if (globalThis.scoutPgPool) {
    const pool = globalThis.scoutPgPool;
    globalThis.scoutPgPool = undefined;
    await pool.end();
  }
}

function isRetryablePostgresError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; errno?: number; message?: string };
  const code = candidate.code?.toUpperCase();
  const message = candidate.message ?? "";

  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "08006" ||
    code === "08001" ||
    code === "08004" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03" ||
    candidate.errno === -4077 ||
    /socket|terminated unexpectedly|connection.*reset|connection.*closed/i.test(message)
  );
}

export async function withPoolRetry<T>(operation: () => Promise<T>, retries = 2) {
  let attempt = 0;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      attempt += 1;

      if (attempt > retries || !isRetryablePostgresError(error)) {
        throw error;
      }

      await resetPool();
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
}
