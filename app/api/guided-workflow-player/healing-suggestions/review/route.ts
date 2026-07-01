import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { SelectorCandidate } from "@/shared/guideTypes";

type ApproveRequest = {
  suggestionId: string;
  userId: string;
  editedSelectorCandidates?: SelectorCandidate[];
  versionNotes?: string;
};

type RejectRequest = {
  suggestionId: string;
  userId: string;
  reason?: string;
};

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "approve") {
      return await handleApprove(request);
    } else if (action === "reject") {
      return await handleReject(request);
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("[Healing Review API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function handleApprove(request: NextRequest) {
  const body: ApproveRequest = await request.json();
  const { suggestionId, userId, editedSelectorCandidates, versionNotes } = body;

  if (!suggestionId || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Get the suggestion
    const suggestionResult = await client.query(
      `SELECT 
        s.*,
        w.steps_json,
        w.recorded_actions_json,
        w.version,
        w.title,
        w.description,
        w.status,
        w.company_id
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       WHERE s.id = $1 AND s.status = 'pending'`,
      [suggestionId]
    );

    if (suggestionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Suggestion not found or already processed" }, { status: 404 });
    }

    const suggestion = suggestionResult.rows[0];
    const originalWorkflow = suggestion;

    // Parse the steps
    const steps = JSON.parse(originalWorkflow.steps_json);

    // Find the step to update
    const stepIndex = steps.findIndex((s: { id: string }) => s.id === suggestion.step_id);

    if (stepIndex === -1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Step not found in workflow" }, { status: 404 });
    }

    // Update the step with healed selector candidates
    const selectorCandidates = editedSelectorCandidates || JSON.parse(suggestion.proposed_selector_candidates);
    steps[stepIndex].target = {
      ...steps[stepIndex].target,
      selectorCandidates,
      elementIdentity: {
        ...steps[stepIndex].target?.elementIdentity,
        selectorCandidates,
      },
    };

    // Create a new workflow version
    const newVersion = originalWorkflow.version + 1;
    const notes = versionNotes || `Applied self-healing suggestion for step ${suggestion.step_order}: ${suggestion.healing_reason}`;

    const newWorkflowResult = await client.query(
      `INSERT INTO guided_workflow_guides 
       (company_id, title, description, status, recorded_actions_json, steps_json, 
        created_by, updated_by, published_at, version, parent_version_id, version_notes)
       SELECT 
         company_id, 
         title, 
         description, 
         status, 
         recorded_actions_json, 
         $1::jsonb, 
         created_by, 
         $2, 
         published_at, 
         $3, 
         id, 
         $4
       FROM guided_workflow_guides 
       WHERE id = $5
       RETURNING id`,
      [JSON.stringify(steps), userId, newVersion, notes, suggestion.workflow_id]
    );

    const newWorkflowId = newWorkflowResult.rows[0].id;

    // Update the suggestion status
    await client.query(
      `UPDATE guided_workflow_healing_suggestions 
       SET 
         status = 'approved',
         reviewed_by = $1,
         reviewed_at = now(),
         proposed_element_identity = $2,
         updated_at = now()
       WHERE id = $3`,
      [userId, JSON.stringify(selectorCandidates), suggestionId]
    );

    // Log the approval
    await client.query(
      `INSERT INTO guided_workflow_healing_audit 
       (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, 
        attempted_selector_candidates, success, page_url, user_id)
       VALUES ($1, $2, $3, 'approved', $4, $5, $6, true, $7, $8)`,
      [
        originalWorkflow.company_id,
        suggestion.workflow_id,
        suggestion.step_id,
        editedSelectorCandidates ? "manual" : suggestion.healing_source,
        suggestion.confidence_score,
        JSON.stringify(selectorCandidates),
        suggestion.page_url,
        userId,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      newWorkflowId,
      newVersion,
      message: "Healing suggestion approved and new workflow version created",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleReject(request: NextRequest) {
  const body: RejectRequest = await request.json();
  const { suggestionId, userId, reason } = body;

  if (!suggestionId || !userId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Get the suggestion
    const suggestionResult = await client.query(
      `SELECT s.*, w.company_id
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       WHERE s.id = $1 AND s.status = 'pending'`,
      [suggestionId]
    );

    if (suggestionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Suggestion not found or already processed" }, { status: 404 });
    }

    const suggestion = suggestionResult.rows[0];

    // Update the suggestion status
    await client.query(
      `UPDATE guided_workflow_healing_suggestions 
       SET 
         status = 'rejected',
         reviewed_by = $1,
         reviewed_at = now(),
         updated_at = now()
       WHERE id = $2`,
      [userId, suggestionId]
    );

    // Log the rejection
    await client.query(
      `INSERT INTO guided_workflow_healing_audit 
       (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, 
        attempted_selector_candidates, success, error_message, page_url, user_id)
       VALUES ($1, $2, $3, 'rejected', $4, $5, $6, false, $7, $8, $9)`,
      [
        suggestion.company_id,
        suggestion.workflow_id,
        suggestion.step_id,
        suggestion.healing_source,
        suggestion.confidence_score,
        suggestion.proposed_selector_candidates,
        reason || "Rejected by trainer",
        suggestion.page_url,
        userId,
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Healing suggestion rejected",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
