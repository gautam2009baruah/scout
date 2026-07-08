/**
 * Get Webhook Trigger Details API
 * Returns webhook configuration and recent deliveries
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id: webhookId } = await context.params;

    const pool = getPool();

    // Get webhook trigger details
    const webhookResult = await pool.query(
      `SELECT
        wt.id,
        wt.orchestration_id,
        wt.trigger_id,
        wt.webhook_token,
        wt.webhook_url,
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
        wt.updated_at,
        o.name as orchestration_name
       FROM webhook_triggers wt
       INNER JOIN orchestrations o ON wt.orchestration_id = o.id
       WHERE wt.id = $1
       AND o.company_id = $2`,
      [webhookId, session.user.tenantId]
    );

    if (webhookResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Webhook not found" },
        { status: 404 }
      );
    }

    const webhook = webhookResult.rows[0];

    // Get recent deliveries
    const deliveriesResult = await pool.query(
      `SELECT
        id,
        execution_id,
        request_method,
        request_ip,
        status_code,
        processing_duration_ms,
        signature_valid,
        ip_allowed,
        filters_matched,
        success,
        error_message,
        created_at
       FROM webhook_deliveries
       WHERE webhook_trigger_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [webhookId]
    );

    return NextResponse.json({
      success: true,
      webhook: {
        id: webhook.id,
        orchestrationId: webhook.orchestration_id,
        orchestrationName: webhook.orchestration_name,
        triggerId: webhook.trigger_id,
        webhookToken: webhook.webhook_token,
        webhookUrl: webhook.webhook_url,
        allowedIps: webhook.allowed_ips || [],
        requireSignature: webhook.require_signature,
        expectedMethod: webhook.expected_method,
        expectedContentType: webhook.expected_content_type,
        payloadFilters: webhook.payload_filters || {},
        dataMapping: webhook.data_mapping || {},
        isActive: webhook.is_active,
        lastTriggeredAt: webhook.last_triggered_at,
        totalDeliveries: webhook.total_deliveries,
        successfulDeliveries: webhook.successful_deliveries,
        failedDeliveries: webhook.failed_deliveries,
        createdAt: webhook.created_at,
        updatedAt: webhook.updated_at,
      },
      deliveries: deliveriesResult.rows,
    });
  } catch (error: any) {
    console.error("[WebhookDetailsAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
