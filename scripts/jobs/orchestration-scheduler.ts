// Orchestration scheduler worker entrypoint.
// Uses the shared scheduler service (node-cron engine by default) to keep
// schedule trigger registration and execution behavior consistent with API flows.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getSchedulerService } from "../../lib/orchestrations/scheduler-service";

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

  console.log("\n" + "=".repeat(80));
  console.log("Orchestration Scheduler Worker Starting");
  console.log("=".repeat(80));
  console.log(`Started at: ${new Date().toISOString()}`);

  await scheduler.initialize();

  console.log(`[SchedulerWorker] Engine: ${scheduler.getEngineName()}`);
  console.log("[SchedulerWorker] Running. Press Ctrl+C to stop.\n");

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[SchedulerWorker] Received ${signal}, shutting down...`);
    try {
      await scheduler.shutdown();
      console.log("[SchedulerWorker] Shutdown complete");
      process.exit(0);
    } catch (error) {
      console.error("[SchedulerWorker] Shutdown failed:", error);
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
  console.error("[SchedulerWorker] Fatal error:", error);
  process.exit(1);
});
