// Orchestration Scheduler Service
// Main service that initializes and manages the scheduler engine
// Called by worker process

import { getPool } from "@/lib/db/pool";
import { createSchedulerEngine } from "./scheduler/factory";
import type { ScheduledTrigger, ScheduleExecutionResult } from "./scheduler/types";
import { calculateNextRunTime } from "./scheduler/cron-utils";

export class OrchestrationSchedulerService {
  private engine: ReturnType<typeof createSchedulerEngine> | null = null;
  private isInitialized: boolean = false;
  private reloadInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the scheduler service
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log("[SchedulerService] Already initialized");
      return;
    }

    console.log("[SchedulerService] Initializing...");

    // Create scheduler engine (node-cron or Bull based on env)
    this.engine = createSchedulerEngine(this.executeOrchestration.bind(this));

    // Initialize the engine
    await this.engine.initialize();

    // Load all active triggers
    await this.loadAndRegisterTriggers();

    // Set up periodic reload (to pick up new/updated triggers)
    const reloadIntervalMs = parseInt(process.env.SCHEDULER_RELOAD_INTERVAL_MS || "300000"); // 5 minutes
    this.reloadInterval = setInterval(() => {
      this.reloadTriggers();
    }, reloadIntervalMs);

    this.isInitialized = true;
    console.log("[SchedulerService] ✅ Initialized successfully");
  }

  /**
   * Load all active schedule triggers from database and register with engine
   */
  private async loadAndRegisterTriggers(): Promise<void> {
    console.log("\n[SchedulerService] Loading triggers from database...");

    const pool = getPool();

    try {
      const result = await pool.query<{
        id: string;
        orchestration_id: string;
        name: string;
        config: any;
        status: string;
        last_triggered_at: Date | null;
      }>(
        `SELECT 
          t.id,
          t.orchestration_id,
          t.name,
          t.config,
          t.status,
          t.last_triggered_at
         FROM orchestration_triggers t
         INNER JOIN orchestrations o ON t.orchestration_id = o.id
         WHERE t.trigger_type = 'schedule'
         AND t.status = 'active'
         AND o.status = 'published'
         ORDER BY t.created_at ASC`
      );

      const triggers: ScheduledTrigger[] = result.rows.map((row) => ({
        id: row.id,
        orchestrationId: row.orchestration_id,
        name: row.name,
        config: row.config,
        status: row.status as "active" | "inactive" | "error",
        lastTriggeredAt: row.last_triggered_at?.toISOString() || null,
        nextRunAt: calculateNextRunTime(row.config) || null,
      }));

      console.log(`[SchedulerService] Found ${triggers.length} active schedule trigger(s)`);

      // Register each trigger with the engine
      let registered = 0;
      for (const trigger of triggers) {
        const success = await this.engine!.registerTrigger(trigger);
        if (success) {
          registered++;
        }
      }

      console.log(`[SchedulerService] ✅ Registered ${registered}/${triggers.length} trigger(s)\n`);
    } catch (error) {
      console.error("[SchedulerService] Error loading triggers:", error);
      throw error;
    }
  }

  /**
   * Reload triggers (check for new/updated/deleted schedules)
   */
  private async reloadTriggers(): Promise<void> {
    console.log("[SchedulerService] Reloading triggers...");

    try {
      // Get current registered triggers
      const registered = this.engine!.getRegisteredTriggers();

      // Load triggers from database
      const pool = getPool();
      const result = await pool.query<{ id: string }>(
        `SELECT t.id
         FROM orchestration_triggers t
         INNER JOIN orchestrations o ON t.orchestration_id = o.id
         WHERE t.trigger_type = 'schedule'
         AND t.status = 'active'
         AND o.status = 'published'`
      );

      const dbTriggerIds = new Set(result.rows.map((r) => r.id));

      // Remove triggers that no longer exist in database
      for (const triggerId of registered) {
        if (!dbTriggerIds.has(triggerId)) {
          console.log(`[SchedulerService] Removing deleted trigger: ${triggerId}`);
          await this.engine!.removeTrigger(triggerId);
        }
      }

      // Reload all triggers to pick up updates
      await this.loadAndRegisterTriggers();

      console.log("[SchedulerService] Reload complete");
    } catch (error) {
      console.error("[SchedulerService] Error reloading triggers:", error);
    }
  }

  /**
   * Register or update a single schedule trigger with the active engine.
   */
  async registerTrigger(trigger: ScheduledTrigger): Promise<boolean> {
    await this.initialize();
    return this.engine!.registerTrigger(trigger);
  }

  /**
   * Enable a trigger by loading its current database config and registering it.
   */
  async enableTrigger(triggerId: string): Promise<boolean> {
    await this.initialize();

    const trigger = await this.getScheduledTrigger(triggerId);
    if (!trigger) {
      console.warn(`[SchedulerService] Trigger ${triggerId} not found or orchestration not published`);
      return false;
    }

    trigger.config.enabled = true;
    trigger.status = "active";
    return this.engine!.registerTrigger(trigger);
  }

  /**
   * Disable a trigger in the active engine. Missing in-memory triggers are already inactive.
   */
  async disableTrigger(triggerId: string): Promise<boolean> {
    await this.initialize();

    const disabled = await this.engine!.disableTrigger(triggerId);
    if (!disabled) {
      await this.engine!.removeTrigger(triggerId);
    }

    return true;
  }

  private async getScheduledTrigger(triggerId: string): Promise<ScheduledTrigger | null> {
    const pool = getPool();
    const result = await pool.query<{
      id: string;
      orchestration_id: string;
      name: string;
      config: any;
      status: string;
      last_triggered_at: Date | null;
    }>(
      `SELECT
        t.id,
        t.orchestration_id,
        t.name,
        t.config,
        t.status,
        t.last_triggered_at
       FROM orchestration_triggers t
       INNER JOIN orchestrations o ON t.orchestration_id = o.id
       WHERE t.id = $1
       AND t.trigger_type = 'schedule'
       AND o.status = 'published'
       LIMIT 1`,
      [triggerId]
    );

    if (result.rowCount === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      orchestrationId: row.orchestration_id,
      name: row.name,
      config: row.config,
      status: row.status as "active" | "inactive" | "error",
      lastTriggeredAt: row.last_triggered_at?.toISOString() || null,
      nextRunAt: calculateNextRunTime(row.config) || null,
    };
  }

  /**
   * Execute orchestration when schedule fires (callback from engine)
   */
  private async executeOrchestration(trigger: ScheduledTrigger): Promise<ScheduleExecutionResult> {
    const triggeredAt = new Date().toISOString();
    const pool = getPool();

    try {
      console.log(`[SchedulerService] Executing scheduled orchestration: ${trigger.orchestrationId}`);

      // Get orchestration details
      const orchResult = await pool.query<{
        id: string;
        version: number;
        company_id: string;
        name: string;
        variables: any;
      }>(
        `SELECT id, version, company_id, name, variables
         FROM orchestrations
         WHERE id = $1 AND status = 'published'`,
        [trigger.orchestrationId]
      );

      if (orchResult.rowCount === 0) {
        throw new Error("Orchestration not found or not published");
      }

      const orchestration = orchResult.rows[0];

      // Create execution record
      const execResult = await pool.query<{ id: string }>(
        `INSERT INTO orchestration_executions
         (orchestration_id, orchestration_version, company_id, status, context, triggered_by, started_at)
         VALUES ($1, $2, $3, 'running', $4, $5, NOW())
         RETURNING id`,
        [
          orchestration.id,
          orchestration.version,
          orchestration.company_id,
          JSON.stringify({
            trigger: {
              type: "schedule",
              triggerId: trigger.id,
              triggerName: trigger.name,
              scheduledTime: triggeredAt,
              scheduleType: trigger.config.scheduleType,
            },
            variables: {},
          }),
          `schedule:${trigger.id}`,
        ]
      );

      const executionId = execResult.rows[0].id;

      console.log(`[SchedulerService] ✅ Created execution: ${executionId}`);

      // Log trigger execution
      await pool.query(
        `INSERT INTO trigger_execution_logs
         (trigger_id, orchestration_id, execution_id, status, payload, triggered_at, triggered_by)
         VALUES ($1, $2, $3, 'started', $4, NOW(), $5)`,
        [
          trigger.id,
          orchestration.id,
          executionId,
          JSON.stringify({
            scheduledTime: triggeredAt,
            scheduleType: trigger.config.scheduleType,
          }),
          `schedule:${trigger.id}`,
        ]
      );

      // Update trigger last_triggered_at
      await pool.query(
        `UPDATE orchestration_triggers
         SET last_triggered_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [trigger.id]
      );

      // Calculate and update next run time
      const nextRun = calculateNextRunTime(trigger.config, new Date());
      if (nextRun) {
        await pool.query(
          `UPDATE orchestration_triggers
           SET config = jsonb_set(config, '{nextRunAt}', $1::jsonb)
           WHERE id = $2`,
          [JSON.stringify(nextRun), trigger.id]
        );
      }

      return {
        success: true,
        executionId,
        triggeredAt,
      };
    } catch (error: any) {
      console.error(`[SchedulerService] Error executing orchestration:`, error);

      // Log failed execution
      await pool.query(
        `INSERT INTO trigger_execution_logs
         (trigger_id, orchestration_id, execution_id, status, payload, error_message, triggered_at, triggered_by)
         VALUES ($1, $2, NULL, 'failed', $3, $4, NOW(), $5)`,
        [
          trigger.id,
          trigger.orchestrationId,
          JSON.stringify({
            scheduledTime: triggeredAt,
            scheduleType: trigger.config.scheduleType,
          }),
          error.message,
          `schedule:${trigger.id}`,
        ]
      );

      return {
        success: false,
        error: error.message,
        triggeredAt,
      };
    }
  }

  /**
   * Gracefully shutdown the scheduler
   */
  async shutdown(): Promise<void> {
    console.log("[SchedulerService] Shutting down...");

    if (this.reloadInterval) {
      clearInterval(this.reloadInterval);
    }

    if (this.engine) {
      await this.engine.shutdown();
    }

    this.isInitialized = false;
    console.log("[SchedulerService] Shutdown complete");
  }

  /**
   * Get scheduler engine name
   */
  getEngineName(): string {
    return this.engine?.getEngineName() || "none";
  }
}

// Singleton instance
let schedulerService: OrchestrationSchedulerService | null = null;

/**
 * Get or create scheduler service instance
 */
export function getSchedulerService(): OrchestrationSchedulerService {
  if (!schedulerService) {
    schedulerService = new OrchestrationSchedulerService();
  }
  return schedulerService;
}
