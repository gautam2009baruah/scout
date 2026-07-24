import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";

type RejectRecoveryRequest = {
  workflowId: string;
  stepId: string;
  stepOrder: number;
  rejectedElement: {
    tagName: string;
    text?: string;
    ariaLabel?: string;
    id?: string;
    className?: string;
  };
  userAction?: "reject" | "skip";
  pageUrl: string;
  pageTitle?: string;
  reason?: string;
};

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
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
    const body: RejectRecoveryRequest = await request.json();

    const { workflowId, stepId, stepOrder, rejectedElement, userAction = "reject", pageUrl, pageTitle, reason } = body;

    if (!workflowId || !stepId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400, headers });
    }

    // Get workflow info
    const workflowResult = await getPool().query(
      `SELECT id FROM guided_workflow_guides WHERE id = $1`,
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404, headers });
    }

    const eventReason = reason || (userAction === "skip"
      ? "Control not found and user skipped this step"
      : "User rejected AI auto-healing suggestion");
    const elementJson = JSON.stringify(rejectedElement || {});

    // User playback actions are pending trainer review. Trainer rejection happens in the review endpoint.
    await getPool().query(
      `INSERT INTO guided_workflow_healing_suggestions
       (workflow_id, step_id, step_order, original_selector_candidates, original_element_identity,
        proposed_selector_candidates, proposed_element_identity, confidence_score, healing_source,
        healing_reason, page_url, page_title, status)
       VALUES ($1, $2, $3, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, $4, 0, 'rule-based', $5, $6, $7, 'pending')`,
      [
        workflowId,
        stepId,
        stepOrder,
        elementJson,
        eventReason,
        pageUrl,
        pageTitle || null,
      ]
    );

    // Log the rejection
    await getPool().query(
      `INSERT INTO guided_workflow_healing_audit
       (workflow_id, step_id, event_type, healing_source, confidence_score,
        attempted_selector_candidates, success, error_message, page_url)
       VALUES ($1, $2, 'attempt', 'rule-based', 0, $3, false, $4, $5)`,
      [
        workflowId,
        stepId,
        elementJson,
        eventReason,
        pageUrl,
      ]
    );

    return NextResponse.json({ success: true, message: "Playback recovery decision recorded for trainer review" }, { headers });
  } catch (error) {
    console.error("[Reject Recovery API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500, headers }
    );
  }
}
