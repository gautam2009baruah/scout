// Scheduler Engine Interface
// Abstraction layer that supports both node-cron and Bull Queue implementations

import type { ScheduleTriggerConfig } from "@/shared/orchestrationTypes";

/**
 * Represents a scheduled trigger loaded from database
 */
export type ScheduledTrigger = {
  id: string;
  orchestrationId: string;
  name: string;
  config: ScheduleTriggerConfig;
  status: "active" | "inactive" | "error";
  lastTriggeredAt: string | null;
  nextRunAt: string | null;
};

/**
 * Result of schedule execution
 */
export type ScheduleExecutionResult = {
  success: boolean;
  executionId?: string;
  error?: string;
  triggeredAt: string;
};

/**
 * Scheduler engine interface - both node-cron and Bull must implement this
 */
export interface ISchedulerEngine {
  /**
   * Initialize the scheduler engine
   */
  initialize(): Promise<void>;

  /**
   * Register a new schedule trigger
   * @param trigger - The trigger configuration from database
   * @returns true if successfully registered
   */
  registerTrigger(trigger: ScheduledTrigger): Promise<boolean>;

  /**
   * Update an existing schedule trigger
   * @param triggerId - ID of trigger to update
   * @param trigger - Updated trigger configuration
   * @returns true if successfully updated
   */
  updateTrigger(triggerId: string, trigger: ScheduledTrigger): Promise<boolean>;

  /**
   * Remove a schedule trigger
   * @param triggerId - ID of trigger to remove
   * @returns true if successfully removed
   */
  removeTrigger(triggerId: string): Promise<boolean>;

  /**
   * Enable a previously disabled trigger
   * @param triggerId - ID of trigger to enable
   * @returns true if successfully enabled
   */
  enableTrigger(triggerId: string): Promise<boolean>;

  /**
   * Disable a trigger without removing it
   * @param triggerId - ID of trigger to disable
   * @returns true if successfully disabled
   */
  disableTrigger(triggerId: string): Promise<boolean>;

  /**
   * Get all registered triggers
   * @returns Array of trigger IDs currently registered
   */
  getRegisteredTriggers(): string[];

  /**
   * Gracefully shutdown the scheduler
   * Waits for in-progress jobs to complete
   */
  shutdown(): Promise<void>;

  /**
   * Get scheduler engine name
   */
  getEngineName(): string;
}

/**
 * Callback function executed when schedule fires
 */
export type ScheduleCallback = (trigger: ScheduledTrigger) => Promise<ScheduleExecutionResult>;
