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
 * Fetch emails for a specific provider
 */
async function fetchEmailsForProvider(trigger, config, since) {
  const { provider, credentialId } = config;
  
  if (provider === "gmail") {
    if (!credentialId) {
      console.warn(`Trigger ${trigger.id}: No credential ID configured for Gmail`);
      return [];
    }
    
    const credentials = await getGmailCredentials(credentialId);
    if (!credentials) {
      console.warn(`Trigger ${trigger.id}: Gmail credentials not found`);
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
      console.warn(`Trigger ${trigger.id}: No credential ID configured for Outlook`);
      return [];
    }
    
    const credentials = await getOutlookCredentials(credentialId);
    if (!credentials) {
      console.warn(`Trigger ${trigger.id}: Outlook credentials not found`);
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
      console.warn(`Trigger ${trigger.id}: No credential ID configured for IMAP`);
      return [];
    }
    
    const credentials = await getIMAPCredentials(credentialId);
    if (!credentials) {
      console.warn(`Trigger ${trigger.id}: IMAP credentials not found`);
      return [];
    }
    
    const folder = config.folder || "INBOX";
    return await fetchIMAPEmails(credentials, folder, config.unreadOnly, undefined, since);
    
  } else {
    console.warn(`Trigger ${trigger.id}: Unknown provider ${provider}`);
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
      const credentials = await getGmailCredentials(credentialId);
      if (credentials) {
        await markGmailEmailAsRead(credentials, messageId);
      }
    } else if (provider === "outlook") {
      const credentials = await getOutlookCredentials(credentialId);
      if (credentials) {
        await markOutlookEmailAsRead(credentials, messageId);
      }
    } else if (provider === "imap") {
      const credentials = await getIMAPCredentials(credentialId);
      if (credentials) {
        const folder = config.folder || "INBOX";
        await markIMAPEmailAsRead(credentials, messageId, folder);
      }
    }
    
    console.log(`  Marked email ${messageId} as processed`);
  } catch (error) {
    console.error(`  Failed to mark email as processed: ${error.message}`);
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
  
  console.log(`\nPolling trigger: ${trigger.name} (${triggerId})`);
  console.log(`  Provider: ${config.provider}`);
  console.log(`  Mailbox: ${config.mailbox}`);
  console.log(`  Since: ${since ? since.toISOString() : 'beginning'}`);
  
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
    
    console.log(`  Fetched ${fetched.length} emails, ${emails.length} within window`);
    
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
          console.log(`  Email "${email.subject}" does not match filters`);
          continue;
        }
        
        matchedCount++;
        console.log(`  Email "${email.subject}" matches! Processing...`);
        
        // Process the email and create orchestration execution
        const result = await processEmailTrigger(
          triggerId,
          trigger.orchestrationId,
          email,
          config
        );
        
        if (result.success) {
          processedCount++;
          console.log(`  Created execution: ${result.executionId}`);
          
          // Mark as processed on provider
          await markEmailAsProcessed(trigger, config, email.messageId);
        } else {
          console.log(`  Failed to process: ${result.error}`);
        }
        
      } catch (error) {
        console.error(`  Error processing email "${email.subject}": ${error.message}`);
      }
    }
    
    console.log(`  Summary: ${matchedCount} matched, ${processedCount} processed`);
    
    // Advance the watermark to the poll start
    await updateTriggerLastPolled(triggerId, pollStart);
    
    return pollStart;
    
  } catch (error) {
    console.error(`  Error polling trigger: ${error.message}`);
    
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
  
  console.log(`Starting polling for trigger ${trigger.name} (every ${interval / 1000}s)`);
  
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
    console.log(`Stopped polling for trigger ${triggerId}`);
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
    console.error("Error refreshing active triggers:", error);
  }
}

/**
 * Start the email poller
 */
async function start() {
  console.log("Email Trigger Poller starting...");
  console.log(`Refresh interval: ${DEFAULT_POLL_INTERVAL_MS}ms`);
  
  // Initial load of active triggers
  await refreshActiveTriggers();
  
  console.log(`\nActive email triggers: ${activeTriggers.size}`);
  
  // Periodically refresh the list of active triggers (every minute)
  const refreshInterval = setInterval(refreshActiveTriggers, DEFAULT_POLL_INTERVAL_MS);
  
  // Graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down gracefully...");
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
  
  console.log("Email Trigger Poller running. Press Ctrl+C to stop.");
}

start().catch(console.error);
