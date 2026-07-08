/**
 * Webhook Trigger Processor
 * Handles incoming webhook requests, validates them, and triggers orchestrations
 */

import crypto from "crypto";
import { getPool } from "@/lib/db/pool";
import { OrchestrationEngine } from "./engine";
import type {
  WebhookTrigger,
  WebhookRequest,
  WebhookProcessingResult,
  WebhookDelivery,
} from "./webhook-types";

/**
 * Get webhook trigger by token
 */
export async function getWebhookTrigger(
  webhookToken: string
): Promise<WebhookTrigger | null> {
  const pool = getPool();

  const result = await pool.query<{
    id: string;
    orchestration_id: string;
    trigger_id: string;
    webhook_token: string;
    webhook_url: string;
    secret_key: string | null;
    allowed_ips: string[] | null;
    require_signature: boolean;
    expected_method: string;
    expected_content_type: string;
    payload_filters: any;
    data_mapping: any;
    is_active: boolean;
    last_triggered_at: Date | null;
    total_deliveries: number;
    successful_deliveries: number;
    failed_deliveries: number;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT
      wt.id,
      wt.orchestration_id,
      wt.trigger_id,
      wt.webhook_token,
      wt.webhook_url,
      wt.secret_key,
      wt.allowed_ips,
      wt.require_signature,
      wt.expected_method,
      wt.expected_content_type,
      wt.payload_filters,
      wt.data_mapping,
      wt.is_active,
      wt.last_triggered_at,
      wt.total_deliveries,
      wt.successful_deliveries,
      wt.failed_deliveries,
      wt.created_at,
      wt.updated_at
     FROM webhook_triggers wt
     INNER JOIN orchestrations o ON wt.orchestration_id = o.id
     WHERE wt.webhook_token = $1
     AND o.status = 'published'
     LIMIT 1`,
    [webhookToken]
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    triggerId: row.trigger_id,
    webhookToken: row.webhook_token,
    webhookUrl: row.webhook_url,
    secretKey: row.secret_key || undefined,
    allowedIps: row.allowed_ips || undefined,
    requireSignature: row.require_signature,
    expectedMethod: row.expected_method,
    expectedContentType: row.expected_content_type,
    payloadFilters: row.payload_filters || undefined,
    dataMapping: row.data_mapping || undefined,
    isActive: row.is_active,
    lastTriggeredAt: row.last_triggered_at?.toISOString(),
    totalDeliveries: row.total_deliveries,
    successfulDeliveries: row.successful_deliveries,
    failedDeliveries: row.failed_deliveries,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Validate webhook signature (HMAC-SHA256)
 */
function validateSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  // Support both "sha256=..." and raw hex formats
  const signatureValue = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signatureValue),
    Buffer.from(expectedSignature)
  );
}

/**
 * Check if IP is in allowed list
 */
function isIpAllowed(requestIp: string, allowedIps: string[]): boolean {
  if (allowedIps.length === 0) {
    return true;
  }

  // Normalize IPs (handle ::ffff: prefix for IPv4-mapped IPv6)
  const normalizedRequestIp = requestIp.replace(/^::ffff:/, "");

  return allowedIps.some((allowedIp) => {
    const normalizedAllowedIp = allowedIp.replace(/^::ffff:/, "");
    return normalizedRequestIp === normalizedAllowedIp;
  });
}

/**
 * Check if payload matches filters
 */
function matchesFilters(
  payload: any,
  filters: Record<string, any>
): boolean {
  if (!filters || Object.keys(filters).length === 0) {
    return true;
  }

  // Simple key-value matching (can be extended to JSONPath later)
  for (const [key, expectedValue] of Object.entries(filters)) {
    const actualValue = getNestedValue(payload, key);

    if (actualValue === undefined || actualValue !== expectedValue) {
      return false;
    }
  }

  return true;
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((current, key) => current?.[key], obj);
}

/**
 * Extract data from payload using data mapping
 */
function extractData(
  payload: any,
  dataMapping: Record<string, string>
): Record<string, any> {
  const extractedData: Record<string, any> = {};

  for (const [targetKey, sourcePath] of Object.entries(dataMapping)) {
    // Support both dot notation and JSONPath-like syntax
    const value = sourcePath.startsWith("$.")
      ? getNestedValue(payload, sourcePath.slice(2))
      : getNestedValue(payload, sourcePath);

    if (value !== undefined) {
      extractedData[targetKey] = value;
    }
  }

  return extractedData;
}

/**
 * Process webhook request
 */
export async function processWebhook(
  webhookToken: string,
  request: WebhookRequest
): Promise<WebhookProcessingResult> {
  const startTime = Date.now();
  const pool = getPool();

  try {
    // Get webhook trigger configuration
    const trigger = await getWebhookTrigger(webhookToken);

    if (!trigger) {
      return {
        success: false,
        statusCode: 404,
        message: "Webhook not found",
        validations: {},
      };
    }

    if (!trigger.isActive) {
      return {
        success: false,
        statusCode: 403,
        message: "Webhook is disabled",
        validations: {},
      };
    }

    const validations: WebhookProcessingResult["validations"] = {};

    // Validate IP if whitelist is configured
    if (trigger.allowedIps && trigger.allowedIps.length > 0) {
      validations.ipAllowed = isIpAllowed(request.ip, trigger.allowedIps);
      if (!validations.ipAllowed) {
        await logWebhookDelivery(trigger, request, {
          success: false,
          statusCode: 403,
          message: "IP not allowed",
          validations,
        }, startTime);

        return {
          success: false,
          statusCode: 403,
          message: "IP address not allowed",
          validations,
        };
      }
    }

    // Validate signature if required
    if (trigger.requireSignature && trigger.secretKey) {
      const signature =
        request.headers["x-hub-signature-256"] ||
        request.headers["x-webhook-signature"];

      const rawBody =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

      validations.signatureValid = validateSignature(
        rawBody,
        signature,
        trigger.secretKey
      );

      if (!validations.signatureValid) {
        await logWebhookDelivery(trigger, request, {
          success: false,
          statusCode: 401,
          message: "Invalid signature",
          validations,
        }, startTime);

        return {
          success: false,
          statusCode: 401,
          message: "Invalid webhook signature",
          validations,
        };
      }
    }

    // Parse payload
    let payload: any = request.body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (error) {
        await logWebhookDelivery(trigger, request, {
          success: false,
          statusCode: 400,
          message: "Invalid JSON payload",
          validations,
        }, startTime);

        return {
          success: false,
          statusCode: 400,
          message: "Invalid JSON payload",
          error: String(error),
          validations,
        };
      }
    }

    // Check payload filters
    if (trigger.payloadFilters) {
      validations.filtersMatched = matchesFilters(payload, trigger.payloadFilters);
      if (!validations.filtersMatched) {
        await logWebhookDelivery(trigger, request, {
          success: false,
          statusCode: 200, // 200 OK but filtered out
          message: "Payload filters not matched",
          validations,
        }, startTime);

        return {
          success: true, // Success but filtered
          statusCode: 200,
          message: "Webhook received but filters not matched",
          validations,
        };
      }
    }

    // Extract data from payload
    const extractedData = trigger.dataMapping
      ? extractData(payload, trigger.dataMapping)
      : {};

    // Trigger orchestration
    const engine = new OrchestrationEngine();
    const execution = await engine.execute(trigger.orchestrationId, {
      webhookPayload: payload,
      ...extractedData,
    });

    // Update webhook statistics
    await pool.query(
      `UPDATE webhook_triggers
       SET last_triggered_at = NOW(),
           total_deliveries = total_deliveries + 1,
           successful_deliveries = successful_deliveries + 1
       WHERE id = $1`,
      [trigger.id]
    );

    const result: WebhookProcessingResult = {
      success: true,
      executionId: execution.id,
      statusCode: 200,
      message: "Webhook processed successfully",
      extractedData,
      validations,
    };

    // Log delivery
    await logWebhookDelivery(trigger, request, result, startTime, execution.id);

    return result;
  } catch (error: any) {
    console.error("[WebhookProcessor] Error processing webhook:", error);

    const result: WebhookProcessingResult = {
      success: false,
      statusCode: 500,
      message: "Internal server error",
      error: error.message,
      validations: {},
    };

    // Try to log delivery even on error
    try {
      const trigger = await getWebhookTrigger(webhookToken);
      if (trigger) {
        await logWebhookDelivery(trigger, request, result, startTime);

        // Update failed deliveries count
        await pool.query(
          `UPDATE webhook_triggers
           SET total_deliveries = total_deliveries + 1,
               failed_deliveries = failed_deliveries + 1
           WHERE id = $1`,
          [trigger.id]
        );
      }
    } catch (logError) {
      console.error("[WebhookProcessor] Error logging delivery:", logError);
    }

    return result;
  }
}

/**
 * Log webhook delivery
 */
async function logWebhookDelivery(
  trigger: WebhookTrigger,
  request: WebhookRequest,
  result: WebhookProcessingResult,
  startTime: number,
  executionId?: string
): Promise<void> {
  const pool = getPool();
  const processingDuration = Date.now() - startTime;

  await pool.query(
    `INSERT INTO webhook_deliveries (
      webhook_trigger_id,
      orchestration_id,
      execution_id,
      request_method,
      request_headers,
      request_body,
      request_ip,
      request_user_agent,
      status_code,
      response_body,
      processing_duration_ms,
      signature_valid,
      ip_allowed,
      filters_matched,
      success,
      error_message,
      extracted_data
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      trigger.id,
      trigger.orchestrationId,
      executionId || null,
      request.method,
      JSON.stringify(request.headers),
      typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body),
      request.ip,
      request.userAgent || null,
      result.statusCode,
      result.message,
      processingDuration,
      result.validations.signatureValid ?? null,
      result.validations.ipAllowed ?? null,
      result.validations.filtersMatched ?? null,
      result.success,
      result.error || null,
      result.extractedData ? JSON.stringify(result.extractedData) : null,
    ]
  );
}
