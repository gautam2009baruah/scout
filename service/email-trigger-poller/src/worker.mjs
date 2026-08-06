// Email Trigger Poller
// Polls email providers and triggers orchestrations based on matching emails
// Run with: npm run triggers:email

import "../../../scripts/db/load-env.mjs";
import pg from "pg";
import {
  getActiveEmailTriggers, 
  emailMatchesTrigger, 
  processEmailTrigger,
  updateTriggerLastPolled 
} from "../../../lib/orchestrations/email-trigger-processor.ts";
import { fetchIMAPEmails, getIMAPCredentials, markIMAPEmailAsRead } from "../../../lib/integrations/email/imap.ts";
import { fetchGmailEmails, getGmailCredentials, buildGmailQuery, markGmailEmailAsRead } from "../../../lib/integrations/email/gmail.ts";
import { fetchOutlookEmails, getOutlookCredentials, buildOutlookFilter, markOutlookEmailAsRead } from "../../../lib/integrations/email/outlook.ts";
import { createLogger } from "../../../lib/logging/logger.mjs";

const { Pool } = pg;

const log = createLogger("email-trigger-poller");

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

const DEFAULT_POLL_INTERVAL_MS = 60000; // Check every minute
let isShuttingDown = false;
let activeTriggers = new Map(); // Store polling intervals per trigger

/**
 * Calculate polling interval for a trigger
 */
function getPollingInterval(config) {
  const intervalMinutes = config.pollingIntervalMinutes || 5;
  return intervalMinutes * 60 * 1000; // Convert to milliseconds
}

/**
 * An inbox credential must be usable for the environment this trigger row
 * is polling. Every row is fanned out for a specific environment
 * (trigger.environmentId — see lib/orchestrations/db.ts's email trigger
 * publish sync, which no longer produces un-scoped rows) and just needs
 * that one environment to be actively released
 * (orchestration_environment_releases, 002_environment_releases_and_versioning.sql).
 * A row with no environmentId (only possible from a stale pre-fan-out row
 * that hasn't been republished yet) fails closed rather than falling back
 * to "any overlapping environment" — there is no unscoped polling anymore.
 */
async function isEnvironmentAllowedForTrigger(orchestrationId, environmentId, credentialId) {
  if (!environmentId || !credentialId) {
    return false;
  }

  const releasedResult = await pool.query(
    `SELECT oer.environment_id
     FROM orchestration_environment_releases oer
     INNER JOIN orchestrations o ON o.id = oer.orchestration_id
     INNER JOIN target_app_environments env
       ON env.id = oer.environment_id AND env.target_app_id = o.target_app_id
     INNER JOIN email_credentials ec
       ON ec.id = $3 AND ec.company_id = o.company_id AND ec.target_app_id = o.target_app_id
     INNER JOIN email_credential_environments ece
       ON ece.email_credential_id = ec.id AND ece.environment_id = env.id
     WHERE oer.orchestration_id = $1
       AND oer.environment_id = $2
       AND oer.deleted_at IS NULL
       AND ec.is_active = true`,
    [orchestrationId, environmentId, credentialId]
  );
  return releasedResult.rowCount > 0;
}

/**
 * Fetch emails for a specific provider
 */
async function fetchEmailsForProvider(trigger, config, since) {
  const { provider, credentialId } = config;

  if (credentialId && !(await isEnvironmentAllowedForTrigger(trigger.orchestrationId, trigger.environmentId, credentialId))) {
    log.warn("environment not released for orchestration", { triggerId: trigger.id, environmentId: trigger.environmentId || null });
    return [];
  }

  if (provider === "gmail") {
    if (!credentialId) {
      log.warn("no credential configured", { triggerId: trigger.id, provider: "gmail" });
      return [];
    }
    
    const credentials = await getGmailCredentials(credentialId, trigger.companyId);
    if (!credentials) {
      log.warn("credentials not found", { triggerId: trigger.id, provider: "gmail" });
      return [];
    }
    
    const query = buildGmailQuery({
      unreadOnly: config.unreadOnly,
      senderFilter: config.senderFilter,
      subjectContains: config.subjectContains,
      bodyContains: config.bodyContains,
      hasAttachment: config.hasAttachment,
      after: since,
    });
    
    return await fetchGmailEmails(credentialId, credentials, query);
    
  } else if (provider === "outlook") {
    if (!credentialId) {
      log.warn("no credential configured", { triggerId: trigger.id, provider: "outlook" });
      return [];
    }
    
    const credentials = await getOutlookCredentials(credentialId, trigger.companyId);
    if (!credentials) {
      log.warn("credentials not found", { triggerId: trigger.id, provider: "outlook" });
      return [];
    }
    
    const filter = buildOutlookFilter({
      unreadOnly: config.unreadOnly,
      senderFilter: config.senderFilter,
      subjectContains: config.subjectContains,
      hasAttachment: config.hasAttachment,
      receivedAfter: since,
    });
    
    const folder = config.folder || "inbox";
    return await fetchOutlookEmails(credentialId, credentials, folder, filter);
    
  } else if (provider === "imap") {
    if (!credentialId) {
      log.warn("no credential configured", { triggerId: trigger.id, provider: "imap" });
      return [];
    }
    
    const credentials = await getIMAPCredentials(credentialId, trigger.companyId);
    if (!credentials) {
      log.warn("credentials not found", { triggerId: trigger.id, provider: "imap" });
      return [];
    }
    
    const folder = config.folder || "INBOX";
    return await fetchIMAPEmails(credentials, folder, config.unreadOnly, undefined, since);
    
  } else {
    log.warn("unknown provider", { triggerId: trigger.id, provider });
    return [];
  }
}

/**
 * Mark email as processed on the provider
 */
async function markEmailAsProcessed(trigger, config, messageId) {
  if (!config.markAsProcessed) {
    return; // Not configured to mark as processed
  }
  
  const { provider, credentialId } = config;
  
  try {
    if (provider === "gmail") {
      const credentials = await getGmailCredentials(credentialId, trigger.companyId);
      if (credentials) {
        await markGmailEmailAsRead(credentials, messageId);
      }
    } else if (provider === "outlook") {
      const credentials = await getOutlookCredentials(credentialId, trigger.companyId);
      if (credentials) {
        await markOutlookEmailAsRead(credentials, messageId);
      }
    } else if (provider === "imap") {
      const credentials = await getIMAPCredentials(credentialId, trigger.companyId);
      if (credentials) {
        const folder = config.folder || "INBOX";
        await markIMAPEmailAsRead(credentials, messageId, folder);
      }
    }
    
    log.debug("marked email as processed", { messageId });
  } catch (error) {
    log.error("failed to mark email as processed", { err: error });
  }
}

/**
 * Compute the start-of-today timestamp (local time).
 */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Determine the initial fetch watermark for a trigger.
 * - If we have a persisted last_polled_at that is within today, resume from it.
 * - Otherwise (first ever poll, or the service was down since before today),
 *   cap the look-back to the start of today.
 */
function computeInitialWatermark(trigger) {
  const today = startOfToday();
  const lastPolled = trigger.lastPolledAt ? new Date(trigger.lastPolledAt) : null;
  if (lastPolled && lastPolled.getTime() > today.getTime()) {
    return lastPolled;
  }
  return today;
}

/**
 * Process a single email trigger
 */
async function processEmailTriggerPolling(trigger, since) {
  const triggerId = trigger.id;
  const config = trigger.config;
  
  // Capture the poll start BEFORE fetching so emails that arrive during the
  // fetch are not skipped on the next cycle. This becomes the next watermark.
  const pollStart = new Date();
  
  log.info("polling trigger", { trigger: trigger.name, triggerId, provider: config.provider, mailbox: config.mailbox, since: since ? since.toISOString() : "beginning" });
  
  try {
    // Fetch emails from provider (provider-side filtering by since where supported)
    const fetched = await fetchEmailsForProvider(trigger, config, since);
    
    // Enforce the exact time window in memory, regardless of provider
    // granularity (e.g. IMAP SINCE is date-only).
    const emails = since
      ? fetched.filter((email) => {
          const receivedAt = email.receivedAt instanceof Date
            ? email.receivedAt
            : new Date(email.receivedAt);
          return receivedAt.getTime() >= since.getTime();
        })
      : fetched;
    
    log.info("fetched emails", { fetched: fetched.length, withinWindow: emails.length });
    
    if (emails.length === 0) {
      // Advance the watermark even if no emails matched the window
      await updateTriggerLastPolled(triggerId, pollStart);
      return pollStart;
    }
    
    let processedCount = 0;
    let matchedCount = 0;
    
    for (const email of emails) {
      try {
        // Check if email matches trigger filters
        const matches = emailMatchesTrigger(email, config);
        
        if (!matches) {
          log.debug("email does not match filters", { subject: email.subject });
          continue;
        }
        
        matchedCount++;
        log.debug("email matches; processing", { subject: email.subject });
        
        // Process the email and create orchestration execution
        const result = await processEmailTrigger(
          triggerId,
          trigger.orchestrationId,
          email,
          config,
          trigger.environmentId || null
        );
        
        if (result.success) {
          processedCount++;
          log.info("created execution", { executionId: result.executionId });
          
          // Mark as processed on provider
          await markEmailAsProcessed(trigger, config, email.messageId);
        } else {
          log.warn("failed to process email", { reason: result.error });
        }
        
      } catch (error) {
        log.error("error processing email", { subject: email.subject, err: error });
      }
    }
    
    log.info("poll summary", { matched: matchedCount, processed: processedCount });
    
    // Advance the watermark to the poll start
    await updateTriggerLastPolled(triggerId, pollStart);
    
    return pollStart;
    
  } catch (error) {
    log.error("error polling trigger", { err: error });
    
    // Log error to database
    await pool.query(
      `UPDATE orchestration_triggers
       SET last_error = $2, updated_at = NOW()
       WHERE id = $1`,
      [triggerId, error.message]
    );
    
    // Do not advance the watermark on failure so the window is retried next cycle
    return null;
  }
}

/**
 * Start polling for a specific trigger
 */
function startTriggerPolling(trigger) {
  const interval = getPollingInterval(trigger.config);
  
  log.info("starting polling", { trigger: trigger.name, intervalSeconds: interval / 1000 });
  
  const entry = {
    trigger,
    intervalId: null,
    interval,
    watermark: computeInitialWatermark(trigger),
  };
  activeTriggers.set(trigger.id, entry);
  
  // Run one poll cycle, advancing the watermark on success
  const runCycle = async () => {
    if (isShuttingDown) return;
    const active = activeTriggers.get(trigger.id);
    if (!active) return;
    const nextWatermark = await processEmailTriggerPolling(active.trigger, active.watermark);
    if (nextWatermark) {
      active.watermark = nextWatermark;
    }
  };
  
  // Poll immediately
  runCycle();
  
  // Schedule recurring polls
  entry.intervalId = setInterval(runCycle, interval);
}

/**
 * Stop polling for a specific trigger
 */
function stopTriggerPolling(triggerId) {
  const active = activeTriggers.get(triggerId);
  if (active) {
    clearInterval(active.intervalId);
    activeTriggers.delete(triggerId);
    log.info("stopped polling", { triggerId });
  }
}

/**
 * Refresh active triggers (add new, remove inactive)
 */
async function refreshActiveTriggers() {
  if (isShuttingDown) return;
  
  try {
    const triggers = await getActiveEmailTriggers();
    
    // Build set of current trigger IDs
    const currentIds = new Set(triggers.map(t => t.id));
    
    // Stop polling for triggers that are no longer active
    for (const [id, active] of activeTriggers.entries()) {
      if (!currentIds.has(id)) {
        stopTriggerPolling(id);
      }
    }
    
    // Start polling for new triggers
    for (const trigger of triggers) {
      if (!activeTriggers.has(trigger.id)) {
        startTriggerPolling(trigger);
      }
    }
    
  } catch (error) {
    log.error("error refreshing active triggers", { err: error });
  }
}

/**
 * Start the email poller
 */
async function start() {
  log.info("starting", { refreshIntervalMs: DEFAULT_POLL_INTERVAL_MS });
  
  // Initial load of active triggers
  await refreshActiveTriggers();
  
  log.info("active email triggers", { count: activeTriggers.size });
  
  // Periodically refresh the list of active triggers (every minute)
  const refreshInterval = setInterval(refreshActiveTriggers, DEFAULT_POLL_INTERVAL_MS);
  
  // Graceful shutdown
  const shutdown = async () => {
    log.info("shutting down");
    isShuttingDown = true;
    
    clearInterval(refreshInterval);
    
    // Stop all active trigger polling
    for (const [id] of activeTriggers.entries()) {
      stopTriggerPolling(id);
    }
    
    await pool.end();
    process.exit(0);
  };
  
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  
  log.info("running");
}

start().catch((error) => log.error("fatal error", { err: error }));
