import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { ElementIdentity, SelectorCandidate } from "@/shared/guideTypes";

type HealingSuggestionRequest = {
  workflowId: string;
  stepId: string;
  stepOrder: number;
  originalIdentity: ElementIdentity;
  proposedSelectorCandidates: SelectorCandidate[];
  confidenceScore: number;
  healingSource: "rule-based" | "ai-assisted";
  healingReason: string;
  aiProvider?: string;
  aiModel?: string;
  pageUrl: string;
  pageTitle: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: HealingSuggestionRequest = await request.json();

    const {
      workflowId,
      stepId,
      stepOrder,
      originalIdentity,
      proposedSelectorCandidates,
      confidenceScore,
      healingSource,
      healingReason,
      aiProvider,
      aiModel,
      pageUrl,
      pageTitle,
    } = body;

    if (!workflowId || !stepId || !originalIdentity || !proposedSelectorCandidates) {
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

    // Check if a pending suggestion already exists for this step
    const existingResult = await getPool().query(
      `SELECT id FROM guided_workflow_healing_suggestions 
       WHERE workflow_id = $1 AND step_id = $2 AND status = 'pending'`,
      [workflowId, stepId]
    );

    if (existingResult.rows.length > 0) {
      // Update existing suggestion with new attempt
      await getPool().query(
        `UPDATE guided_workflow_healing_suggestions 
         SET 
           playback_attempt_count = playback_attempt_count + 1,
           last_playback_attempt_at = now(),
           confidence_score = $1,
           healing_source = $2,
           healing_reason = $3,
           proposed_selector_candidates = $4,
           ai_provider = $5,
           ai_model = $6,
           page_url = $7,
           page_title = $8,
           updated_at = now()
         WHERE id = $9`,
        [
          confidenceScore,
          healingSource,
          healingReason,
          JSON.stringify(proposedSelectorCandidates),
          aiProvider || null,
          aiModel || null,
          pageUrl,
          pageTitle || null,
          existingResult.rows[0].id,
        ]
      );

      // Log the attempt
      await getPool().query(
        `INSERT INTO guided_workflow_healing_audit 
         (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, attempted_selector_candidates, success, page_url)
         VALUES ($1, $2, $3, 'attempt', $4, $5, $6, true, $7)`,
        [companyId, workflowId, stepId, healingSource, confidenceScore, JSON.stringify(proposedSelectorCandidates), pageUrl]
      );

      return NextResponse.json({ success: true, suggestionId: existingResult.rows[0].id });
    }

    // Create new suggestion
    const insertResult = await getPool().query(
      `INSERT INTO guided_workflow_healing_suggestions 
       (company_id, workflow_id, step_id, step_order, original_selector_candidates, original_element_identity,
        proposed_selector_candidates, confidence_score, healing_source, healing_reason, 
        ai_provider, ai_model, page_url, page_title, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
       RETURNING id`,
      [
        companyId,
        workflowId,
        stepId,
        stepOrder,
        JSON.stringify(originalIdentity.selectorCandidates || []),
        JSON.stringify(originalIdentity),
        JSON.stringify(proposedSelectorCandidates),
        confidenceScore,
        healingSource,
        healingReason,
        aiProvider || null,
        aiModel || null,
        pageUrl,
        pageTitle || null,
      ]
    );

    const suggestionId = insertResult.rows[0].id;

    // Log the attempt
    await getPool().query(
      `INSERT INTO guided_workflow_healing_audit 
       (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, attempted_selector_candidates, success, page_url)
       VALUES ($1, $2, $3, 'attempt', $4, $5, $6, true, $7)`,
      [companyId, workflowId, stepId, healingSource, confidenceScore, JSON.stringify(proposedSelectorCandidates), pageUrl]
    );

    return NextResponse.json({ success: true, suggestionId });
  } catch (error) {
    console.error("[Healing Suggestions API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const workflowId = searchParams.get("workflowId");
    const status = searchParams.get("status") || "pending";

    let query = `
      SELECT 
        s.id,
        s.workflow_id,
        s.step_id,
        s.step_order,
        s.original_selector_candidates,
        s.original_element_identity,
        s.proposed_selector_candidates,
        s.proposed_element_identity,
        s.confidence_score,
        s.healing_source,
        s.healing_reason,
        s.ai_provider,
        s.ai_model,
        s.page_url,
        s.page_title,
        s.status,
        s.reviewed_by,
        s.reviewed_at,
        s.created_at,
        s.playback_attempt_count,
        s.last_playback_attempt_at,
        w.title as workflow_title,
        u.email as reviewed_by_email
      FROM guided_workflow_healing_suggestions s
      JOIN guided_workflow_guides w ON s.workflow_id = w.id
      LEFT JOIN users u ON s.reviewed_by = u.id
      WHERE s.status = $1
    `;
    const params: unknown[] = [status];

    if (workflowId) {
      query += ` AND s.workflow_id = $2`;
      params.push(workflowId);
    }

    query += ` ORDER BY s.created_at DESC LIMIT 100`;

    const result = await getPool().query(query, params);

    return NextResponse.json({ suggestions: result.rows });
  } catch (error) {
    console.error("[Healing Suggestions API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
