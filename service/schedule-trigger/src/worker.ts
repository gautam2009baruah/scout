// Orchestration scheduler worker entrypoint.
// Uses the shared scheduler service (node-cron engine by default) to keep
// schedule trigger registration and execution behavior consistent with API flows.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchedulerService } from "../../../lib/orchestrations/scheduler-service";
import { createLogger } from "../../../lib/logging/logger";

const log = createLogger("schedule-trigger");

let shuttingDown = false;

function loadEnvFiles() {
  const envFiles = [".env.local", ".env"];

  for (const fileName of envFiles) {
    const filePath = join(process.cwd(), fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

async function start() {
  loadEnvFiles();

  const scheduler = getSchedulerService();

  log.info("scheduler worker starting", { startedAt: new Date().toISOString() });

  await scheduler.initialize();

  log.info("scheduler running", { engine: scheduler.getEngineName() });

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("shutting down", { signal });
    try {
      await scheduler.shutdown();
      log.info("shutdown complete");
      process.exit(0);
    } catch (error) {
      log.error("shutdown failed", { err: error });
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
}

void start().catch((error) => {
  log.error("fatal error", { err: error });
  process.exit(1);
});
