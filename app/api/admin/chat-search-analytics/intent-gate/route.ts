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
    return { response: NextResponse.json({ message: "You do not have permission to view intent-gate analytics." }, { status: 403 }) };
  }

  return { session };
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const companyId = params.get("companyId") || "";
  const targetAppId = params.get("targetAppId") || "";
  const days = Math.min(365, Math.max(1, Number(params.get("days") || "30") || 30));

  const sqlParams: unknown[] = [days];
  let filter = "d.created_at >= now() - ($1::int || ' days')::interval";

  if (!auth.session.user.isAdminRole) {
    sqlParams.push(auth.session.user.tenantId, auth.session.user.id);
    filter += ` AND (
      cta.company_id = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = cta.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }

  if (companyId) {
    sqlParams.push(companyId);
    filter += ` AND cta.company_id = $${sqlParams.length}`;
  }

  if (targetAppId) {
    sqlParams.push(targetAppId);
    filter += ` AND d.target_app_id = $${sqlParams.length}`;
  }

  const summaryResult = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_decisions,
        COUNT(*) FILTER (WHERE d.final_label = 'action')::int AS action_decisions,
        COUNT(*) FILTER (WHERE d.final_label = 'chat')::int AS chat_decisions,
        COUNT(*) FILTER (WHERE d.low_confidence = true)::int AS low_confidence_decisions,
        COALESCE(AVG(d.ai_confidence), 0)::numeric(12, 4) AS avg_ai_confidence,
        COUNT(f.id)::int AS feedback_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'false_positive')::int AS false_positive_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'false_negative')::int AS false_negative_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'true_positive')::int AS true_positive_count,
        COUNT(*) FILTER (WHERE f.feedback_type = 'true_negative')::int AS true_negative_count
      FROM chatbot_intent_gate_decisions d
      LEFT JOIN company_target_applications cta ON cta.id = d.target_app_id
      LEFT JOIN chatbot_intent_gate_feedback f ON f.decision_id = d.id
      WHERE ${filter}
    `,
    sqlParams
  );

  const examplesResult = await getPool().query(
    `
      SELECT
        d.id,
        d.created_at,
        d.message,
        d.prefilter_label,
        d.ai_label,
        d.ai_confidence,
        d.final_label,
        d.low_confidence,
        f.feedback_type,
        f.user_choice,
        f.notes
      FROM chatbot_intent_gate_decisions d
      LEFT JOIN company_target_applications cta ON cta.id = d.target_app_id
      LEFT JOIN chatbot_intent_gate_feedback f ON f.decision_id = d.id
      WHERE ${filter}
      ORDER BY d.created_at DESC
      LIMIT 40
    `,
    sqlParams
  );

  const row = summaryResult.rows[0] || {};
  const total = Number(row.total_decisions ?? 0);
  const feedbackCount = Number(row.feedback_count ?? 0);

  return NextResponse.json({
    summary: {
      totalDecisions: total,
      actionDecisions: Number(row.action_decisions ?? 0),
      chatDecisions: Number(row.chat_decisions ?? 0),
      lowConfidenceDecisions: Number(row.low_confidence_decisions ?? 0),
      lowConfidenceRate: total > 0 ? Math.round((Number(row.low_confidence_decisions ?? 0) / total) * 1000) / 10 : 0,
      avgAiConfidence: Number(row.avg_ai_confidence ?? 0),
      feedbackCount,
      falsePositiveCount: Number(row.false_positive_count ?? 0),
      falseNegativeCount: Number(row.false_negative_count ?? 0),
      truePositiveCount: Number(row.true_positive_count ?? 0),
      trueNegativeCount: Number(row.true_negative_count ?? 0),
      falsePositiveRateWithinFeedback: feedbackCount > 0
        ? Math.round((Number(row.false_positive_count ?? 0) / feedbackCount) * 1000) / 10
        : 0,
      falseNegativeRateWithinFeedback: feedbackCount > 0
        ? Math.round((Number(row.false_negative_count ?? 0) / feedbackCount) * 1000) / 10
        : 0,
    },
    recentExamples: examplesResult.rows,
  });
}
