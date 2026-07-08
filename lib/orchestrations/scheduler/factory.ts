// Scheduler Engine Factory
// Creates appropriate scheduler engine based on environment variable
// Supports easy switching between node-cron and Bull Queue

import type { ISchedulerEngine, ScheduleCallback } from "./types";
import { NodeCronEngine } from "./node-cron-engine";

// Future: Import BullEngine when implemented
// import { BullEngine } from "./bull-engine";

export type SchedulerEngineType = "node-cron" | "bull";

/**
 * Create scheduler engine based on environment variable
 * Default: node-cron (simpler, no external dependencies)
 * 
 * Set SCHEDULER_ENGINE=bull to use Bull Queue (requires Redis)
 */
export function createSchedulerEngine(callback: ScheduleCallback): ISchedulerEngine {
  const engineType = (process.env.SCHEDULER_ENGINE || "node-cron") as SchedulerEngineType;

  console.log(`[SchedulerFactory] Creating scheduler engine: ${engineType}`);

  switch (engineType) {
    case "node-cron":
      return new NodeCronEngine(callback);

    case "bull":
      // Future implementation
      // if (!process.env.REDIS_URL) {
      //   throw new Error("REDIS_URL is required for Bull Queue engine");
      // }
      // return new BullEngine(callback, process.env.REDIS_URL);
      throw new Error("Bull Queue engine not yet implemented. Use SCHEDULER_ENGINE=node-cron");

    default:
      console.warn(`[SchedulerFactory] Unknown engine type: ${engineType}, defaulting to node-cron`);
      return new NodeCronEngine(callback);
  }
}

/**
 * Get current scheduler engine type from environment
 */
export function getSchedulerEngineType(): SchedulerEngineType {
  return (process.env.SCHEDULER_ENGINE || "node-cron") as SchedulerEngineType;
}
