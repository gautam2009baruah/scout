/**
 * Trigger Execution Detail API
 * Returns full detail for a single execution entry.
 *
 * For email triggers, {logId} is an email_trigger_messages id and the full
 * email (subject, to/from, body, attachments) is returned. For other trigger
 * types, {logId} is a trigger_execution_logs id.
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string; logId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { triggerId, logId } = await context.params;
    const pool = getPool();

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
      return await getEmailDetail(pool, triggerId, logId);
    }

    return await getLogDetail(pool, triggerId, logId);
  } catch (error: any) {
    console.error("[TriggerExecutionDetailAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Email trigger: {logId} is an email_trigger_messages id
async function getEmailDetail(
  pool: ReturnType<typeof getPool>,
  triggerId: string,
  logId: string
) {
  const result = await pool.query(
    `SELECT
      etm.id,
      etm.message_id,
      etm.provider,
      etm.mailbox,
      etm.from_address,
      etm.to_address,
      etm.subject,
      etm.body_text,
      etm.body_html,
      etm.attachments,
      etm.received_at,
      etm.processed_at,
      etm.status,
      etm.error_message,
      etm.execution_id,
      oe.status AS execution_status,
      oe.started_at AS execution_started_at,
      oe.completed_at AS execution_completed_at
     FROM email_trigger_messages etm
     LEFT JOIN orchestration_executions oe ON oe.id = etm.execution_id
     WHERE etm.id = $1 AND etm.trigger_id = $2`,
    [logId, triggerId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { success: false, error: "Execution not found" },
      { status: 404 }
    );
  }

  const row = result.rows[0];

  return NextResponse.json({
    success: true,
    execution: {
      id: row.id,
      executionId: row.execution_id,
      status: row.status,
      payload: null,
      errorMessage: row.error_message,
      triggeredAt: row.received_at,
      triggeredBy: null,
      executionStatus: row.execution_status,
      executionStartedAt: row.execution_started_at,
      executionCompletedAt: row.execution_completed_at,
      email: {
        messageId: row.message_id,
        provider: row.provider,
        mailbox: row.mailbox,
        fromAddress: row.from_address,
        toAddress: row.to_address,
        subject: row.subject,
        bodyText: row.body_text,
        bodyHtml: row.body_html,
        attachments: row.attachments,
        receivedAt: row.received_at,
        processedAt: row.processed_at,
        status: row.status,
        errorMessage: row.error_message,
      },
    },
  });
}

// Non-email trigger: {logId} is a trigger_execution_logs id
async function getLogDetail(
  pool: ReturnType<typeof getPool>,
  triggerId: string,
  logId: string
) {
  const result = await pool.query(
    `SELECT
      tel.id,
      tel.status,
      tel.payload,
      tel.error_message,
      tel.triggered_at,
      tel.triggered_by,
      tel.execution_id,
      oe.status AS execution_status,
      oe.started_at AS execution_started_at,
      oe.completed_at AS execution_completed_at
     FROM trigger_execution_logs tel
     LEFT JOIN orchestration_executions oe ON tel.execution_id = oe.id
     WHERE tel.id = $1 AND tel.trigger_id = $2`,
    [logId, triggerId]
  );

  if (result.rowCount === 0) {
    return NextResponse.json(
      { success: false, error: "Execution not found" },
      { status: 404 }
    );
  }

  const log = result.rows[0];

  return NextResponse.json({
    success: true,
    execution: {
      id: log.id,
      executionId: log.execution_id,
      status: log.status,
      payload: log.payload,
      errorMessage: log.error_message,
      triggeredAt: log.triggered_at,
      triggeredBy: log.triggered_by,
      executionStatus: log.execution_status,
      executionStartedAt: log.execution_started_at,
      executionCompletedAt: log.execution_completed_at,
      email: null,
    },
  });
}
