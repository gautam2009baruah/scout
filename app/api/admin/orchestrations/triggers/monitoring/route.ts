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
    const from = searchParams.get("from") || null; // ISO datetime (UTC)
    const to = searchParams.get("to") || null; // ISO datetime (UTC)

    const pool = getPool();

    // $1/$2 are the (optional) email received_at date range used by the email
    // stat subqueries so the counts match the executions panel exactly.
    // The dynamic trigger filters start at $3.
    const params: any[] = [from, to];
    let paramIndex = 3;

    // Build query with filters.
    // Note: orchestration_triggers uses a `status` text column ('active' |
    // 'inactive' | 'error'), not an is_active boolean. Email stats are derived
    // from email_trigger_messages within the same date range as the executions
    // panel so the numbers agree.
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
        -- Email-specific fields (derived, respecting the received_at date range)
        (
          SELECT COUNT(*)::int FROM email_trigger_messages etm
          WHERE etm.trigger_id = ot.id
            AND ($1::timestamptz IS NULL OR etm.received_at >= $1::timestamptz)
            AND ($2::timestamptz IS NULL OR etm.received_at <= $2::timestamptz)
        ) as email_message_count,
        (
          SELECT MAX(etm.received_at) FROM email_trigger_messages etm
          WHERE etm.trigger_id = ot.id
            AND ($1::timestamptz IS NULL OR etm.received_at >= $1::timestamptz)
            AND ($2::timestamptz IS NULL OR etm.received_at <= $2::timestamptz)
        ) as email_last_found,
        (
          SELECT MAX(etm.processed_at) FROM email_trigger_messages etm
          WHERE etm.trigger_id = ot.id
            AND ($1::timestamptz IS NULL OR etm.received_at >= $1::timestamptz)
            AND ($2::timestamptz IS NULL OR etm.received_at <= $2::timestamptz)
        ) as email_last_ran
      FROM orchestration_triggers ot
      INNER JOIN orchestrations o ON ot.orchestration_id = o.id
      LEFT JOIN guided_workflow_target_apps ta ON ta.id = o.target_app_id
      WHERE 1 = 1
    `;

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
    const triggers = result.rows.map((trigger) => ({
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
      // Email-specific (respecting the date range)
      emailLastFound: trigger.email_last_found,
      emailLastRan: trigger.email_last_ran,
      emailMessageCount: trigger.email_message_count,
    }));

    return NextResponse.json({
      success: true,
      triggers,
    });
  } catch (error: any) {
    console.error("[TriggersMonitoringAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
