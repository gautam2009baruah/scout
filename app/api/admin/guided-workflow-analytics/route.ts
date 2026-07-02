import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER } from "@/lib/guided-workflows/analytics";

export const runtime = "nodejs";

async function requireSession() {
  const session = await getCurrentAdminSession();
  if (!session) return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  if (!hasModuleAccess(session, MODULE_KEYS.guidedWorkflows)) {
    return { response: NextResponse.json({ message: "You do not have permission to view workflow analytics." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId") || "";
  const targetAppId = params.get("targetAppId") || "";
  const workflowId = params.get("workflowId") || "";
  const days = Math.min(365, Math.max(1, Number(params.get("days") || "30") || 30));
  const view = params.get("view") || "summary";
  const page = Math.max(1, Number(params.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || "25") || 25));
  const sqlParams: unknown[] = [days];
  let filter = "we.started_at >= now() - ($1::int || ' days')::interval";

  if (!auth.session.user.isAdminRole) {
    sqlParams.push(auth.session.user.tenantId, auth.session.user.id);
    filter += ` AND (
      we.company_id = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = we.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }
  if (companyId) {
    sqlParams.push(companyId);
    filter += ` AND we.company_id = $${sqlParams.length}`;
  }
  if (targetAppId) {
    sqlParams.push(targetAppId);
    filter += ` AND gw.target_app_id = $${sqlParams.length}`;
  }
  if (workflowId) {
    sqlParams.push(workflowId);
    filter += ` AND we.workflow_id = $${sqlParams.length}`;
  }

  if (view === "raw-data") {
    const countResult = await getPool().query(
      `
        SELECT COUNT(*)::int AS total
        FROM analytics_events ae
        INNER JOIN workflow_executions we ON we.id = ae.workflow_execution_id
        INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
        WHERE ${filter}
      `,
      sqlParams
    );

    const rawRowsResult = await getPool().query(
      `
        SELECT
          ae.id,
          ae.workflow_execution_id,
          ae.step_execution_id,
          ae.step_id,
          ae.action_type,
          ae.event_type,
          ae.status,
          ae.duration_ms,
          ae.error_message,
          ae.healing_used,
          ae.ai_used,
          ae.metadata_json,
          ae.created_at,
          we.started_at,
          we.status AS execution_status,
          COALESCE(ae.user_id, we.user_id, $${sqlParams.length + 1}) AS user_id,
          gw.id AS workflow_id,
          gw.title AS workflow_title,
          gw.version AS workflow_version
        FROM analytics_events ae
        INNER JOIN workflow_executions we ON we.id = ae.workflow_execution_id
        INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
        WHERE ${filter}
        ORDER BY ae.created_at DESC
        LIMIT $${sqlParams.length + 2}
        OFFSET $${sqlParams.length + 3}
      `,
      [...sqlParams, WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER, pageSize, (page - 1) * pageSize]
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      rows: rawRowsResult.rows.map((row) => ({
        ...row,
        metadata_json: row.metadata_json ?? {},
        user_id: row.user_id || WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER,
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  }

  const summaryResult = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_executions,
        COUNT(*) FILTER (WHERE we.status = 'completed')::int AS completed_executions,
        COUNT(*) FILTER (WHERE we.status = 'failed')::int AS failed_executions,
        COUNT(*) FILTER (WHERE we.status = 'abandoned')::int AS abandoned_workflows,
        COALESCE(AVG(we.duration_ms) FILTER (WHERE we.status = 'completed'), 0)::int AS average_completion_time_ms,
        COUNT(*) FILTER (WHERE we.healing_used)::int AS executions_with_healing,
        COUNT(*) FILTER (WHERE we.ai_used)::int AS executions_with_ai
      FROM workflow_executions we
      INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
      WHERE ${filter}
    `,
    sqlParams
  );

  const eventResult = await getPool().query(
    `
      SELECT
        COUNT(*) FILTER (WHERE ae.event_type = 'ai_provider_called')::int AS ai_usage_count,
        COUNT(*) FILTER (WHERE ae.event_type = 'healing_attempted')::int AS healing_attempts,
        COUNT(*) FILTER (WHERE ae.event_type = 'healing_succeeded')::int AS healing_successes
      FROM analytics_events ae
      INNER JOIN workflow_executions we ON we.id = ae.workflow_execution_id
      INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
      WHERE ${filter}
    `,
    sqlParams
  );

  const failedStepsResult = await getPool().query(
    `
      SELECT se.step_id, MAX(se.step_order)::int AS step_order, COUNT(*)::int AS failures
      FROM step_executions se
      INNER JOIN workflow_executions we ON we.id = se.workflow_execution_id
      INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
      WHERE ${filter} AND se.status = 'failed'
      GROUP BY se.step_id
      ORDER BY failures DESC, step_order ASC
      LIMIT 10
    `,
    sqlParams
  );

  const healedControlsResult = await getPool().query(
    `
      SELECT ae.step_id, COUNT(*)::int AS healed_count
      FROM analytics_events ae
      INNER JOIN workflow_executions we ON we.id = ae.workflow_execution_id
      INNER JOIN guided_workflow_guides gw ON gw.id = we.workflow_id
      WHERE ${filter} AND ae.event_type = 'healing_succeeded'
      GROUP BY ae.step_id
      ORDER BY healed_count DESC
      LIMIT 10
    `,
    sqlParams
  );

  const summary = summaryResult.rows[0] ?? {};
  const events = eventResult.rows[0] ?? {};
  const total = Number(summary.total_executions ?? 0);
  const completed = Number(summary.completed_executions ?? 0);
  const avgMs = Number(summary.average_completion_time_ms ?? 0);
  const healingSuccesses = Number(events.healing_successes ?? 0);

  return NextResponse.json({
    summary: {
      totalExecutions: total,
      successRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      failedExecutions: Number(summary.failed_executions ?? 0),
      abandonedWorkflows: Number(summary.abandoned_workflows ?? 0),
      averageCompletionTimeMs: avgMs,
      executionsWithHealing: Number(summary.executions_with_healing ?? 0),
      aiUsageCount: Number(events.ai_usage_count ?? 0),
      healingAttempts: Number(events.healing_attempts ?? 0),
      healingSuccesses,
      estimatedTimeSavedMs: healingSuccesses * Math.max(avgMs || 60000, 60000),
    },
    failedSteps: failedStepsResult.rows,
    mostHealedControls: healedControlsResult.rows,
  });
}
