/**
 * Webhook Trigger Registration API
 * Create or update webhook trigger for an orchestration
 * Called internally when a webhook trigger is saved
 */

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      orchestrationId,
      triggerId,
      secretKey,
      allowedIps,
      requireSignature,
      expectedMethod,
      expectedContentType,
      payloadFilters,
      dataMapping,
    } = body;

    if (!orchestrationId || !triggerId) {
      return NextResponse.json(
        { success: false, error: "orchestrationId and triggerId are required" },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Check if webhook trigger already exists for this trigger_id
    const existingResult = await pool.query(
      `SELECT id, webhook_token, webhook_url FROM webhook_triggers WHERE trigger_id = $1`,
      [triggerId]
    );

    let webhookToken: string;
    let webhookUrl: string;
    let webhookId: string;

    if (existingResult.rowCount > 0) {
      // Update existing webhook trigger
      const existing = existingResult.rows[0];
      webhookToken = existing.webhook_token;
      webhookUrl = existing.webhook_url;
      webhookId = existing.id;

      await pool.query(
        `UPDATE webhook_triggers
         SET secret_key = $1,
             allowed_ips = $2,
             require_signature = $3,
             expected_method = $4,
             expected_content_type = $5,
             payload_filters = $6,
             data_mapping = $7,
             updated_by_email = $8,
             updated_at = NOW()
         WHERE id = $9`,
        [
          secretKey || null,
          allowedIps || null,
          requireSignature || false,
          expectedMethod || "POST",
          expectedContentType || "application/json",
          payloadFilters ? JSON.stringify(payloadFilters) : null,
          dataMapping ? JSON.stringify(dataMapping) : null,
          session.user.email,
          webhookId,
        ]
      );
    } else {
      // Create new webhook trigger
      webhookToken = crypto.randomBytes(32).toString("hex");

      // Get base URL from environment or request
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        `${request.headers.get("x-forwarded-proto") || "http"}://${request.headers.get("host")}`;

      webhookUrl = `${baseUrl}/api/webhooks/${webhookToken}`;

      const result = await pool.query(
        `INSERT INTO webhook_triggers (
          orchestration_id,
          trigger_id,
          webhook_token,
          webhook_url,
          secret_key,
          allowed_ips,
          require_signature,
          expected_method,
          expected_content_type,
          payload_filters,
          data_mapping,
          created_by_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, webhook_token, webhook_url, created_at`,
        [
          orchestrationId,
          triggerId,
          webhookToken,
          webhookUrl,
          secretKey || null,
          allowedIps || null,
          requireSignature || false,
          expectedMethod || "POST",
          expectedContentType || "application/json",
          payloadFilters ? JSON.stringify(payloadFilters) : null,
          dataMapping ? JSON.stringify(dataMapping) : null,
          session.user.email,
        ]
      );

      const webhook = result.rows[0];
      webhookId = webhook.id;
    }

    // Get statistics
    const statsResult = await pool.query(
      `SELECT
        total_deliveries,
        successful_deliveries,
        failed_deliveries,
        last_triggered_at
       FROM webhook_triggers
       WHERE id = $1`,
      [webhookId]
    );

    const stats = statsResult.rows[0];

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhookId,
        webhookToken,
        webhookUrl,
        stats: {
          total: stats.total_deliveries,
          success: stats.successful_deliveries,
          failed: stats.failed_deliveries,
          lastTriggered: stats.last_triggered_at,
        },
      },
    });
  } catch (error: any) {
    console.error("[WebhookRegisterAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
