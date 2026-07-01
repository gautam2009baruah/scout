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
  pageUrl: string;
  pageTitle?: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: RejectRecoveryRequest = await request.json();

    const { workflowId, stepId, stepOrder, rejectedElement, pageUrl, pageTitle, reason } = body;

    if (!workflowId || !stepId || !rejectedElement) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Get workflow info
    const workflowResult = await getPool().query(
      `SELECT company_id FROM guided_workflow_guides WHERE id = $1`,
      [workflowId]
    );

    if (workflowResult.rows.length === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const companyId = workflowResult.rows[0].company_id;

    // Create a rejected healing suggestion for tracking
    await getPool().query(
      `INSERT INTO guided_workflow_healing_suggestions 
       (company_id, workflow_id, step_id, step_order, original_selector_candidates, original_element_identity,
        proposed_selector_candidates, proposed_element_identity, confidence_score, healing_source, 
        healing_reason, page_url, page_title, status)
       VALUES ($1, $2, $3, $4, '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, $5, 0, 'rule-based', $6, $7, $8, 'rejected')`,
      [
        companyId,
        workflowId,
        stepId,
        stepOrder,
        JSON.stringify(rejectedElement),
        reason || "User rejected smart recovery suggestion",
        pageUrl,
        pageTitle || null,
      ]
    );

    // Log the rejection
    await getPool().query(
      `INSERT INTO guided_workflow_healing_audit 
       (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, 
        attempted_selector_candidates, success, error_message, page_url)
       VALUES ($1, $2, $3, 'rejected', 'rule-based', 0, $4, false, $5, $6)`,
      [
        companyId,
        workflowId,
        stepId,
        JSON.stringify(rejectedElement),
        reason || "User rejected smart recovery",
        pageUrl,
      ]
    );

    return NextResponse.json({ success: true, message: "Rejection recorded" });
  } catch (error) {
    console.error("[Reject Recovery API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
