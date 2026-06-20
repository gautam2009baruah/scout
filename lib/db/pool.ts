import { Pool } from "pg";
import { getDatabaseConfig } from "@/lib/config/database";

declare global {
  var scoutPgPool: Pool | undefined;
}

export function getPool() {
  if (!globalThis.scoutPgPool) {
    globalThis.scoutPgPool = new Pool({
      connectionString: getDatabaseConfig().url
    });
  }

  return globalThis.scoutPgPool;
}
