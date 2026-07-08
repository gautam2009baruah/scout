// Email Trigger Polling Worker
// Background process that polls email accounts and triggers orchestrations

import pg from "pg";
import "../db/load-env.mjs";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL;
const pollIntervalMs = parseInt(process.env.EMAIL_POLL_INTERVAL_MS || "60000"); // 1 minute default
const runOnce = process.argv.includes("--once");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not configured.");
}

const client = new Client({ connectionString: databaseUrl });

let isShuttingDown = false;
let pollTimer = null;

/**
 * Load all active email triggers with credentials
 */
async function loadEmailTriggers() {
  try {
    const result = await client.query(
      `SELECT 
        t.id as trigger_id,
        t.orchestration_id,
        t.name,
        t.config,
        t.status,
        t.last_triggered_at,
        c.id as credential_id,
        c.provider,
        c.email_address,
        c.imap_host,
        c.imap_port,
        c.imap_username,
        c.imap_password,
        c.imap_tls,
        o.status as orchestration_status
       FROM orchestration_triggers t
       INNER JOIN orchestrations o ON t.orchestration_id = o.id
       LEFT JOIN email_credentials c ON c.email_address = t.config->>'mailbox' AND c.is_active = true
       WHERE t.trigger_type = 'email'
       AND t.status = 'active'
       AND o.status = 'published'
       AND t.config->>'enabled' = 'true'
       ORDER BY t.created_at ASC`
    );

    const triggers = result.rows.map((row) => ({
      triggerId: row.trigger_id,
      orchestrationId: row.orchestration_id,
      name: row.name,
      config: row.config,
      status: row.status,
      lastTriggeredAt: row.last_triggered_at?.toISOString() || null,
      credential: row.credential_id ? {
        id: row.credential_id,
        provider: row.provider,
        emailAddress: row.email_address,
        imap: row.provider === 'imap' ? {
          host: row.imap_host,
          port: row.imap_port,
          username: row.imap_username,
          password: row.imap_password?.replace('encrypted:', '') || '',
          tls: row.imap_tls,
        } : null,
      } : null,
    }));

    console.log(`[EmailWorker] Loaded ${triggers.length} active email trigger(s)`);
    
    triggers.forEach((trigger, index) => {
      console.log(`  ${index + 1}. ${trigger.name} (${trigger.triggerId})`);
      console.log(`     Mailbox: ${trigger.config.mailbox}`);
      console.log(`     Provider: ${trigger.credential?.provider || 'NO CREDENTIAL'}`);
      console.log(`     Poll Interval: ${trigger.config.pollingIntervalMinutes || 5} minutes`);
    });

    return triggers;
  } catch (error) {
    console.error("[EmailWorker] Error loading triggers:", error);
    throw error;
  }
}

/**
 * Process a single email trigger
 */
async function processEmailTrigger(trigger) {
  console.log(`\n[EmailWorker] Processing trigger: ${trigger.name}`);

  if (!trigger.credential) {
    console.warn(`[EmailWorker] ⚠️ No credential found for mailbox: ${trigger.config.mailbox}`);
    return;
  }

  if (trigger.credential.provider !== 'imap') {
    console.warn(`[EmailWorker] ⚠️ Provider ${trigger.credential.provider} not yet implemented`);
    return;
  }

  try {
    // Dynamic import to avoid issues with TypeScript/ESM
    const { fetchIMAPEmails } = await import("../../lib/integrations/email/imap.js");
    const { emailMatchesTrigger, processEmailTrigger } = await import("../../lib/orchestrations/email-trigger-processor.js");

    // Fetch emails from IMAP
    const folder = trigger.config.folder || 'INBOX';
    const unreadOnly = trigger.config.unreadOnly !== false;

    console.log(`[EmailWorker] Fetching emails from ${folder} (unread only: ${unreadOnly})`);

    const emails = await fetchIMAPEmails(
      trigger.credential.imap,
      folder,
      unreadOnly
    );

    console.log(`[EmailWorker] Found ${emails.length} email(s)`);

    // Process each email
    let processed = 0;
    let matched = 0;

    for (const email of emails) {
      // Check if email matches trigger filters
      if (!emailMatchesTrigger(email, trigger.config)) {
        console.log(`[EmailWorker] ✗ Email "${email.subject}" does not match filters`);
        continue;
      }

      matched++;
      console.log(`[EmailWorker] ✓ Email "${email.subject}" matches filters`);

      // Process email and trigger orchestration
      const result = await processEmailTrigger(
        trigger.triggerId,
        trigger.orchestrationId,
        email,
        trigger.config
      );

      if (result.success) {
        processed++;
        console.log(`[EmailWorker] ✅ Orchestration triggered: ${result.executionId}`);
      } else {
        console.error(`[EmailWorker] ❌ Failed to trigger orchestration: ${result.error}`);
      }
    }

    console.log(`[EmailWorker] Summary: ${matched} matched, ${processed} processed`);

    // Update last triggered time if any emails processed
    if (processed > 0) {
      await client.query(
        `UPDATE orchestration_triggers
         SET last_triggered_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [trigger.triggerId]
      );
    }
  } catch (error) {
    console.error(`[EmailWorker] Error processing trigger ${trigger.name}:`, error);
  }
}

/**
 * Main polling loop
 */
async function pollEmailTriggers() {
  if (isShuttingDown) return;

  try {
    console.log("\n" + "=".repeat(80));
    console.log(`📧 Email Trigger Poll - ${new Date().toISOString()}`);
    console.log("=".repeat(80));

    const triggers = await loadEmailTriggers();

    if (triggers.length === 0) {
      console.log("[EmailWorker] No active email triggers found\n");
    } else {
      // Process each trigger
      for (const trigger of triggers) {
        // Check if enough time has passed since last check
        const pollingIntervalMinutes = trigger.config.pollingIntervalMinutes || 5;
        const lastTriggered = trigger.lastTriggeredAt ? new Date(trigger.lastTriggeredAt) : null;
        const now = new Date();

        if (lastTriggered) {
          const minutesSinceLastCheck = (now - lastTriggered) / 1000 / 60;
          if (minutesSinceLastCheck < pollingIntervalMinutes) {
            console.log(`[EmailWorker] Skipping ${trigger.name} (checked ${Math.round(minutesSinceLastCheck)} min ago, interval: ${pollingIntervalMinutes} min)`);
            continue;
          }
        }

        await processEmailTrigger(trigger);
      }
    }

    console.log("=".repeat(80) + "\n");
  } catch (error) {
    console.error("[EmailWorker] Error in poll cycle:", error);
  } finally {
    // Schedule next poll
    if (!isShuttingDown && !runOnce) {
      pollTimer = setTimeout(pollEmailTriggers, pollIntervalMs);
    } else if (runOnce) {
      console.log("[EmailWorker] Run-once mode, exiting...");
      await shutdown("DONE");
    }
  }
}

/**
 * Initialize worker
 */
async function initializeWorker() {
  console.log("\n" + "=".repeat(80));
  console.log("📧 Email Trigger Worker Starting");
  console.log("=".repeat(80));
  console.log(`Database: ${databaseUrl.split("@")[1] || "connected"}`);
  console.log(`Poll Interval: ${pollIntervalMs / 1000} seconds`);
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log("=".repeat(80) + "\n");

  // Start polling
  await pollEmailTriggers();
}

/**
 * Graceful shutdown
 */
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n[EmailWorker] Received ${signal}, shutting down gracefully...`);

  if (pollTimer) {
    clearTimeout(pollTimer);
  }

  console.log("[EmailWorker] Closing database connection...");
  await client.end();

  console.log("[EmailWorker] Shutdown complete ✅\n");
  process.exit(0);
}

// Signal handlers
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Start the worker
await client.connect();
await initializeWorker();

// Keep process alive (unless run-once mode)
if (!runOnce) {
  process.stdin.resume();
}
