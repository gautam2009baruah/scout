/**
 * Trigger Execution Detail API
 * Returns full detail for a single execution log entry, including the full
 * email message (subject, to/from, body, attachments) when the trigger is an
 * email trigger. Used by the "View" modal in the triggers monitoring screen.
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

    const logResult = await pool.query(
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

    if (logResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Execution not found" },
        { status: 404 }
      );
    }

    const log = logResult.rows[0];

    // Full email detail (if this execution came from an email trigger)
    let email: Record<string, unknown> | null = null;
    if (log.execution_id) {
      const emailResult = await pool.query(
        `SELECT
          message_id,
          provider,
          mailbox,
          from_address,
          to_address,
          subject,
          body_text,
          body_html,
          attachments,
          received_at,
          processed_at,
          status,
          error_message
         FROM email_trigger_messages
         WHERE execution_id = $1
         LIMIT 1`,
        [log.execution_id]
      );

      if ((emailResult.rowCount ?? 0) > 0) {
        const e = emailResult.rows[0];
        email = {
          messageId: e.message_id,
          provider: e.provider,
          mailbox: e.mailbox,
          fromAddress: e.from_address,
          toAddress: e.to_address,
          subject: e.subject,
          bodyText: e.body_text,
          bodyHtml: e.body_html,
          attachments: e.attachments,
          receivedAt: e.received_at,
          processedAt: e.processed_at,
          status: e.status,
          errorMessage: e.error_message,
        };
      }
    }

    return NextResponse.json({
      success: true,
      execution: {
        id: log.id,
        status: log.status,
        payload: log.payload,
        errorMessage: log.error_message,
        triggeredAt: log.triggered_at,
        triggeredBy: log.triggered_by,
        executionStatus: log.execution_status,
        executionStartedAt: log.execution_started_at,
        executionCompletedAt: log.execution_completed_at,
        email,
      },
    });
  } catch (error: any) {
    console.error("[TriggerExecutionDetailAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
