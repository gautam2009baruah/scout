// Schedule Trigger Worker
// Checks for due schedule triggers and executes orchestrations
// Run with: node scripts/schedule-trigger-worker.mjs

import pg from "pg";
import { OrchestrationEngine } from "../lib/orchestrations/engine.js";

const { Pool } = pg;

// Parse DATABASE_URL or use individual env vars
let poolConfig;
if (process.env.DATABASE_URL) {
  poolConfig = { connectionString: process.env.DATABASE_URL };
} else {
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432"),
    database: process.env.DB_NAME || "scout",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
  };
}

const pool = new Pool(poolConfig);

const CHECK_INTERVAL_MS = 60000; // Check every minute
let isShuttingDown = false;

/**
 * Parse cron expression or schedule config to calculate next run time
 */
function calculateNextRunTime(config, timezone = "UTC") {
  const now = new Date();
  
  if (config.scheduleType === "one-time") {
    if (!config.oneTimeDate) return null;
    const oneTime = new Date(config.oneTimeDate);
    return oneTime > now ? oneTime : null;
  }
  
  if (config.scheduleType === "cron" && config.cronExpression) {
    // For production, use a proper cron parser library like 'cron-parser'
    // For now, return next minute as a placeholder
    const next = new Date(now.getTime() + 60000);
    return next;
  }
  
  if (config.scheduleType === "daily" && config.specificTime) {
    const [hours, minutes] = config.specificTime.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      // Move to next day
      next.setDate(next.getDate() + 1);
    }
    return next;
  }
  
  if (config.scheduleType === "weekly" && config.specificTime && config.dayOfWeek !== undefined) {
    const [hours, minutes] = config.specificTime.split(":").map(Number);
    const next = new Date(now);
    next.setHours(hours, minutes, 0, 0);
    
    const currentDay = now.getDay();
    const targetDay = config.dayOfWeek;
    let daysUntilTarget = (targetDay - currentDay + 7) % 7;
    
    if (daysUntilTarget === 0 && next <= now) {
      daysUntilTarget = 7; // Move to next week
    }
    
    next.setDate(next.getDate() + daysUntilTarget);
    return next;
  }
  
  if (config.scheduleType === "monthly" && config.specificTime && config.dayOfMonth) {
    const [hours, minutes] = config.specificTime.split(":").map(Number);
    const next = new Date(now);
    next.setDate(config.dayOfMonth);
    next.setHours(hours, minutes, 0, 0);
    
    if (next <= now) {
      // Move to next month
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }
  
  return null;
}

/**
 * Check if a schedule is currently due (within the last 2 minutes)
 */
function isScheduleDue(nextRunAt) {
  if (!nextRunAt) return false;
  
  const now = new Date();
  const scheduledTime = new Date(nextRunAt);
  const twoMinutesAgo = new Date(now.getTime() - 120000);
  
  return scheduledTime >= twoMinutesAgo && scheduledTime <= now;
}

/**
 * Process a single schedule trigger
 */
async function processScheduleTrigger(trigger) {
  const triggerId = trigger.id;
  const config = trigger.config;
  
  console.log(`Processing schedule trigger: ${trigger.name} (${triggerId})`);
  
  try {
    // Check if already executed for this scheduled time
    const existingResult = await pool.query(
      `SELECT id FROM schedule_executions 
       WHERE trigger_id = $1 AND scheduled_at = $2`,
      [triggerId, config.nextRunAt]
    );
    
    if (existingResult.rowCount > 0) {
      console.log(`  Already executed for scheduled time ${config.nextRunAt}`);
      return;
    }
    
    // Get orchestration details
    const orchResult = await pool.query(
      `SELECT o.id, o.version, o.company_id, o.name
       FROM orchestrations o
       WHERE o.id = $1 AND o.status = 'published'`,
      [trigger.orchestration_id]
    );
    
    if (orchResult.rowCount === 0) {
      throw new Error("Orchestration not found or not published");
    }
    
    const orchestration = orchResult.rows[0];
    
    // Create orchestration execution
    const executionResult = await pool.query(
      `INSERT INTO orchestration_executions 
       (orchestration_id, orchestration_version, status, context, trigger_data, triggered_by, started_at)
       VALUES ($1, $2, 'running', $3, $4, $5, NOW())
       RETURNING id, started_at`,
      [
        orchestration.id,
        orchestration.version,
        JSON.stringify({}),
        JSON.stringify({
          type: "schedule",
          triggerId,
          scheduledAt: config.nextRunAt,
          actualStartedAt: new Date().toISOString(),
          timezone: config.timezone || "UTC"
        }),
        "system:schedule-trigger",
      ]
    );
    
    const execution = executionResult.rows[0];
    
    // Record schedule execution
    await pool.query(
      `INSERT INTO schedule_executions 
       (trigger_id, orchestration_id, execution_id, scheduled_at, actual_started_at, status, timezone)
       VALUES ($1, $2, $3, $4, $5, 'started', $6)`,
      [
        triggerId,
        orchestration.id,
        execution.id,
        config.nextRunAt,
        execution.started_at,
        config.timezone || "UTC"
      ]
    );
    
    console.log(`  Created execution: ${execution.id}`);
    
    // Execute orchestration in background
    // Note: In production, this should use a proper job queue
    setImmediate(async () => {
      try {
        const nodesResult = await pool.query(
          `SELECT * FROM orchestration_nodes WHERE orchestration_id = $1 ORDER BY created_at`,
          [orchestration.id]
        );
        
        const connectionsResult = await pool.query(
          `SELECT * FROM orchestration_connections WHERE orchestration_id = $1 ORDER BY created_at`,
          [orchestration.id]
        );
        
        const nodes = nodesResult.rows;
        const connections = connectionsResult.rows;
        
        const engine = new OrchestrationEngine(execution, nodes, connections);
        await engine.execute();
        
        // Update schedule execution status
        await pool.query(
          `UPDATE schedule_executions SET status = 'completed' 
           WHERE trigger_id = $1 AND scheduled_at = $2`,
          [triggerId, config.nextRunAt]
        );
        
        console.log(`  Execution completed: ${execution.id}`);
      } catch (error) {
        console.error(`  Execution failed: ${error.message}`);
        
        await pool.query(
          `UPDATE schedule_executions SET status = 'failed', error_message = $3
           WHERE trigger_id = $1 AND scheduled_at = $2`,
          [triggerId, config.nextRunAt, error.message]
        );
      }
    });
    
    // Calculate and update next run time
    const nextNextRunAt = calculateNextRunTime(config, config.timezone);
    
    if (nextNextRunAt) {
      await pool.query(
        `UPDATE orchestration_triggers 
         SET config = jsonb_set(config, '{nextRunAt}', to_jsonb($2::text)),
             last_triggered_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [triggerId, nextNextRunAt.toISOString()]
      );
      
      console.log(`  Next run scheduled for: ${nextNextRunAt.toISOString()}`);
    } else {
      // No more runs, disable trigger
      await pool.query(
        `UPDATE orchestration_triggers 
         SET status = 'inactive',
             config = jsonb_set(config, '{enabled}', 'false'::jsonb),
             updated_at = NOW()
         WHERE id = $1`,
        [triggerId]
      );
      
      console.log(`  No more runs, trigger disabled`);
    }
    
  } catch (error) {
    console.error(`  Error processing schedule trigger: ${error.message}`);
    
    await pool.query(
      `UPDATE orchestration_triggers 
       SET last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [triggerId, error.message]
    );
  }
}

/**
 * Main worker loop
 */
async function checkSchedules() {
  if (isShuttingDown) return;
  
  try {
    // Get all enabled schedule triggers with due next_run_at
    const result = await pool.query(
      `SELECT t.id, t.orchestration_id, t.name, t.config, t.status
       FROM orchestration_triggers t
       INNER JOIN orchestrations o ON o.id = t.orchestration_id
       WHERE t.trigger_type = 'schedule'
         AND t.status = 'active'
         AND (t.config->>'enabled')::boolean = true
         AND t.config->>'nextRunAt' IS NOT NULL
         AND o.status = 'published'`
    );
    
    console.log(`\nChecking ${result.rowCount} active schedule triggers...`);
    
    for (const trigger of result.rows) {
      const nextRunAt = trigger.config.nextRunAt;
      
      if (isScheduleDue(nextRunAt)) {
        await processScheduleTrigger(trigger);
      }
    }
    
  } catch (error) {
    console.error("Error checking schedules:", error);
  }
}

/**
 * Initialize triggers that don't have nextRunAt calculated
 */
async function initializeSchedules() {
  try {
    const result = await pool.query(
      `SELECT id, config FROM orchestration_triggers
       WHERE trigger_type = 'schedule'
         AND status = 'active'
         AND (config->>'enabled')::boolean = true
         AND config->>'nextRunAt' IS NULL`
    );
    
    console.log(`Initializing ${result.rowCount} schedule triggers...`);
    
    for (const trigger of result.rows) {
      const config = trigger.config;
      const nextRunAt = calculateNextRunTime(config, config.timezone || "UTC");
      
      if (nextRunAt) {
        await pool.query(
          `UPDATE orchestration_triggers
           SET config = jsonb_set(config, '{nextRunAt}', to_jsonb($2::text)),
               updated_at = NOW()
           WHERE id = $1`,
          [trigger.id, nextRunAt.toISOString()]
        );
        
        console.log(`  Initialized trigger ${trigger.id}: next run at ${nextRunAt.toISOString()}`);
      }
    }
  } catch (error) {
    console.error("Error initializing schedules:", error);
  }
}

/**
 * Start the worker
 */
async function start() {
  console.log("Schedule Trigger Worker starting...");
  console.log(`Check interval: ${CHECK_INTERVAL_MS}ms`);
  
  // Initialize schedules on startup
  await initializeSchedules();
  
  // Run first check immediately
  await checkSchedules();
  
  // Schedule recurring checks
  const intervalId = setInterval(checkSchedules, CHECK_INTERVAL_MS);
  
  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nShutting down gracefully...");
    isShuttingDown = true;
    clearInterval(intervalId);
    await pool.end();
    process.exit(0);
  });
  
  process.on("SIGTERM", async () => {
    console.log("\nShutting down gracefully...");
    isShuttingDown = true;
    clearInterval(intervalId);
    await pool.end();
    process.exit(0);
  });
  
  console.log("Schedule Trigger Worker running. Press Ctrl+C to stop.");
}

start().catch(console.error);
