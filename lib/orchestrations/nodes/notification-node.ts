// Notification node executor
// Sends notifications via multiple channels with retry and detailed outputs.

import type { NotificationNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";
import { sendEmail } from "@/lib/admin/email";
import { getPool } from "@/lib/db/pool";

type ChannelKey = "email" | "internal" | "teams" | "slack" | "sms" | "whatsapp";

type RetryConfig = {
  enabled?: boolean;
  maxAttempts?: number;
  delaySeconds?: number;
};

type DeliveryConfig = {
  mode?: "immediate" | "scheduled";
  scheduledAt?: string;
};

type ChannelResult = {
  channel: ChannelKey;
  status: "sent" | "scheduled" | "failed";
  attempts: number;
  sentAt?: string;
  scheduledFor?: string;
  error?: string;
  details?: Record<string, unknown>;
};

/**
 * Send notification via configured channels.
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
    const channels = normalizeChannels(config);
    const enabledChannels = (Object.entries(channels) as Array<[ChannelKey, any]>).filter(
      ([, value]) => value?.enabled === true
    );

    if (enabledChannels.length === 0) {
      throw new Error("At least one notification channel must be enabled");
    }

    const startedAt = new Date().toISOString();
    const results: ChannelResult[] = [];

    for (const [channel, channelConfig] of enabledChannels) {
      const result = await executeWithRetry(channel, channelConfig, context);
      results.push(result);
    }

    const failed = results.filter((r) => r.status === "failed");
    const sent = results.filter((r) => r.status === "sent");
    const scheduled = results.filter((r) => r.status === "scheduled");

    const output = {
      notificationSent: failed.length === 0,
      startedAt,
      completedAt: new Date().toISOString(),
      attemptedChannelCount: enabledChannels.length,
      sentChannelCount: sent.length,
      scheduledChannelCount: scheduled.length,
      failedChannelCount: failed.length,
      enabledChannels: enabledChannels.map(([channel]) => channel),
      channelResults: results,
    };

    if (failed.length > 0) {
      const errorSummary = failed
        .map((entry) => `${entry.channel}: ${entry.error || "unknown error"}`)
        .join("; ");
      return {
        success: false,
        error: `Notification delivery failed for ${failed.length} channel(s): ${errorSummary}`,
        output,
      };
    }

    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

function normalizeChannels(config: NotificationNodeConfig): Record<ChannelKey, any> {
  const defaults: Record<ChannelKey, any> = {
    email: {
      enabled: false,
      bodyFormat: "rich_text",
      priority: "normal",
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
    },
    internal: {
      enabled: false,
      notificationType: "information",
      persistentUntilRead: false,
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 1 },
    },
    teams: {
      enabled: false,
      messageFormat: "adaptive_card",
      actionButtons: [],
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
    },
    slack: {
      enabled: false,
      messageFormat: "plain_text",
      actionButtons: [],
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
    },
    sms: {
      enabled: false,
      unicodeSupport: false,
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
    },
    whatsapp: {
      enabled: false,
      messageType: "session_message",
      templateLanguage: "en",
      interactiveButtons: [],
      delivery: { mode: "immediate" },
      retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
    },
  };

  if (config.channels) {
    return {
      email: { ...defaults.email, ...(config.channels.email || {}) },
      internal: { ...defaults.internal, ...(config.channels.internal || {}) },
      teams: { ...defaults.teams, ...(config.channels.teams || {}) },
      slack: { ...defaults.slack, ...(config.channels.slack || {}) },
      sms: { ...defaults.sms, ...(config.channels.sms || {}) },
      whatsapp: { ...defaults.whatsapp, ...(config.channels.whatsapp || {}) },
    };
  }

  // Backward compatibility for old single-channel config.
  const channel = config.channel || "email";
  if (channel === "email") {
    defaults.email = {
      ...defaults.email,
      enabled: true,
      to: config.recipient || "",
      subject: config.subject || "Notification",
      body: config.message || "",
      template: config.template,
    };
  } else if (channel === "internal") {
    defaults.internal = {
      ...defaults.internal,
      enabled: true,
      users: config.recipient || "",
      title: config.subject || "Orchestration Notification",
      message: config.message || "",
    };
  } else if (channel === "teams") {
    defaults.teams = {
      ...defaults.teams,
      enabled: true,
      webhookUrl: config.recipient || "",
      title: config.subject || "Orchestration Notification",
      message: config.message || "",
      messageFormat: "adaptive_card",
    };
  } else if (channel === "slack") {
    defaults.slack = {
      ...defaults.slack,
      enabled: true,
      webhookUrl: config.recipient || "",
      message: config.message || "",
      messageFormat: "plain_text",
    };
  }

  return defaults;
}

async function executeWithRetry(
  channel: ChannelKey,
  channelConfig: any,
  context: Record<string, unknown>
): Promise<ChannelResult> {
  const delivery = (channelConfig.delivery || {}) as DeliveryConfig;
  const retry = (channelConfig.retry || {}) as RetryConfig;

  const { scheduled, scheduledAt } = evaluateDeliveryWindow(delivery, context);
  if (scheduled) {
    console.info("[NotificationNode] Scheduled delivery retained", {
      channel,
      scheduledAt,
    });
    return {
      channel,
      status: "scheduled",
      attempts: 0,
      scheduledFor: scheduledAt,
      details: {
        deliveryMode: "scheduled",
        note: "Notification retained for scheduled delivery. Ensure external scheduler dispatches this node at or after scheduledAt.",
      },
    };
  }

  const retriesEnabled = retry.enabled !== false;
  const maxAttempts = retriesEnabled ? clampInt(retry.maxAttempts ?? 2, 1, 10) : 1;
  const delayMs = clampInt(retry.delaySeconds ?? 2, 0, 300) * 1000;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.info("[NotificationNode] Sending channel", { channel, attempt, maxAttempts });

      const details = await sendByChannel(channel, channelConfig, context);

      console.info("[NotificationNode] Channel sent", { channel, attempt });
      return {
        channel,
        status: "sent",
        attempts: attempt,
        sentAt: new Date().toISOString(),
        details,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("[NotificationNode] Channel send failed", {
        channel,
        attempt,
        maxAttempts,
        error: errorMessage,
      });

      if (attempt >= maxAttempts) {
        return {
          channel,
          status: "failed",
          attempts: attempt,
          error: errorMessage,
        };
      }

      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  return {
    channel,
    status: "failed",
    attempts: maxAttempts,
    error: "Failed after retries",
  };
}

function evaluateDeliveryWindow(
  delivery: DeliveryConfig,
  context: Record<string, unknown>
): { scheduled: boolean; scheduledAt?: string } {
  if (delivery.mode !== "scheduled") {
    return { scheduled: false };
  }

  const rawScheduledAt = interpolateString(delivery.scheduledAt || "", context);
  if (!rawScheduledAt) {
    throw new Error("Scheduled delivery requires a date/time");
  }

  const scheduledDate = new Date(rawScheduledAt);
  if (Number.isNaN(scheduledDate.getTime())) {
    throw new Error(`Invalid scheduled delivery date/time: ${rawScheduledAt}`);
  }

  if (scheduledDate.getTime() > Date.now()) {
    return { scheduled: true, scheduledAt: scheduledDate.toISOString() };
  }

  return { scheduled: false };
}

async function sendByChannel(
  channel: ChannelKey,
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  switch (channel) {
    case "email":
      return await sendEmailNotification(channelConfig, context);
    case "internal":
      return await sendInternalNotification(channelConfig, context);
    case "teams":
      return await sendTeamsNotification(channelConfig, context);
    case "slack":
      return await sendSlackNotification(channelConfig, context);
    case "sms":
      return await sendSmsNotification(channelConfig, context);
    case "whatsapp":
      return await sendWhatsAppNotification(channelConfig, context);
    default:
      throw new Error(`Unsupported notification channel: ${channel}`);
  }
}

async function sendEmailNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const to = interpolateString(channelConfig.to || "", context);
  if (!to) {
    throw new Error("Email recipients (To) are required");
  }

  const subject = interpolateString(channelConfig.subject || "Notification", context);
  const body = interpolateString(channelConfig.body || "", context);
  if (!body) {
    throw new Error("Email message body is required");
  }

  const cc = interpolateString(channelConfig.cc || "", context);
  const bcc = interpolateString(channelConfig.bcc || "", context);
  const fromName = interpolateString(channelConfig.fromName || "", context);
  const senderCredentialId = interpolateString(channelConfig.senderCredentialId || "", context);
  if (!senderCredentialId) {
    throw new Error("Email sender provider is required");
  }
  const companyId = resolveContextValue(context, ["companyId", "company_id", "trigger.input.companyId", "trigger.input.company_id", "trigger.companyId", "trigger.company_id"]);
  const targetAppId = resolveContextValue(context, ["targetAppId", "target_app_id", "trigger.input.targetAppId", "trigger.input.target_app_id", "trigger.targetAppId", "trigger.target_app_id"]);

  const attachments = Array.isArray(channelConfig.attachments)
    ? channelConfig.attachments
        .map((attachment: any) => ({
          filename: interpolateString(attachment?.name || "", context) || undefined,
          path: interpolateString(attachment?.url || "", context) || undefined,
          contentType: interpolateString(attachment?.contentType || "", context) || undefined,
        }))
        .filter((attachment: any) => attachment.path)
    : [];

  await sendEmail({
    to,
    cc: cc || undefined,
    bcc: bcc || undefined,
    fromName: fromName || undefined,
    subject,
    body,
    senderCredentialId: senderCredentialId || undefined,
    companyId: companyId || undefined,
    targetAppId: targetAppId || undefined,
    htmlBody: channelConfig.bodyFormat === "rich_text" ? body : undefined,
    priority: channelConfig.priority || "normal",
    attachments,
  });

  return {
    recipients: {
      to: splitCsv(to),
      cc: splitCsv(cc),
      bcc: splitCsv(bcc),
    },
    subject,
    bodyFormat: channelConfig.bodyFormat || "rich_text",
    template: interpolateString(channelConfig.template || "", context) || null,
    attachmentCount: attachments.length,
    priority: channelConfig.priority || "normal",
    senderCredentialId: senderCredentialId || null,
  };
}

async function sendInternalNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const title = interpolateString(channelConfig.title || "Orchestration Notification", context);
  const message = interpolateString(channelConfig.message || "", context);

  if (!message) {
    throw new Error("Internal notification message is required");
  }

  const users = splitCsv(interpolateString(channelConfig.users || "", context));
  const roles = splitCsv(interpolateString(channelConfig.roles || "", context));
  const teams = splitCsv(interpolateString(channelConfig.teams || "", context));
  const groups = splitCsv(interpolateString(channelConfig.groups || "", context));

  if (users.length === 0 && roles.length === 0 && teams.length === 0 && groups.length === 0) {
    throw new Error("At least one internal recipient is required (users, roles, teams, or groups)");
  }

  const recipientUserIds = await resolveInternalRecipientUserIds({ users, roles, teams, groups });
  if (recipientUserIds.length === 0) {
    throw new Error("Unable to resolve any active internal recipients");
  }

  const notificationIds: string[] = [];
  for (const userId of recipientUserIds) {
    const notificationId = await createInternalNotification({
      userId,
      title,
      message,
      type: channelConfig.notificationType || "information",
      actionLabel: interpolateString(channelConfig.actionLabel || "", context) || null,
      actionUrl: interpolateString(channelConfig.actionUrl || "", context) || null,
      expiryDate: interpolateString(channelConfig.expiryDate || "", context) || null,
      persistentUntilRead: channelConfig.persistentUntilRead === true,
      metadata: {
        recipients: { users, roles, teams, groups },
      },
    });
    notificationIds.push(notificationId);
  }

  return {
    title,
    message,
    notificationType: channelConfig.notificationType || "information",
    recipientCount: recipientUserIds.length,
    recipientUserIds,
    notificationIds,
    actionLabel: interpolateString(channelConfig.actionLabel || "", context) || null,
    actionUrl: interpolateString(channelConfig.actionUrl || "", context) || null,
    expiryDate: interpolateString(channelConfig.expiryDate || "", context) || null,
    persistentUntilRead: channelConfig.persistentUntilRead === true,
  };
}

async function sendTeamsNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const webhookUrl = interpolateString(
    channelConfig.webhookUrl || channelConfig.connection || "",
    context
  );
  if (!isHttpUrl(webhookUrl)) {
    throw new Error("Microsoft Teams webhook URL is required and must start with http/https");
  }

  const title = interpolateString(channelConfig.title || "Orchestration Notification", context);
  const message = interpolateString(channelConfig.message || "", context);
  if (!message) {
    throw new Error("Microsoft Teams message is required");
  }

  const mentions = splitCsv(interpolateString(channelConfig.mentions || "", context));
  const actionButtons = normalizeActionButtons(channelConfig.actionButtons || [], context);
  const messageFormat = channelConfig.messageFormat || "adaptive_card";

  const payload =
    messageFormat === "adaptive_card"
      ? {
          type: "message",
          attachments: [
            {
              contentType: "application/vnd.microsoft.card.adaptive",
              content: {
                type: "AdaptiveCard",
                version: "1.4",
                body: [
                  { type: "TextBlock", size: "Medium", weight: "Bolder", text: title },
                  { type: "TextBlock", wrap: true, text: mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message },
                ],
                actions: actionButtons.map((button) => ({
                  type: "Action.OpenUrl",
                  title: button.label,
                  url: button.url,
                })),
              },
            },
          ],
        }
      : {
          "@type": "MessageCard",
          "@context": "https://schema.org/extensions",
          summary: title,
          title,
          text: mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message,
          potentialAction: actionButtons.map((button) => ({
            "@type": "OpenUri",
            name: button.label,
            targets: [{ os: "default", uri: button.url }],
          })),
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

  return {
    title,
    message,
    messageFormat,
    mentions,
    actionButtonCount: actionButtons.length,
    team: interpolateString(channelConfig.team || "", context) || null,
    channel: interpolateString(channelConfig.channel || "", context) || null,
    webhook: maskWebhook(webhookUrl),
  };
}

async function sendSlackNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const webhookUrl = interpolateString(
    channelConfig.webhookUrl || channelConfig.connection || "",
    context
  );
  if (!isHttpUrl(webhookUrl)) {
    throw new Error("Slack webhook URL is required and must start with http/https");
  }

  const message = interpolateString(channelConfig.message || "", context);
  if (!message) {
    throw new Error("Slack message is required");
  }

  const mentions = splitCsv(interpolateString(channelConfig.mentions || "", context));
  const actionButtons = normalizeActionButtons(channelConfig.actionButtons || [], context);
  const messageFormat = channelConfig.messageFormat || "plain_text";
  const threadTs = interpolateString(channelConfig.threadTs || "", context);

  const payload =
    messageFormat === "block_kit"
      ? {
          text: message,
          thread_ts: threadTs || undefined,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: mentions.length > 0 ? `${mentions.join(" ")}\n${message}` : message,
              },
            },
            ...(actionButtons.length > 0
              ? [
                  {
                    type: "actions",
                    elements: actionButtons.map((button) => ({
                      type: "button",
                      text: { type: "plain_text", text: button.label },
                      url: button.url,
                    })),
                  },
                ]
              : []),
          ],
        }
      : {
          text: mentions.length > 0 ? `${mentions.join(" ")} ${message}` : message,
          mrkdwn: true,
          thread_ts: threadTs || undefined,
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

  return {
    message,
    messageFormat,
    mentions,
    actionButtonCount: actionButtons.length,
    threadTs: threadTs || null,
    channel: interpolateString(channelConfig.channel || "", context) || null,
    directMessageRecipient:
      interpolateString(channelConfig.directMessageRecipient || "", context) || null,
    webhook: maskWebhook(webhookUrl),
  };
}

async function sendSmsNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const recipients = splitCsv(interpolateString(channelConfig.recipients || "", context));
  if (recipients.length === 0) {
    throw new Error("SMS recipient phone numbers are required");
  }

  const message = interpolateString(channelConfig.message || "", context);
  if (!message) {
    throw new Error("SMS message is required");
  }

  const unicodeSupport = channelConfig.unicodeSupport === true;
  const metrics = estimateSmsSegments(message, unicodeSupport);
  const senderId = interpolateString(channelConfig.senderId || "", context);
  const template = interpolateString(channelConfig.template || "", context);

  const webhookUrl = interpolateString(
    channelConfig.webhookUrl || process.env.NOTIFICATION_SMS_WEBHOOK_URL || "",
    context
  );
  if (!isHttpUrl(webhookUrl)) {
    throw new Error(
      "SMS webhook URL is required. Configure channel webhook URL or NOTIFICATION_SMS_WEBHOOK_URL"
    );
  }

  const payload = {
    senderId: senderId || undefined,
    recipients,
    message,
    template: template || undefined,
    unicodeSupport,
    characterCount: metrics.characterCount,
    estimatedSegments: metrics.segments,
  };

  await sendWebhookNotification("sms", webhookUrl, payload);

  return {
    senderId: senderId || null,
    recipients,
    template: template || null,
    unicodeSupport,
    characterCount: metrics.characterCount,
    estimatedSegments: metrics.segments,
    webhook: maskWebhook(webhookUrl),
  };
}

async function sendWhatsAppNotification(
  channelConfig: any,
  context: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const recipients = splitCsv(interpolateString(channelConfig.recipients || "", context));
  if (recipients.length === 0) {
    throw new Error("WhatsApp recipient phone numbers are required");
  }

  const messageType = channelConfig.messageType || "session_message";
  const templateName = interpolateString(channelConfig.templateName || "", context);
  const templateLanguage = interpolateString(channelConfig.templateLanguage || "en", context);
  const templateVariables = splitCsv(
    interpolateString(channelConfig.templateVariables || "", context)
  );
  const body = interpolateString(channelConfig.body || "", context);

  if (messageType === "approved_template" && !templateName) {
    throw new Error("WhatsApp template name is required for approved template messages");
  }

  if (messageType === "session_message" && !body) {
    throw new Error("WhatsApp message body is required for session messages");
  }

  const interactiveButtons = normalizeWhatsAppButtons(
    channelConfig.interactiveButtons || [],
    context
  );

  const webhookUrl = interpolateString(
    channelConfig.webhookUrl || process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL || "",
    context
  );
  if (!isHttpUrl(webhookUrl)) {
    throw new Error(
      "WhatsApp webhook URL is required. Configure channel webhook URL or NOTIFICATION_WHATSAPP_WEBHOOK_URL"
    );
  }

  const payload = {
    businessAccount:
      interpolateString(channelConfig.businessAccount || "", context) || undefined,
    senderNumber:
      interpolateString(channelConfig.senderNumber || "", context) || undefined,
    recipients,
    messageType,
    templateName: templateName || undefined,
    templateLanguage: templateLanguage || undefined,
    templateVariables,
    body: body || undefined,
    mediaAttachment:
      interpolateString(channelConfig.mediaAttachment || "", context) || undefined,
    interactiveButtons,
  };

  await sendWebhookNotification("whatsapp", webhookUrl, payload);

  return {
    recipients,
    messageType,
    templateName: templateName || null,
    templateLanguage: templateLanguage || null,
    templateVariableCount: templateVariables.length,
    body: body || null,
    mediaAttachment:
      interpolateString(channelConfig.mediaAttachment || "", context) || null,
    interactiveButtonCount: interactiveButtons.length,
    webhook: maskWebhook(webhookUrl),
  };
}

async function sendWebhookNotification(
  channel: "sms" | "whatsapp",
  webhookUrl: string,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Failed to send ${channel} notification: ${response.status} ${errorText}`);
  }
}

async function resolveInternalRecipientUserIds(input: {
  users: string[];
  roles: string[];
  teams: string[];
  groups: string[];
}): Promise<string[]> {
  const pool = getPool();
  const userIds = new Set<string>();

  const explicitUsers = await resolveUsersByIdentifiers(input.users);
  explicitUsers.forEach((id) => userIds.add(id));

  const roleUsers = await resolveUsersByRoles(input.roles);
  roleUsers.forEach((id) => userIds.add(id));

  const teamUsers = await resolveUsersByOptionalGroups(
    input.teams,
    "teams",
    [
      { entityTable: "teams", membershipTable: "team_members", entityKey: "team_id" },
      { entityTable: "teams", membershipTable: "user_teams", entityKey: "team_id" },
    ]
  );
  teamUsers.forEach((id) => userIds.add(id));

  const groupUsers = await resolveUsersByOptionalGroups(
    input.groups,
    "groups",
    [
      { entityTable: "groups", membershipTable: "group_members", entityKey: "group_id" },
      { entityTable: "groups", membershipTable: "user_groups", entityKey: "group_id" },
    ]
  );
  groupUsers.forEach((id) => userIds.add(id));

  const activeUsers = await filterActiveUsers(Array.from(userIds));
  return activeUsers;
}

async function resolveUsersByIdentifiers(identifiers: string[]): Promise<string[]> {
  if (identifiers.length === 0) return [];

  const pool = getPool();
  const ids = identifiers.filter((value) => isUuid(value));
  const emails = identifiers
    .filter((value) => !isUuid(value))
    .map((value) => value.toLowerCase());

  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE deleted_at IS NULL
       AND status = 'active'
       AND (
         (cardinality($1::uuid[]) > 0 AND id = ANY($1::uuid[]))
         OR (cardinality($2::text[]) > 0 AND lower(email) = ANY($2::text[]))
       )`,
    [ids, emails]
  );

  return result.rows.map((row) => row.id);
}

async function resolveUsersByRoles(roles: string[]): Promise<string[]> {
  if (roles.length === 0) return [];

  const pool = getPool();
  const roleIds = roles.filter((value) => isUuid(value));
  const roleNames = roles
    .filter((value) => !isUuid(value))
    .map((value) => value.toLowerCase());

  const result = await pool.query<{ user_id: string }>(
    `SELECT DISTINCT ucr.user_id
     FROM user_company_roles ucr
     INNER JOIN roles r ON r.id = ucr.role_id
     INNER JOIN users u ON u.id = ucr.user_id
     WHERE ucr.deleted_at IS NULL
       AND (ucr.status IS NULL OR ucr.status = 'active')
       AND r.deleted_at IS NULL
       AND u.deleted_at IS NULL
       AND u.status = 'active'
       AND (
         (cardinality($1::uuid[]) > 0 AND r.id = ANY($1::uuid[]))
         OR (cardinality($2::text[]) > 0 AND lower(r.name) = ANY($2::text[]))
       )`,
    [roleIds, roleNames]
  );

  return result.rows.map((row) => row.user_id);
}

async function resolveUsersByOptionalGroups(
  identifiers: string[],
  groupLabel: string,
  candidates: Array<{ entityTable: string; membershipTable: string; entityKey: string }>
): Promise<string[]> {
  if (identifiers.length === 0) return [];

  const pool = getPool();
  const ids = identifiers.filter((value) => isUuid(value));
  const names = identifiers
    .filter((value) => !isUuid(value))
    .map((value) => value.toLowerCase());

  for (const candidate of candidates) {
    const exists = await pool.query<{ entity_exists: boolean; membership_exists: boolean }>(
      `SELECT
         to_regclass($1) IS NOT NULL AS entity_exists,
         to_regclass($2) IS NOT NULL AS membership_exists`,
      [candidate.entityTable, candidate.membershipTable]
    );

    if (!exists.rows[0]?.entity_exists || !exists.rows[0]?.membership_exists) {
      continue;
    }

    try {
      const query = `
        SELECT DISTINCT m.user_id
        FROM ${candidate.membershipTable} m
        INNER JOIN ${candidate.entityTable} e ON e.id = m.${candidate.entityKey}
        INNER JOIN users u ON u.id = m.user_id
        WHERE u.deleted_at IS NULL
          AND u.status = 'active'
          AND (
            (cardinality($1::uuid[]) > 0 AND e.id = ANY($1::uuid[]))
            OR (cardinality($2::text[]) > 0 AND lower(e.name) = ANY($2::text[]))
          )
      `;

      const result = await pool.query<{ user_id: string }>(query, [ids, names]);
      return result.rows.map((row) => row.user_id);
    } catch (error) {
      console.warn(`[NotificationNode] Failed to resolve ${groupLabel} recipients via ${candidate.membershipTable}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return [];
}

async function filterActiveUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];

  const pool = getPool();
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE id = ANY($1::uuid[])
       AND deleted_at IS NULL
       AND status = 'active'`,
    [userIds]
  );

  return result.rows.map((row) => row.id);
}

async function createInternalNotification(input: {
  userId: string;
  title: string;
  message: string;
  type: string;
  actionLabel: string | null;
  actionUrl: string | null;
  expiryDate: string | null;
  persistentUntilRead: boolean;
  metadata: Record<string, unknown>;
}): Promise<string> {
  const pool = getPool();

  const expiresAt = input.expiryDate ? new Date(input.expiryDate) : null;
  if (input.expiryDate && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
    throw new Error(`Invalid internal notification expiry date: ${input.expiryDate}`);
  }

  let result;
  try {
    result = await pool.query<{ id: string }>(
      `INSERT INTO internal_notifications (
         user_id,
         title,
         message,
         type,
         notification_type,
         action_label,
         action_url,
         expires_at,
         persistent_until_read,
         metadata
       )
       VALUES ($1, $2, $3, 'orchestration', $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.userId,
        input.title,
        input.message,
        input.type,
        input.actionLabel,
        input.actionUrl,
        expiresAt ? expiresAt.toISOString() : null,
        input.persistentUntilRead,
        JSON.stringify(input.metadata),
      ]
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to insert internal notification. Ensure DB migrations are applied (including 053 and 086). Original error: ${errorMessage}`
    );
  }

  return result.rows[0].id;
}

function normalizeActionButtons(
  buttons: Array<{ label?: string; url?: string }>,
  context: Record<string, unknown>
): Array<{ label: string; url: string }> {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((button) => ({
      label: interpolateString(button?.label || "", context),
      url: interpolateString(button?.url || "", context),
    }))
    .filter((button) => button.label && isHttpUrl(button.url));
}

function normalizeWhatsAppButtons(
  buttons: Array<{ label?: string; actionType?: string; value?: string }>,
  context: Record<string, unknown>
): Array<{ label: string; actionType: "url" | "reply"; value: string }> {
  if (!Array.isArray(buttons)) return [];

  return buttons
    .map((button) => {
      const label = interpolateString(button?.label || "", context);
      const value = interpolateString(button?.value || "", context);
      const actionType: "url" | "reply" = button?.actionType === "reply" ? "reply" : "url";
      return { label, actionType, value };
    })
    .filter((button) => {
      if (!button.label || !button.value) return false;
      if (button.actionType === "url") return isHttpUrl(button.value);
      return true;
    });
}

function estimateSmsSegments(message: string, unicodeSupport: boolean): {
  characterCount: number;
  segments: number;
} {
  const characterCount = message.length;

  if (characterCount === 0) {
    return { characterCount: 0, segments: 0 };
  }

  const singleLimit = unicodeSupport ? 70 : 160;
  const concatLimit = unicodeSupport ? 67 : 153;

  if (characterCount <= singleLimit) {
    return { characterCount, segments: 1 };
  }

  return {
    characterCount,
    segments: Math.ceil(characterCount / concatLimit),
  };
}

function interpolateString(template: string, context: Record<string, unknown>): string {
  if (!template) return "";
  const value = evaluateExpression(template, context);
  return value == null ? "" : String(value).trim();
}

function resolveContextValue(context: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = evaluateExpression(`{{${key}}}`, context);
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function splitCsv(value: string): string[] {
  return String(value || "")
    .split(/[\n,;]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function maskWebhook(url: string): string {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const end = parsed.pathname.length > 8 ? parsed.pathname.slice(-8) : parsed.pathname;
    return `${parsed.origin}/...${end}`;
  } catch {
    return "***";
  }
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(String(value || ""));
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(Math.max(n, min), max);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
