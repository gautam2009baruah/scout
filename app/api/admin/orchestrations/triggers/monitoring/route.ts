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

    const pool = getPool();

    // Build query with filters
    let query = `
      SELECT 
        ot.id,
        ot.orchestration_id,
        ot.trigger_type,
        ot.config,
        ot.is_active,
        ot.last_triggered_at,
        ot.created_at,
        ot.updated_at,
        o.name as orchestration_name,
        o.status as orchestration_status,
        -- Schedule-specific fields
        st.next_run_at as schedule_next_run,
        st.last_run_at as schedule_last_run,
        st.execution_count as schedule_execution_count,
        st.error_count as schedule_error_count,
        st.last_error as schedule_last_error,
        -- Email-specific fields
        et.last_check_at as email_last_check,
        et.last_triggered_email_id as email_last_triggered_id,
        et.total_emails_processed as email_total_processed,
        -- Webhook-specific fields
        wt.webhook_url,
        wt.total_deliveries as webhook_total_deliveries,
        wt.successful_deliveries as webhook_successful_deliveries,
        wt.failed_deliveries as webhook_failed_deliveries,
        wt.last_triggered_at as webhook_last_triggered
      FROM orchestration_triggers ot
      INNER JOIN orchestrations o ON ot.orchestration_id = o.id
      LEFT JOIN schedule_triggers st ON ot.id = st.trigger_id
      LEFT JOIN email_triggers et ON ot.id = et.trigger_id
      LEFT JOIN webhook_triggers wt ON ot.id = wt.trigger_id
      WHERE o.company_id = $1
    `;

    const params: any[] = [session.user.tenantId];
    let paramIndex = 2;

    if (triggerType) {
      query += ` AND ot.trigger_type = $${paramIndex}`;
      params.push(triggerType);
      paramIndex++;
    }

    if (status === "active") {
      query += ` AND ot.is_active = true`;
    } else if (status === "inactive") {
      query += ` AND ot.is_active = false`;
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
          isActive: trigger.is_active,
          lastTriggeredAt: trigger.last_triggered_at,
          createdAt: trigger.created_at,
          updatedAt: trigger.updated_at,
          // Schedule-specific
          scheduleNextRun: trigger.schedule_next_run,
          scheduleLastRun: trigger.schedule_last_run,
          scheduleExecutionCount: trigger.schedule_execution_count,
          scheduleErrorCount: trigger.schedule_error_count,
          scheduleLastError: trigger.schedule_last_error,
          // Email-specific
          emailLastCheck: trigger.email_last_check,
          emailLastTriggeredId: trigger.email_last_triggered_id,
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
