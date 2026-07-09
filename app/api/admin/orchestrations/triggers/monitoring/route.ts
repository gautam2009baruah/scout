/**
 * Triggers Monitoring API
 * Returns all triggers with their status, next run times, and execution history
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const triggerType = searchParams.get("triggerType") || undefined;
    const status = searchParams.get("status") || undefined; // "active" or "inactive"
    const companyId = searchParams.get("companyId") || undefined;
    const targetAppId = searchParams.get("targetAppId") || undefined;

    const pool = getPool();

    // Build query with filters.
    // Note: orchestration_triggers uses a `status` text column ('active' |
    // 'inactive' | 'error'), not an is_active boolean. Schedule/email do not
    // have dedicated per-trigger tables; email stats are derived from
    // email_trigger_messages and the last_polled_at watermark.
    let query = `
      SELECT 
        ot.id,
        ot.orchestration_id,
        ot.trigger_type,
        ot.config,
        ot.status,
        ot.last_triggered_at,
        ot.last_polled_at,
        ot.created_at,
        ot.updated_at,
        o.name as orchestration_name,
        o.status as orchestration_status,
        o.company_id,
        o.target_app_id,
        ta.name as target_app_name,
        -- Email-specific fields (derived)
        (
          SELECT COUNT(*)::int FROM email_trigger_messages etm
          WHERE etm.trigger_id = ot.id AND etm.status = 'processed'
        ) as email_total_processed,
        -- Webhook-specific fields
        wt.webhook_url,
        wt.total_deliveries as webhook_total_deliveries,
        wt.successful_deliveries as webhook_successful_deliveries,
        wt.failed_deliveries as webhook_failed_deliveries,
        wt.last_triggered_at as webhook_last_triggered
      FROM orchestration_triggers ot
      INNER JOIN orchestrations o ON ot.orchestration_id = o.id
      LEFT JOIN webhook_triggers wt ON ot.id = wt.trigger_id
      LEFT JOIN guided_workflow_target_apps ta ON ta.id = o.target_app_id
      WHERE 1 = 1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    if (companyId) {
      query += ` AND o.company_id = $${paramIndex}`;
      params.push(companyId);
      paramIndex++;
    }

    if (targetAppId) {
      query += ` AND o.target_app_id = $${paramIndex}`;
      params.push(targetAppId);
      paramIndex++;
    }

    if (triggerType) {
      query += ` AND ot.trigger_type = $${paramIndex}`;
      params.push(triggerType);
      paramIndex++;
    }

    if (status === "active") {
      query += ` AND ot.status = 'active'`;
    } else if (status === "inactive") {
      query += ` AND ot.status <> 'active'`;
    }

    query += ` ORDER BY ot.created_at DESC`;

    const result = await pool.query(query, params);

    // Get recent execution history for each trigger
    const triggersWithHistory = await Promise.all(
      result.rows.map(async (trigger) => {
        const historyResult = await pool.query(
          `SELECT 
            tel.id,
            tel.status,
            tel.payload,
            tel.error_message,
            tel.triggered_at,
            oe.id as execution_id,
            oe.status as execution_status
           FROM trigger_execution_logs tel
           LEFT JOIN orchestration_executions oe ON tel.execution_id = oe.id
           WHERE tel.trigger_id = $1
           ORDER BY tel.triggered_at DESC
           LIMIT 10`,
          [trigger.id]
        );

        return {
          id: trigger.id,
          orchestrationId: trigger.orchestration_id,
          orchestrationName: trigger.orchestration_name,
          orchestrationStatus: trigger.orchestration_status,
          triggerType: trigger.trigger_type,
          isActive: trigger.status === "active",
          companyId: trigger.company_id,
          targetAppId: trigger.target_app_id,
          targetAppName: trigger.target_app_name,
          lastTriggeredAt: trigger.last_triggered_at,
          lastPolledAt: trigger.last_polled_at,
          createdAt: trigger.created_at,
          updatedAt: trigger.updated_at,
          // Schedule-specific (no dedicated table yet)
          scheduleNextRun: null,
          scheduleLastRun: null,
          scheduleExecutionCount: 0,
          scheduleErrorCount: 0,
          scheduleLastError: null,
          // Email-specific
          emailLastCheck: trigger.last_polled_at,
          emailLastTriggeredId: null,
          emailTotalProcessed: trigger.email_total_processed,
          // Webhook-specific
          webhookUrl: trigger.webhook_url,
          webhookTotalDeliveries: trigger.webhook_total_deliveries,
          webhookSuccessfulDeliveries: trigger.webhook_successful_deliveries,
          webhookFailedDeliveries: trigger.webhook_failed_deliveries,
          webhookLastTriggered: trigger.webhook_last_triggered,
          // Recent history
          recentExecutions: historyResult.rows.map((log) => ({
            id: log.id,
            status: log.status,
            triggeredAt: log.triggered_at,
            executionId: log.execution_id,
            executionStatus: log.execution_status,
            errorMessage: log.error_message,
          })),
        };
      })
    );

    return NextResponse.json({
      success: true,
      triggers: triggersWithHistory,
    });
  } catch (error: any) {
    console.error("[TriggersMonitoringAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
