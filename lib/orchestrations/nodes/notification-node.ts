// Notification node executor
// Sends notifications via various channels

import type { NotificationNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";
import { sendEmail } from "@/lib/admin/email";
import { getPool } from "@/lib/db/pool";

/**
 * Send notification via configured channel
 * Supports email, Teams, Slack, and internal notifications
 */
export async function executeNotificationNode(
  config: NotificationNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    // Evaluate recipient (may contain variable expression)
    const recipient = evaluateExpression(config.recipient, context);

    if (!recipient) {
      throw new Error("Recipient is required");
    }

    // Evaluate message template (supports variable expressions)
    const message = evaluateExpression(config.message, context);
    const subject = config.subject ? evaluateExpression(config.subject, context) : undefined;

    // Send notification based on channel
    let notificationId: string | undefined;

    switch (config.channel) {
      case "email":
        await sendEmailNotification(String(recipient), String(subject || "Notification"), String(message));
        break;

      case "teams":
        await sendTeamsNotification(String(recipient), String(message), subject ? String(subject) : undefined);
        break;

      case "slack":
        await sendSlackNotification(String(recipient), String(message));
        break;

      case "internal":
        notificationId = await createInternalNotification(String(recipient), String(message), String(subject || "Orchestration Notification"));
        break;

      default:
        throw new Error(`Unknown notification channel: ${config.channel}`);
    }

    return {
      success: true,
      output: {
        notificationSent: true,
        channel: config.channel,
        recipient: String(recipient),
        notificationId,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Send email notification
 */
async function sendEmailNotification(to: string, subject: string, body: string): Promise<void> {
  await sendEmail({ to, subject, body });
}

/**
 * Send Microsoft Teams notification via webhook
 */
async function sendTeamsNotification(webhookUrl: string, message: string, title?: string): Promise<void> {
  if (!webhookUrl.startsWith("http")) {
    throw new Error("Invalid Teams webhook URL. Must start with http or https.");
  }

  const payload = {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    summary: title || "Orchestration Notification",
    themeColor: "0078D4",
    title: title || "Orchestration Notification",
    text: message,
    potentialAction: []
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to send Teams notification: ${response.status} ${errorText}`);
  }
}

/**
 * Send Slack notification via webhook
 */
async function sendSlackNotification(webhookUrl: string, message: string): Promise<void> {
  if (!webhookUrl.startsWith("http")) {
    throw new Error("Invalid Slack webhook URL. Must start with http or https.");
  }

  const payload = {
    text: message,
    mrkdwn: true,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to send Slack notification: ${response.status} ${errorText}`);
  }
}

/**
 * Create internal notification record
 * Stores notification in database for in-app display
 */
async function createInternalNotification(userId: string, message: string, title: string): Promise<string> {
  const pool = getPool();
  let resolvedUserId = userId.trim();

  // The UI commonly identifies notification recipients by email, while the
  // persisted notification relation uses the user's UUID.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(resolvedUserId)) {
    const userResult = await pool.query<{ id: string }>(
      `SELECT id
       FROM users
       WHERE lower(email) = lower($1)
         AND status = 'active'
       ORDER BY created_at ASC
       LIMIT 1`,
      [resolvedUserId]
    );

    if (userResult.rowCount === 0) {
      throw new Error(`Active internal-notification user not found: ${resolvedUserId}`);
    }

    resolvedUserId = userResult.rows[0].id;
  }
  
  // Check if internal_notifications table exists, create if not
  // For production, this should be in a migration
  await pool.query(`
    CREATE TABLE IF NOT EXISTS internal_notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id VARCHAR(255) NOT NULL,
      title VARCHAR(500) NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      type VARCHAR(50) DEFAULT 'orchestration',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const result = await pool.query<{ id: string }>(
    `INSERT INTO internal_notifications (user_id, title, message, type)
     VALUES ($1, $2, $3, 'orchestration')
     RETURNING id`,
    [resolvedUserId, title, message]
  );

  return result.rows[0].id;
}
