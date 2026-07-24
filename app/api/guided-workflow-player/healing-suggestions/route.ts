import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { ElementIdentity, SelectorCandidate, TargetElement } from "@/shared/guideTypes";

type HealingSuggestionRequest = {
  workflowId: string;
  stepId: string;
  stepOrder: number;
  originalIdentity: ElementIdentity;
  proposedElementIdentity?: ElementIdentity;
  proposedTarget?: TargetElement;
  proposedSelectorCandidates: SelectorCandidate[];
  confidenceScore: number;
  healingSource: "rule-based" | "ai-assisted";
  healingReason: string;
  aiProvider?: string;
  aiModel?: string;
  pageUrl: string;
  pageTitle: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);

  try {
    const targetBaseUrl = (process.env.SMART_FINDER_API_URL || "http://localhost:4302").replace(/\/$/, "");
    const response = await fetch(`${targetBaseUrl}/v1/healing-suggestions`, {
      method: "POST",
      headers: {
        "Content-Type": request.headers.get("content-type") || "application/json",
        "origin": request.headers.get("origin") || "*"
      },
      body: await request.text(),
      cache: "no-store"
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
        ...headers
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Standalone smart finder API is unavailable",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 503, headers }
    );
  }
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders(request);
  try {
    const searchParams = request.nextUrl.searchParams;
    const workflowId = searchParams.get("workflowId");
    const stepId = searchParams.get("stepId");
    const status = searchParams.get("status") || "pending";
    const companyId = searchParams.get("companyId");
    const targetAppId = searchParams.get("targetAppId");
    const recordingSessionId = searchParams.get("recordingSessionId");
    const topicId = searchParams.get("topicId");
    const page = Math.max(1, Number(searchParams.get("page") || "1") || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") || "10") || 10));
    const offset = (page - 1) * pageSize;

    const selectClause = `
      SELECT
        s.id, cta.company_id, s.workflow_id, s.step_id, s.step_order,
        s.original_selector_candidates, s.original_element_identity,
        s.proposed_selector_candidates, s.proposed_element_identity,
        s.confidence_score, s.healing_source, s.healing_reason,
        s.ai_provider, s.ai_model, s.page_url, s.page_title,
        s.status, s.reviewed_by, s.reviewed_at, s.created_at,
        s.playback_attempt_count, s.last_playback_attempt_at,
        w.title as workflow_title, w.target_app_id, w.topic_id,
        t.recording_session_id, c.name as company_name, cta.name as target_app_name,
        u.email as reviewed_by_email, t.title as topic_title, rs.title as session_title
    `;
    let fromWhereClause = `
      FROM guided_workflow_healing_suggestions s
      JOIN guided_workflow_guides w ON s.workflow_id = w.id
      LEFT JOIN company_target_applications cta ON cta.id = w.target_app_id
      JOIN companies c ON c.id = cta.company_id
      LEFT JOIN users u ON s.reviewed_by = u.id
      LEFT JOIN guided_workflow_topics t ON w.topic_id = t.id AND t.deleted_at IS NULL
      LEFT JOIN guided_workflow_recording_sessions rs ON t.recording_session_id = rs.id AND rs.deleted_at IS NULL
      WHERE s.status = $1
        AND s.deleted_at IS NULL
    `;
    const params: unknown[] = [status];

    if (workflowId) {
      params.push(workflowId);
      fromWhereClause += ` AND s.workflow_id = $${params.length}`;
    }

    if (stepId) {
      params.push(stepId);
      fromWhereClause += ` AND s.step_id = $${params.length}`;
    }

    if (companyId) {
      params.push(companyId);
      fromWhereClause += ` AND cta.company_id = $${params.length}`;
    }

    if (targetAppId) {
      params.push(targetAppId);
      fromWhereClause += ` AND w.target_app_id = $${params.length}`;
    }

    if (recordingSessionId) {
      params.push(recordingSessionId);
      fromWhereClause += ` AND t.recording_session_id = $${params.length}`;
    }

    if (topicId && topicId !== "all") {
      params.push(topicId);
      fromWhereClause += ` AND w.topic_id = $${params.length}`;
    }

    const countResult = await getPool().query(`SELECT COUNT(*)::int AS total ${fromWhereClause}`, params);
    const dataParams = [...params, pageSize, offset];
    const result = await getPool().query(
      `${selectClause} ${fromWhereClause} ORDER BY s.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return NextResponse.json({
      suggestions: result.rows,
      pagination: {
        page,
        pageSize,
        total: countResult.rows[0]?.total ?? 0,
      },
    }, { headers });
  } catch (error) {
    console.error("[Healing Suggestions API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    );
  }
}
