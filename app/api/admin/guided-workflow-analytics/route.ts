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
  const sessionId = params.get("sessionId") || "";
  const topicId = params.get("topicId") || "";
  const workflowId = params.get("workflowId") || "";
  const days = Math.min(365, Math.max(1, Number(params.get("days") || "30") || 30));
  const view = params.get("view") || "summary";
  const page = Math.max(1, Number(params.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || "25") || 25));
  const sqlParams: unknown[] = [days];
  let filter = "se.started_at >= now() - ($1::int || ' days')::interval";

  if (!auth.session.user.isAdminRole) {
    sqlParams.push(auth.session.user.tenantId, auth.session.user.id);
    filter += ` AND (
      se.company_id = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = se.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }
  if (companyId) {
    sqlParams.push(companyId);
    filter += ` AND se.company_id = $${sqlParams.length}`;
  }
  if (targetAppId) {
    sqlParams.push(targetAppId);
    filter += ` AND gw.target_app_id = $${sqlParams.length}`;
  }
  if (sessionId) {
    sqlParams.push(sessionId);
    filter += ` AND topic.recording_session_id = $${sqlParams.length}`;
  }
  if (topicId) {
    sqlParams.push(topicId);
    filter += ` AND gw.topic_id = $${sqlParams.length}`;
  }
  if (workflowId) {
    sqlParams.push(workflowId);
    filter += ` AND se.workflow_id = $${sqlParams.length}`;
  }

  if (view === "raw-data") {
    const countResult = await getPool().query(
      `
        SELECT COUNT(*)::int AS total
        FROM step_executions se
        INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
        LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
        WHERE ${filter}
      `,
      sqlParams
    );

    const rawRowsResult = await getPool().query(
      `
        SELECT
          se.id,
          se.workflow_execution_id,
          se.step_id,
          se.step_order,
          se.action_type,
          se.status,
          se.started_at,
          se.completed_at,
          EXTRACT(EPOCH FROM (se.completed_at - se.started_at)) * 1000 AS duration_ms,
          se.error_message,
          se.healing_used,
          se.ai_used,
          COALESCE(se.user_id, $${sqlParams.length + 1}) AS user_id,
          gw.id AS workflow_id,
          gw.title AS workflow_title,
          gw.steps_json,
          gw.version AS workflow_version,
          company.name AS company_name,
          target_app.name AS target_app_name,
          session.title AS session_title,
          topic.title AS topic_title
        FROM step_executions se
        INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
        INNER JOIN companies company ON company.id = se.company_id
        LEFT JOIN guided_workflow_target_apps target_app ON target_app.id = gw.target_app_id
        LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
        LEFT JOIN guided_workflow_recording_sessions session ON session.id = topic.recording_session_id
        WHERE ${filter}
        ORDER BY se.started_at DESC
        LIMIT $${sqlParams.length + 2}
        OFFSET $${sqlParams.length + 3}
      `,
      [...sqlParams, WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER, pageSize, (page - 1) * pageSize]
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // Extract step descriptions from steps_json
    const rows = rawRowsResult.rows.map((row) => {
      let stepDescription = "";
      if (row.steps_json && row.step_id) {
        try {
          const steps = Array.isArray(row.steps_json) ? row.steps_json : JSON.parse(row.steps_json);
          const step = steps.find((s: { id: string }) => s.id === row.step_id);
          stepDescription = step?.stepDescription || "";
        } catch (err) {
          console.error("Failed to parse steps_json:", err);
        }
      }

      return {
        id: row.id,
        workflow_execution_id: row.workflow_execution_id,
        company_name: row.company_name,
        target_app_name: row.target_app_name || "—",
        session_title: row.session_title || "—",
        topic_title: row.topic_title || "—",
        workflow_title: row.workflow_title,
        step_order: row.step_order,
        step_description: stepDescription,
        started_at: row.started_at,
        completed_at: row.completed_at,
        duration_ms: row.duration_ms ? Math.round(row.duration_ms) : null,
        status: row.status,
        user_id: row.user_id || WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER,
        error_message: row.error_message,
        healing_used: row.healing_used,
        ai_used: row.ai_used,
      };
    });

    return NextResponse.json({
      rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
      },
    });
  }

  // Summary view - derive workflow-level metrics from step_executions
  const summaryResult = await getPool().query(
    `
      WITH workflow_runs AS (
        SELECT
          se.workflow_execution_id,
          COUNT(*)::int AS total_steps,
          COUNT(*) FILTER (WHERE se.status = 'completed')::int AS completed_steps,
          COUNT(*) FILTER (WHERE se.status = 'failed')::int AS failed_steps,
          MAX(se.completed_at) AS last_step_completed,
          MIN(se.started_at) AS first_step_started,
          BOOL_OR(se.healing_used) AS healing_used,
          BOOL_OR(se.ai_used) AS ai_used,
          CASE
            WHEN COUNT(*) FILTER (WHERE se.status = 'failed') > 0 THEN 'failed'
            WHEN COUNT(*) = COUNT(*) FILTER (WHERE se.status = 'completed') THEN 'completed'
            ELSE 'in_progress'
          END AS workflow_status
        FROM step_executions se
        INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
        LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
        WHERE ${filter}
        GROUP BY se.workflow_execution_id
      )
      SELECT
        COUNT(*)::int AS total_executions,
        COUNT(*) FILTER (WHERE workflow_status = 'completed')::int AS completed_executions,
        COUNT(*) FILTER (WHERE workflow_status = 'failed')::int AS failed_executions,
        COUNT(*) FILTER (WHERE workflow_status = 'in_progress')::int AS abandoned_workflows,
        COALESCE(AVG(EXTRACT(EPOCH FROM (last_step_completed - first_step_started)) * 1000) FILTER (WHERE workflow_status = 'completed'), 0)::int AS average_completion_time_ms,
        COUNT(*) FILTER (WHERE healing_used)::int AS executions_with_healing,
        COUNT(*) FILTER (WHERE ai_used)::int AS executions_with_ai
      FROM workflow_runs
    `,
    sqlParams
  );

  const healingResult = await getPool().query(
    `
      SELECT
        COUNT(*) FILTER (WHERE se.healing_used)::int AS healing_successes,
        COUNT(*) FILTER (WHERE se.status = 'failed' AND NOT se.healing_used)::int AS failed_without_healing
      FROM step_executions se
      INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
      LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
      WHERE ${filter}
    `,
    sqlParams
  );

  const failedStepsResult = await getPool().query(
    `
      SELECT se.step_id, MAX(se.step_order)::int AS step_order, COUNT(*)::int AS failures
      FROM step_executions se
      INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
      LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
      WHERE ${filter} AND se.status = 'failed'
      GROUP BY se.step_id
      ORDER BY failures DESC, step_order ASC
      LIMIT 10
    `,
    sqlParams
  );

  const healedControlsResult = await getPool().query(
    `
      SELECT se.step_id, COUNT(*)::int AS healed_count
      FROM step_executions se
      INNER JOIN guided_workflow_guides gw ON gw.id = se.workflow_id
      LEFT JOIN guided_workflow_topics topic ON topic.id = gw.topic_id
      WHERE ${filter} AND se.healing_used AND se.status = 'completed'
      GROUP BY se.step_id
      ORDER BY healed_count DESC
      LIMIT 10
    `,
    sqlParams
  );

  const summary = summaryResult.rows[0] ?? {};
  const healing = healingResult.rows[0] ?? {};
  const total = Number(summary.total_executions ?? 0);
  const completed = Number(summary.completed_executions ?? 0);
  const avgMs = Number(summary.average_completion_time_ms ?? 0);
  const healingSuccesses = Number(healing.healing_successes ?? 0);
  const aiUsage = Number(summary.executions_with_ai ?? 0);

  return NextResponse.json({
    summary: {
      totalExecutions: total,
      successRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      failedExecutions: Number(summary.failed_executions ?? 0),
      abandonedWorkflows: Number(summary.abandoned_workflows ?? 0),
      averageCompletionTimeMs: avgMs,
      executionsWithHealing: Number(summary.executions_with_healing ?? 0),
      aiUsageCount: aiUsage,
      healingAttempts: healingSuccesses,
      healingSuccesses,
      estimatedTimeSavedMs: healingSuccesses * Math.max(avgMs || 60000, 60000),
    },
    failedSteps: failedStepsResult.rows,
    mostHealedControls: healedControlsResult.rows,
  });
}
