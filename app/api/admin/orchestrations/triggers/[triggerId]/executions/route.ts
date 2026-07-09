/**
 * Trigger Executions API (paginated)
 * Returns execution history for a single trigger with real server-side
 * pagination (LIMIT/OFFSET) and an optional triggered_at date range.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { triggerId } = await context.params;
    const { searchParams } = request.nextUrl;

    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, parseInt(searchParams.get("pageSize") || String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
    );
    const from = searchParams.get("from") || undefined; // ISO datetime (UTC)
    const to = searchParams.get("to") || undefined; // ISO datetime (UTC)
    const offset = (page - 1) * pageSize;

    const pool = getPool();

    // Date-range predicate shared by count and page queries
    const conditions: string[] = ["tel.trigger_id = $1"];
    const params: any[] = [triggerId];
    let paramIndex = 2;

    if (from) {
      conditions.push(`tel.triggered_at >= $${paramIndex}`);
      params.push(from);
      paramIndex++;
    }
    if (to) {
      conditions.push(`tel.triggered_at <= $${paramIndex}`);
      params.push(to);
      paramIndex++;
    }

    const whereClause = conditions.join(" AND ");

    // Total count for pagination
    const countResult = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM trigger_execution_logs tel
       WHERE ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Page of rows. Only minimal columns for the row summary; full detail is
    // fetched on demand from the detail endpoint.
    const rowsResult = await pool.query(
      `SELECT
        tel.id,
        tel.status,
        tel.error_message,
        tel.triggered_at,
        tel.triggered_by,
        oe.status AS execution_status,
        etm.subject AS email_subject,
        etm.from_address AS email_from
       FROM trigger_execution_logs tel
       LEFT JOIN orchestration_executions oe ON tel.execution_id = oe.id
       LEFT JOIN email_trigger_messages etm ON etm.execution_id = tel.execution_id
       WHERE ${whereClause}
       ORDER BY tel.triggered_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, pageSize, offset]
    );

    const executions = rowsResult.rows.map((row) => ({
      id: row.id,
      status: row.status,
      executionStatus: row.execution_status,
      triggeredAt: row.triggered_at,
      triggeredBy: row.triggered_by,
      errorMessage: row.error_message,
      emailSubject: row.email_subject,
      emailFrom: row.email_from,
    }));

    return NextResponse.json({
      success: true,
      executions,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error: any) {
    console.error("[TriggerExecutionsAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
