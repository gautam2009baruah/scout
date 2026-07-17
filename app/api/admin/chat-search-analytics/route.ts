import { NextResponse } from "next/server";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";

export const runtime = "nodejs";

async function requireSession() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  }

  if (!hasModuleAccess(session, MODULE_KEYS.searchAnalytics)) {
    return { response: NextResponse.json({ message: "You do not have permission to view search analytics." }, { status: 403 }) };
  }

  return { session };
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId") || "";
  const targetAppId = params.get("targetAppId") || "";
  const answerStatus = params.get("answerStatus") || "";
  const fromUtc = params.get("fromUtc") || "";
  const toUtc = params.get("toUtc") || "";
  const days = Math.min(365, Math.max(1, Number(params.get("days") || "30") || 30));
  const view = params.get("view") || "summary";
  const page = Math.max(1, Number(params.get("page") || "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.get("pageSize") || "25") || 25));

  const sqlParams: unknown[] = [];
  let filter = "1=1";

  if (fromUtc) {
    sqlParams.push(fromUtc);
    filter += ` AND t.created_at >= $${sqlParams.length}::timestamptz`;
  }

  if (toUtc) {
    sqlParams.push(toUtc);
    filter += ` AND t.created_at <= $${sqlParams.length}::timestamptz`;
  }

  if (!fromUtc && !toUtc) {
    sqlParams.push(days);
    filter += ` AND t.created_at >= now() - ($${sqlParams.length}::int || ' days')::interval`;
  }

  if (!auth.session.user.isAdminRole) {
    sqlParams.push(auth.session.user.tenantId, auth.session.user.id);
    filter += ` AND (
      COALESCE(cta_direct.company_id, cta_via_guided.company_id) = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = COALESCE(cta_direct.company_id, cta_via_guided.company_id)
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }

  if (companyId) {
    sqlParams.push(companyId);
    filter += ` AND COALESCE(cta_direct.company_id, cta_via_guided.company_id) = $${sqlParams.length}`;
  }

  if (targetAppId) {
    sqlParams.push(targetAppId);
    filter += ` AND t.target_app_id = $${sqlParams.length}`;
  }

  if (answerStatus && ["answered", "no_answer", "failed"].includes(answerStatus)) {
    sqlParams.push(answerStatus);
    filter += ` AND t.answer_status = $${sqlParams.length}`;
  }

  if (view === "raw-data") {
    const countResult = await getPool().query(
      `
        SELECT COUNT(*)::int AS total
        FROM chat_query_telemetry t
        LEFT JOIN guided_workflow_target_apps gta ON gta.id = t.target_app_id
        LEFT JOIN company_target_applications cta_direct ON cta_direct.id = t.target_app_id
        LEFT JOIN company_target_applications cta_via_guided ON cta_via_guided.id = gta.target_app_id
        WHERE ${filter}
      `,
      sqlParams
    );

    const rowsResult = await getPool().query(
      `
        SELECT
          t.id,
          t.created_at,
          t.question,
          t.answer_status,
          t.no_answer_reason,
          t.retrieved_chunk_count,
          t.citation_count,
          t.latency_ms,
          t.total_tokens,
          t.estimated_cost_usd,
          t.llm_provider,
          t.llm_model,
          ('external user (' || COALESCE(t.external_user_id, t.user_id::text, 'unknown') || ')') AS user_name,
          ''::text AS user_email,
          company.name AS company_name,
          COALESCE(cta_direct.name, cta_via_guided.name, '—') AS target_app_name,
          COALESCE(feedback.up_count, 0) AS feedback_up,
          COALESCE(feedback.down_count, 0) AS feedback_down
        FROM chat_query_telemetry t
        LEFT JOIN guided_workflow_target_apps gta ON gta.id = t.target_app_id
        LEFT JOIN company_target_applications cta_direct ON cta_direct.id = t.target_app_id
        LEFT JOIN company_target_applications cta_via_guided ON cta_via_guided.id = gta.target_app_id
        LEFT JOIN companies company ON company.id = COALESCE(cta_direct.company_id, cta_via_guided.company_id)
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*) FILTER (WHERE f.feedback = 'up')::int AS up_count,
            COUNT(*) FILTER (WHERE f.feedback = 'down')::int AS down_count
          FROM chat_query_feedback f
          WHERE f.query_id = t.id
        ) feedback ON TRUE
        WHERE ${filter}
        ORDER BY t.created_at DESC
        LIMIT $${sqlParams.length + 1}
        OFFSET $${sqlParams.length + 2}
      `,
      [...sqlParams, pageSize, (page - 1) * pageSize]
    );

    const total = Number(countResult.rows[0]?.total ?? 0);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    return NextResponse.json({
      rows: rowsResult.rows.map((row) => ({
        id: row.id,
        created_at: row.created_at,
        company_name: row.company_name,
        target_app_name: row.target_app_name,
        question: row.question,
        answer_status: row.answer_status,
        no_answer_reason: row.no_answer_reason,
        retrieved_chunk_count: Number(row.retrieved_chunk_count ?? 0),
        citation_count: Number(row.citation_count ?? 0),
        latency_ms: Number(row.latency_ms ?? 0),
        total_tokens: row.total_tokens === null ? null : Number(row.total_tokens),
        estimated_cost_usd: row.estimated_cost_usd === null ? null : Number(row.estimated_cost_usd),
        llm_provider: row.llm_provider,
        llm_model: row.llm_model,
        user_name: row.user_name,
        user_email: row.user_email,
        feedback_up: Number(row.feedback_up ?? 0),
        feedback_down: Number(row.feedback_down ?? 0)
      })),
      pagination: {
        page,
        pageSize,
        total,
        totalPages
      }
    });
  }

  const summaryResult = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_queries,
        COUNT(*) FILTER (WHERE t.answer_status = 'answered')::int AS answered_queries,
        COUNT(*) FILTER (WHERE t.answer_status = 'no_answer')::int AS no_answer_queries,
        COUNT(*) FILTER (WHERE t.answer_status = 'failed')::int AS failed_queries,
        COALESCE(AVG(t.latency_ms), 0)::int AS avg_latency_ms,
        COALESCE(AVG(t.retrieved_chunk_count), 0)::numeric(12, 2) AS avg_retrieved_chunks,
        COALESCE(AVG(t.citation_count), 0)::numeric(12, 2) AS avg_citations,
        COALESCE(SUM(t.total_tokens), 0)::bigint AS total_tokens,
        COALESCE(SUM(t.estimated_cost_usd), 0)::numeric(12, 6) AS total_estimated_cost_usd
      FROM chat_query_telemetry t
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = t.target_app_id
      LEFT JOIN company_target_applications cta_direct ON cta_direct.id = t.target_app_id
      LEFT JOIN company_target_applications cta_via_guided ON cta_via_guided.id = gta.target_app_id
      WHERE ${filter}
    `,
    sqlParams
  );

  const feedbackResult = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_feedback,
        COUNT(*) FILTER (WHERE f.feedback = 'up')::int AS up_feedback,
        COUNT(*) FILTER (WHERE f.feedback = 'down')::int AS down_feedback,
        COUNT(DISTINCT f.query_id)::int AS queries_with_feedback
      FROM chat_query_feedback f
      INNER JOIN chat_query_telemetry t ON t.id = f.query_id
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = t.target_app_id
      LEFT JOIN company_target_applications cta_direct ON cta_direct.id = t.target_app_id
      LEFT JOIN company_target_applications cta_via_guided ON cta_via_guided.id = gta.target_app_id
      WHERE ${filter}
    `,
    sqlParams
  );

  const noAnswerReasonResult = await getPool().query(
    `
      SELECT
        t.no_answer_reason,
        COUNT(*)::int AS count
      FROM chat_query_telemetry t
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = t.target_app_id
      LEFT JOIN company_target_applications cta_direct ON cta_direct.id = t.target_app_id
      LEFT JOIN company_target_applications cta_via_guided ON cta_via_guided.id = gta.target_app_id
      WHERE ${filter}
        AND t.answer_status = 'no_answer'
        AND t.no_answer_reason IS NOT NULL
      GROUP BY t.no_answer_reason
      ORDER BY count DESC, t.no_answer_reason ASC
      LIMIT 8
    `,
    sqlParams
  );

  const summary = summaryResult.rows[0] ?? {};
  const feedback = feedbackResult.rows[0] ?? {};

  const totalQueries = Number(summary.total_queries ?? 0);
  const answeredQueries = Number(summary.answered_queries ?? 0);
  const noAnswerQueries = Number(summary.no_answer_queries ?? 0);
  const failedQueries = Number(summary.failed_queries ?? 0);
  const queriesWithFeedback = Number(feedback.queries_with_feedback ?? 0);
  const totalFeedback = Number(feedback.total_feedback ?? 0);
  const upFeedback = Number(feedback.up_feedback ?? 0);

  return NextResponse.json({
    summary: {
      totalQueries,
      answeredQueries,
      noAnswerQueries,
      failedQueries,
      answerRate: totalQueries > 0 ? Math.round((answeredQueries / totalQueries) * 1000) / 10 : 0,
      noAnswerRate: totalQueries > 0 ? Math.round((noAnswerQueries / totalQueries) * 1000) / 10 : 0,
      avgLatencyMs: Number(summary.avg_latency_ms ?? 0),
      avgRetrievedChunks: Number(summary.avg_retrieved_chunks ?? 0),
      avgCitations: Number(summary.avg_citations ?? 0),
      totalTokens: Number(summary.total_tokens ?? 0),
      totalEstimatedCostUsd: Number(summary.total_estimated_cost_usd ?? 0),
      queriesWithFeedback,
      feedbackCoverageRate: totalQueries > 0 ? Math.round((queriesWithFeedback / totalQueries) * 1000) / 10 : 0,
      positiveFeedbackRate: totalFeedback > 0 ? Math.round((upFeedback / totalFeedback) * 1000) / 10 : 0
    },
    noAnswerReasons: noAnswerReasonResult.rows.map((row) => ({
      reason: row.no_answer_reason,
      count: Number(row.count ?? 0)
    }))
  });
}
