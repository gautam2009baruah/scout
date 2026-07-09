/**
 * Trigger Executions API (paginated)
 * Returns execution history for a single trigger with real server-side
 * pagination (LIMIT/OFFSET) and an optional date range.
 *
 * For email triggers the history is sourced from email_trigger_messages (one
 * row per email the trigger processed), which holds the rich per-email detail.
 * For other trigger types it is sourced from trigger_execution_logs.
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

    // Determine trigger type so we can source the right table
    const triggerResult = await pool.query<{ trigger_type: string }>(
      `SELECT trigger_type FROM orchestration_triggers WHERE id = $1`,
      [triggerId]
    );

    if (triggerResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Trigger not found" },
        { status: 404 }
      );
    }

    const triggerType = triggerResult.rows[0].trigger_type;

    if (triggerType === "email") {
      return await getEmailExecutions(pool, triggerId, page, pageSize, offset, from, to);
    }

    return await getLogExecutions(pool, triggerId, page, pageSize, offset, from, to);
  } catch (error: any) {
    console.error("[TriggerExecutionsAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Email triggers: source from email_trigger_messages (filter/order by received_at)
async function getEmailExecutions(
  pool: ReturnType<typeof getPool>,
  triggerId: string,
  page: number,
  pageSize: number,
  offset: number,
  from?: string,
  to?: string
) {
  const conditions: string[] = ["etm.trigger_id = $1"];
  const params: any[] = [triggerId];
  let paramIndex = 2;

  if (from) {
    conditions.push(`etm.received_at >= $${paramIndex}`);
    params.push(from);
    paramIndex++;
  }
  if (to) {
    conditions.push(`etm.received_at <= $${paramIndex}`);
    params.push(to);
    paramIndex++;
  }

  const whereClause = conditions.join(" AND ");

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM email_trigger_messages etm
     WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || "0", 10);

  const rowsResult = await pool.query(
    `SELECT
      etm.id,
      etm.status,
      etm.error_message,
      etm.received_at,
      etm.subject AS email_subject,
      etm.from_address AS email_from,
      oe.status AS execution_status
     FROM email_trigger_messages etm
     LEFT JOIN orchestration_executions oe ON oe.id = etm.execution_id
     WHERE ${whereClause}
     ORDER BY etm.received_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, pageSize, offset]
  );

  const executions = rowsResult.rows.map((row) => ({
    id: row.id,
    status: row.status,
    executionStatus: row.execution_status,
    triggeredAt: row.received_at,
    triggeredBy: null,
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
}

// Non-email triggers: source from trigger_execution_logs
async function getLogExecutions(
  pool: ReturnType<typeof getPool>,
  triggerId: string,
  page: number,
  pageSize: number,
  offset: number,
  from?: string,
  to?: string
) {
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

  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total
     FROM trigger_execution_logs tel
     WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countResult.rows[0]?.total || "0", 10);

  const rowsResult = await pool.query(
    `SELECT
      tel.id,
      tel.status,
      tel.error_message,
      tel.triggered_at,
      tel.triggered_by,
      oe.status AS execution_status
     FROM trigger_execution_logs tel
     LEFT JOIN orchestration_executions oe ON tel.execution_id = oe.id
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
    emailSubject: null,
    emailFrom: null,
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
}
