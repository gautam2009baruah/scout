// Orchestration Scheduler Worker
// Background process that manages and executes scheduled orchestrations
// Supports both node-cron (default) and Bull Queue engines

import pg from "pg";
import "../db/load-env.mjs";

const { Client } = pg;

// Import scheduler engine (uses factory pattern for easy switching)
// Note: TypeScript paths don't work in .mjs, so we'll need to use relative paths
// or compile TypeScript to JavaScript first

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const client = new Client({ connectionString: databaseUrl });

// Track scheduler instance
let scheduler = null;
let isShuttingDown = false;

/**
 * Load all active schedule triggers from database
 */
async function loadScheduleTriggers() {
  try {
    const result = await client.query(
      `SELECT 
        t.id,
        t.orchestration_id,
        t.name,
        t.config,
        t.status,
        t.last_triggered_at,
        o.status as orchestration_status
       FROM orchestration_triggers t
       INNER JOIN orchestrations o ON t.orchestration_id = o.id
       WHERE t.trigger_type = 'schedule'
       AND t.status = 'active'
       AND o.status = 'published'
       ORDER BY t.created_at ASC`
    );

    const triggers = result.rows.map((row) => ({
      id: row.id,
      orchestrationId: row.orchestration_id,
      name: row.name,
      config: row.config,
      status: row.status,
      lastTriggeredAt: row.last_triggered_at?.toISOString() || null,
      nextRunAt: row.config.nextRunAt || null,
    }));

    console.log(`[Scheduler] Loaded ${triggers.length} active schedule trigger(s)`);
    
    triggers.forEach((trigger, index) => {
      console.log(`  ${index + 1}. ${trigger.name} (${trigger.id})`);
      console.log(`     Orchestration: ${trigger.orchestrationId}`);
      console.log(`     Type: ${trigger.config.scheduleType}`);
      if (trigger.config.scheduleType === "cron") {
        console.log(`     Cron: ${trigger.config.cronExpression}`);
      }
      console.log(`     Timezone: ${trigger.config.timezone || "UTC"}`);
      console.log(`     Enabled: ${trigger.config.enabled}`);
    });

    return triggers;
  } catch (error) {
    console.error("[Scheduler] Error loading triggers:", error);
    throw error;
  }
}

/**
 * Execute orchestration when schedule fires
 */
async function executeScheduledOrchestration(trigger) {
  const triggeredAt = new Date().toISOString();

  console.log(`[Scheduler] Executing scheduled orchestration: ${trigger.orchestrationId}`);

  try {
    // Get orchestration details
    const orchResult = await client.query(
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
    const execResult = await client.query(
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

    console.log(`[Scheduler] ✅ Created execution: ${executionId}`);

    // Log trigger execution
    await client.query(
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
    await client.query(
      `UPDATE orchestration_triggers
       SET last_triggered_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [trigger.id]
    );

    // Note: Actual orchestration execution happens via the orchestration engine
    // The execution engine will pick up this execution record and process nodes
    // For now, we've created the execution which will be processed by the main app

    console.log(`[Scheduler] Orchestration execution queued successfully`);

    return {
      success: true,
      executionId,
      triggeredAt,
    };
  } catch (error) {
    console.error(`[Scheduler] Error executing orchestration:`, error);

    // Log failed execution
    await client.query(
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
 * Initialize scheduler and register all triggers
 */
async function initializeScheduler() {
  console.log("\n" + "=".repeat(80));
  console.log("🚀 Orchestration Scheduler Worker Starting");
  console.log("=".repeat(80));
  console.log(`Engine: ${process.env.SCHEDULER_ENGINE || "node-cron (default)"}`);
  console.log(`Database: ${databaseUrl.split("@")[1] || "connected"}`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log("=".repeat(80) + "\n");

  // For MVP, we'll use a simple polling approach to check for new/updated triggers
  // In production with Bull, this would be event-driven

  // Load triggers every 5 minutes to pick up new schedules
  const reloadInterval = parseInt(process.env.SCHEDULER_RELOAD_INTERVAL_MS || "300000"); // 5 minutes
  
  async function loadAndRegisterTriggers() {
    try {
      console.log("\n[Scheduler] Loading triggers from database...");
      const triggers = await loadScheduleTriggers();

      // For now, we'll log that schedules are loaded
      // The actual scheduling happens in the TypeScript compiled version
      // This .mjs file is a placeholder for the compiled output

      console.log(`[Scheduler] Monitoring ${triggers.length} schedule(s)\n`);
    } catch (error) {
      console.error("[Scheduler] Error in reload cycle:", error);
    }
  }

  // Initial load
  await loadAndRegisterTriggers();

  // Reload periodically
  const reloadTimer = setInterval(loadAndRegisterTriggers, reloadInterval);

  // Graceful shutdown
  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Scheduler] Received ${signal}, shutting down gracefully...`);

    clearInterval(reloadTimer);

    if (scheduler) {
      console.log("[Scheduler] Stopping all schedules...");
      // await scheduler.shutdown();
    }

    console.log("[Scheduler] Closing database connection...");
    await client.end();

    console.log("[Scheduler] Shutdown complete ✅\n");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  console.log("[Scheduler] Worker is running. Press Ctrl+C to stop.\n");
}

// Start the scheduler
await client.connect();
await initializeScheduler();

// Keep process alive
process.stdin.resume();
