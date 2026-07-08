// Node-Cron Engine Implementation
// In-process scheduler using node-cron library

import cron from "node-cron";
import type {
  ISchedulerEngine,
  ScheduledTrigger,
  ScheduleCallback,
  ScheduleExecutionResult,
} from "./types";
import {
  configToCronExpression,
  validateCronExpression,
  isScheduleActive,
  getScheduleDescription,
} from "./cron-utils";

/**
 * node-cron implementation of ISchedulerEngine
 * Runs in-process, suitable for single-server deployments
 */
export class NodeCronEngine implements ISchedulerEngine {
  private schedules: Map<string, cron.ScheduledTask> = new Map();
  private triggers: Map<string, ScheduledTrigger> = new Map();
  private callback: ScheduleCallback;
  private isInitialized: boolean = false;

  constructor(callback: ScheduleCallback) {
    this.callback = callback;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("[NodeCronEngine] Already initialized");
      return;
    }

    console.log("[NodeCronEngine] Initializing...");
    this.isInitialized = true;
    console.log("[NodeCronEngine] Ready");
  }

  async registerTrigger(trigger: ScheduledTrigger): Promise<boolean> {
    try {
      // Check if already registered
      if (this.schedules.has(trigger.id)) {
        console.warn(`[NodeCronEngine] Trigger ${trigger.id} already registered, updating instead`);
        await this.updateTrigger(trigger.id, trigger);
        return true;
      }

      // Check if schedule is active
      if (!isScheduleActive(trigger.config)) {
        console.log(`[NodeCronEngine] Skipping inactive trigger ${trigger.id}`);
        return false;
      }

      // Handle one-time schedules differently
      if (trigger.config.scheduleType === "one-time") {
        return this.registerOneTimeSchedule(trigger);
      }

      // Convert config to cron expression
      const cronExpression = configToCronExpression(trigger.config);

      // Validate cron expression
      const validation = validateCronExpression(cronExpression);
      if (!validation.valid) {
        console.error(`[NodeCronEngine] Invalid cron expression for trigger ${trigger.id}: ${validation.error}`);
        return false;
      }

      console.log(
        `[NodeCronEngine] Registering trigger ${trigger.id} (${trigger.name}): ${cronExpression}`
      );
      console.log(`  Schedule: ${getScheduleDescription(trigger.config)}`);
      console.log(`  Timezone: ${trigger.config.timezone}`);

      // Create cron schedule
      const schedule = cron.schedule(
        cronExpression,
        async () => {
          await this.executeSchedule(trigger);
        },
        {
          scheduled: true,
          timezone: trigger.config.timezone || "UTC",
        }
      );

      // Store schedule and trigger
      this.schedules.set(trigger.id, schedule);
      this.triggers.set(trigger.id, trigger);

      console.log(`[NodeCronEngine] ✅ Successfully registered trigger ${trigger.id}`);
      return true;
    } catch (error) {
      console.error(`[NodeCronEngine] Error registering trigger ${trigger.id}:`, error);
      return false;
    }
  }

  private registerOneTimeSchedule(trigger: ScheduledTrigger): boolean {
    if (!trigger.config.oneTimeDate) {
      console.error(`[NodeCronEngine] One-time trigger ${trigger.id} missing oneTimeDate`);
      return false;
    }

    const scheduledTime = new Date(trigger.config.oneTimeDate);
    const now = new Date();

    if (scheduledTime <= now) {
      console.log(`[NodeCronEngine] One-time trigger ${trigger.id} scheduled time has passed`);
      return false;
    }

    const delayMs = scheduledTime.getTime() - now.getTime();

    console.log(
      `[NodeCronEngine] Registering one-time trigger ${trigger.id} (${trigger.name})`
    );
    console.log(`  Scheduled for: ${scheduledTime.toISOString()}`);
    console.log(`  Delay: ${Math.round(delayMs / 1000)} seconds`);

    // Use setTimeout for one-time execution
    const timeout = setTimeout(async () => {
      await this.executeSchedule(trigger);
      // Clean up after execution
      this.schedules.delete(trigger.id);
      this.triggers.delete(trigger.id);
    }, delayMs);

    // Store timeout as a "schedule" for consistent management
    this.schedules.set(trigger.id, {
      stop: () => clearTimeout(timeout),
      start: () => {}, // No-op for timeout
    } as any);
    this.triggers.set(trigger.id, trigger);

    return true;
  }

  async updateTrigger(triggerId: string, trigger: ScheduledTrigger): Promise<boolean> {
    console.log(`[NodeCronEngine] Updating trigger ${triggerId}`);

    // Remove existing schedule
    await this.removeTrigger(triggerId);

    // Register new schedule
    return this.registerTrigger(trigger);
  }

  async removeTrigger(triggerId: string): Promise<boolean> {
    const schedule = this.schedules.get(triggerId);
    
    if (!schedule) {
      console.warn(`[NodeCronEngine] Trigger ${triggerId} not found`);
      return false;
    }

    console.log(`[NodeCronEngine] Removing trigger ${triggerId}`);
    
    // Stop the schedule
    schedule.stop();
    
    // Remove from maps
    this.schedules.delete(triggerId);
    this.triggers.delete(triggerId);

    console.log(`[NodeCronEngine] ✅ Removed trigger ${triggerId}`);
    return true;
  }

  async enableTrigger(triggerId: string): Promise<boolean> {
    const trigger = this.triggers.get(triggerId);
    
    if (!trigger) {
      console.warn(`[NodeCronEngine] Trigger ${triggerId} not found`);
      return false;
    }

    // Update config to enabled
    trigger.config.enabled = true;

    // Re-register to start the schedule
    return this.registerTrigger(trigger);
  }

  async disableTrigger(triggerId: string): Promise<boolean> {
    const schedule = this.schedules.get(triggerId);
    const trigger = this.triggers.get(triggerId);
    
    if (!schedule || !trigger) {
      console.warn(`[NodeCronEngine] Trigger ${triggerId} not found`);
      return false;
    }

    console.log(`[NodeCronEngine] Disabling trigger ${triggerId}`);
    
    // Stop the schedule but keep trigger info
    schedule.stop();
    trigger.config.enabled = false;

    console.log(`[NodeCronEngine] ✅ Disabled trigger ${triggerId}`);
    return true;
  }

  getRegisteredTriggers(): string[] {
    return Array.from(this.schedules.keys());
  }

  async shutdown(): Promise<void> {
    console.log("[NodeCronEngine] Shutting down...");
    
    // Stop all schedules
    for (const [triggerId, schedule] of this.schedules.entries()) {
      console.log(`  Stopping trigger ${triggerId}`);
      schedule.stop();
    }

    // Clear maps
    this.schedules.clear();
    this.triggers.clear();

    this.isInitialized = false;
    console.log("[NodeCronEngine] Shutdown complete");
  }

  getEngineName(): string {
    return "node-cron";
  }

  private async executeSchedule(trigger: ScheduledTrigger): Promise<void> {
    const triggeredAt = new Date().toISOString();

    console.log("\n" + "=".repeat(80));
    console.log(`⏰ SCHEDULE FIRED: ${trigger.name} (${trigger.id})`);
    console.log(`   Triggered at: ${triggeredAt}`);
    console.log(`   Orchestration: ${trigger.orchestrationId}`);
    console.log("=".repeat(80));

    try {
      // Execute the callback
      const result: ScheduleExecutionResult = await this.callback(trigger);

      if (result.success) {
        console.log(`✅ Schedule executed successfully`);
        console.log(`   Execution ID: ${result.executionId}`);
      } else {
        console.error(`❌ Schedule execution failed: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Error executing schedule:`, error);
    }

    console.log("=".repeat(80) + "\n");
  }
}
