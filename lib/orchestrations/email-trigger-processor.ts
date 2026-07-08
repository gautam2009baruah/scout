// Email Trigger Processor
// Processes emails against trigger configurations and creates orchestration executions

import { getPool } from "@/lib/db/pool";
import type { EmailTriggerConfig } from "@/shared/orchestrationTypes";
import type { EmailMessage } from "@/lib/integrations/email/imap";
import { createExecution } from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";

/**
 * Check if email matches trigger filters
 */
export function emailMatchesTrigger(
  email: EmailMessage,
  config: EmailTriggerConfig
): boolean {
  // Check sender filter
  if (config.senderFilter) {
    const senderLower = email.from.toLowerCase();
    const filterLower = config.senderFilter.toLowerCase();
    if (!senderLower.includes(filterLower)) {
      return false;
    }
  }
  
  // Check subject filter
  if (config.subjectContains) {
    const subjectLower = email.subject.toLowerCase();
    const filterLower = config.subjectContains.toLowerCase();
    if (!subjectLower.includes(filterLower)) {
      return false;
    }
  }
  
  // Check body filter
  if (config.bodyContains) {
    const bodyLower = email.bodyText.toLowerCase();
    const filterLower = config.bodyContains.toLowerCase();
    if (!bodyLower.includes(filterLower)) {
      return false;
    }
  }
  
  // Check attachment requirement
  if (config.hasAttachment && email.attachments.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Check if email has already been processed for this trigger
 */
export async function isEmailAlreadyProcessed(
  triggerId: string,
  messageId: string
): Promise<boolean> {
  const pool = await getPool();
  
  const result = await pool.query(
    `SELECT id FROM email_trigger_messages
     WHERE trigger_id = $1 AND message_id = $2`,
    [triggerId, messageId]
  );
  
  return (result.rowCount ?? 0) > 0;
}

/**
 * Save email attachments to storage
 */
async function saveEmailAttachments(
  email: EmailMessage,
  triggerId: string
): Promise<Array<{ filename: string; contentType: string; size: number; storagePath: string }>> {
  const savedAttachments = [];
  
  // TODO: Implement file storage
  // For now, just return metadata without actual file saving
  
  for (const attachment of email.attachments) {
    const storagePath = `./storage/email-attachments/${triggerId}/${Date.now()}_${attachment.filename}`;
    
    // In production:
    // - Create storage directory
    // - Write attachment.data to file
    // - Or upload to S3/cloud storage
    
    savedAttachments.push({
      filename: attachment.filename,
      contentType: attachment.contentType,
      size: attachment.size,
      storagePath,
    });
  }
  
  return savedAttachments;
}

/**
 * Process a matched email and create orchestration execution
 */
export async function processEmailTrigger(
  triggerId: string,
  orchestrationId: string,
  email: EmailMessage,
  config: EmailTriggerConfig
): Promise<{ success: boolean; executionId?: string; error?: string }> {
  const pool = await getPool();
  
  try {
    // Check if already processed
    const alreadyProcessed = await isEmailAlreadyProcessed(triggerId, email.messageId);
    if (alreadyProcessed) {
      console.log(`Email ${email.messageId} already processed for trigger ${triggerId}`);
      return { success: false, error: "Email already processed" };
    }
    
    // Save attachments if any
    const attachments = await saveEmailAttachments(email, triggerId);
    
    // Get orchestration details
    const orchResult = await pool.query(
      `SELECT id, version, company_id, name FROM orchestrations
       WHERE id = $1 AND status = 'published'`,
      [orchestrationId]
    );
    
    if ((orchResult.rowCount ?? 0) === 0) {
      throw new Error("Orchestration not found or not published");
    }
    
    const orchestration = orchResult.rows[0];
    
    // Create orchestration execution
    const execution = await createExecution({
      orchestrationId: orchestration.id,
      orchestrationVersion: orchestration.version,
      context: {},
      triggerData: {
        type: "email",
        triggerId,
        provider: config.provider,
        mailbox: config.mailbox,
        messageId: email.messageId,
        from: email.from,
        to: email.to,
        subject: email.subject,
        bodyText: email.bodyText,
        bodyHtml: email.bodyHtml,
        receivedAt: email.receivedAt.toISOString(),
        attachments,
      },
      triggeredBy: `email:${email.from}`,
    });
    
    // Log email processing
    await pool.query(
      `INSERT INTO email_trigger_messages
       (trigger_id, orchestration_id, execution_id, message_id, provider, mailbox,
        from_address, to_address, subject, body_text, body_html, attachments, received_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'started')`,
      [
        triggerId,
        orchestrationId,
        execution.id,
        email.messageId,
        config.provider,
        config.mailbox,
        email.from,
        email.to,
        email.subject,
        email.bodyText,
        email.bodyHtml,
        JSON.stringify(attachments),
        email.receivedAt,
      ]
    );
    
    // Log trigger execution
    await pool.query(
      `INSERT INTO trigger_execution_logs
       (trigger_id, orchestration_id, execution_id, status, payload, triggered_by)
       VALUES ($1, $2, $3, 'started', $4, $5)`,
      [
        triggerId,
        orchestrationId,
        execution.id,
        JSON.stringify({
          messageId: email.messageId,
          from: email.from,
          subject: email.subject,
        }),
        `email:${email.from}`,
      ]
    );
    
    // Execute orchestration in background
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
    
    // Execute in background
    setImmediate(async () => {
      try {
        const engine = new OrchestrationEngine(execution, nodes, connections);
        await engine.execute();
        
        // Update status to completed
        await pool.query(
          `UPDATE email_trigger_messages SET status = 'matched'
           WHERE trigger_id = $1 AND message_id = $2`,
          [triggerId, email.messageId]
        );
        
        console.log(`Email trigger execution completed: ${execution.id}`);
      } catch (error: any) {
        console.error(`Email trigger execution failed: ${error.message}`);
        
        await pool.query(
          `UPDATE email_trigger_messages SET status = 'failed', error_message = $3
           WHERE trigger_id = $1 AND message_id = $2`,
          [triggerId, email.messageId, error.message]
        );
      }
    });
    
    console.log(`Created execution ${execution.id} for email ${email.messageId}`);
    
    return { success: true, executionId: execution.id, messageId: email.messageId };
    
  } catch (error: any) {
    console.error(`Error processing email trigger: ${error.message}`);
    
    // Log failed processing attempt
    try {
      await pool.query(
        `INSERT INTO email_trigger_messages
         (trigger_id, orchestration_id, message_id, provider, mailbox,
          from_address, to_address, subject, received_at, status, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'failed', $10)`,
        [
          triggerId,
          orchestrationId,
          email.messageId,
          config.provider,
          config.mailbox,
          email.from,
          email.to,
          email.subject,
          email.receivedAt,
          error.message,
        ]
      );
    } catch (logError) {
      console.error("Failed to log email processing error:", logError);
    }
    
    return { success: false, error: error.message };
  }
}

/**
 * Get all active email triggers that are due for polling
 */
export async function getActiveEmailTriggers(): Promise<Array<{
  id: string;
  orchestrationId: string;
  name: string;
  config: EmailTriggerConfig;
  lastPolledAt: Date | null;
}>> {
  const pool = await getPool();
  
  const result = await pool.query<{
    id: string;
    orchestration_id: string;
    name: string;
    config: EmailTriggerConfig;
    last_triggered_at: Date | null;
  }>(
    `SELECT t.id, t.orchestration_id, t.name, t.config, t.last_triggered_at
     FROM orchestration_triggers t
     INNER JOIN orchestrations o ON o.id = t.orchestration_id
     WHERE t.trigger_type = 'email'
       AND t.status = 'active'
       AND (t.config->>'enabled')::boolean = true
       AND o.status = 'published'
     ORDER BY t.last_triggered_at ASC NULLS FIRST`
  );
  
  return result.rows.map(row => ({
    id: row.id,
    orchestrationId: row.orchestration_id,
    name: row.name,
    config: row.config,
    lastPolledAt: row.last_triggered_at,
  }));
}

/**
 * Update trigger last polled timestamp
 */
export async function updateTriggerLastPolled(triggerId: string): Promise<void> {
  const pool = await getPool();
  
  await pool.query(
    `UPDATE orchestration_triggers
     SET last_triggered_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [triggerId]
  );
}
