/**
 * Webhook Trigger Registration API
 * Create or update webhook trigger for an orchestration
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

    // Generate unique webhook token
    const webhookToken = crypto.randomBytes(32).toString("hex");

    // Get base URL from environment or request
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      `${request.headers.get("x-forwarded-proto") || "http"}://${request.headers.get("host")}`;

    const webhookUrl = `${baseUrl}/api/webhooks/${webhookToken}`;

    // Insert webhook trigger
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

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhook.id,
        webhookToken: webhook.webhook_token,
        webhookUrl: webhook.webhook_url,
        createdAt: webhook.created_at,
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
