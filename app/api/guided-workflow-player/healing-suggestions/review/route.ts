import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import type { SelectorCandidate } from "@/shared/guideTypes";

type ApproveRequest = {
  suggestionId: string;
  editedSelectorCandidates?: SelectorCandidate[];
  versionNotes?: string;
};

type RejectRequest = {
  suggestionId: string;
  reason?: string;
};

type DeleteRequest = {
  suggestionId: string;
};

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "approve") {
      return await handleApprove(request);
    } else if (action === "reject") {
      return await handleReject(request);
    } else if (action === "delete") {
      return await handleDelete(request);
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
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: ApproveRequest = await request.json();
  const { suggestionId, editedSelectorCandidates, versionNotes } = body;
  const userId = session.user.id;

  if (!suggestionId) {
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
    const steps = typeof originalWorkflow.steps_json === "string" ? JSON.parse(originalWorkflow.steps_json) : originalWorkflow.steps_json;

    // Find the step to update
    const stepIndex = steps.findIndex((s: { id: string }) => s.id === suggestion.step_id);

    if (stepIndex === -1) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Step not found in workflow" }, { status: 404 });
    }

    // Update the step with healed selector candidates
    const selectorCandidates = editedSelectorCandidates || (typeof suggestion.proposed_selector_candidates === "string" ? JSON.parse(suggestion.proposed_selector_candidates) : suggestion.proposed_selector_candidates);
    
    // Update all ElementIdentity properties if available
    const proposedIdentity = suggestion.proposed_element_identity 
      ? (typeof suggestion.proposed_element_identity === "string" ? JSON.parse(suggestion.proposed_element_identity) : suggestion.proposed_element_identity)
      : null;

    const existingTarget = steps[stepIndex].target ?? {};

    steps[stepIndex].target = {
      ...existingTarget,
      selectorCandidates,
      ...(proposedIdentity
        ? {
            elementIdentity: proposedIdentity,
            role: proposedIdentity.role,
            tagName: proposedIdentity.tagName,
            accessibleName: proposedIdentity.accessibleName,
            text: proposedIdentity.text,
            ariaLabel: proposedIdentity.ariaLabel,
            labelText: proposedIdentity.labelText,
            placeholder: proposedIdentity.placeholder,
            inputType: proposedIdentity.inputType,
            selectedOptionText: proposedIdentity.selectedOptionText,
            name: proposedIdentity.name,
            id: proposedIdentity.id,
            dataAttributes: proposedIdentity.dataAttributes,
            nearbyHeading: proposedIdentity.nearbyHeading,
            parentContainerText: proposedIdentity.parentContainerText,
            previousSiblingText: proposedIdentity.previousSiblingText,
            nextSiblingText: proposedIdentity.nextSiblingText,
            parentTagName: proposedIdentity.parentTagName,
            parentRole: proposedIdentity.parentRole,
            parentAccessibleName: proposedIdentity.parentAccessibleName,
            parentText: proposedIdentity.parentText,
            formTitle: proposedIdentity.formTitle,
            dialogTitle: proposedIdentity.dialogTitle,
            cardTitle: proposedIdentity.cardTitle,
            cssFallback: proposedIdentity.cssFallback,
            xpathFallback: proposedIdentity.xpathFallback,
            boundingBox: proposedIdentity.boundingBox,
          }
        : {
            elementIdentity: existingTarget.elementIdentity
              ? { ...existingTarget.elementIdentity, selectorCandidates }
              : undefined,
          }),
    };

    // Update the existing workflow (replace the step)
    await client.query(
      `UPDATE guided_workflow_guides 
       SET 
         steps_json = $1,
         updated_by = $2,
         updated_at = now()
       WHERE id = $3`,
      [JSON.stringify(steps), userId, suggestion.workflow_id]
    );

    // Update the suggestion status
    await client.query(
      `UPDATE guided_workflow_healing_suggestions 
       SET 
         status = 'approved',
         reviewed_by = $1,
         reviewed_at = now(),
         updated_at = now()
       WHERE id = $2`,
      [userId, suggestionId]
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
      workflowId: suggestion.workflow_id,
      message: "Healing suggestion approved and workflow updated",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function handleReject(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: RejectRequest = await request.json();
  const { suggestionId, reason } = body;
  const userId = session.user.id;

  if (!suggestionId) {
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

async function handleDelete(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body: DeleteRequest = await request.json();
  const { suggestionId } = body;
  const userId = session.user.id;

  if (!suggestionId) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const client = await getPool().connect();

  try {
    await client.query("BEGIN");

    // Get the suggestion info for audit log
    const suggestionResult = await client.query(
      `SELECT s.*, w.company_id
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       WHERE s.id = $1`,
      [suggestionId]
    );

    if (suggestionResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Suggestion not found" }, { status: 404 });
    }

    const suggestion = suggestionResult.rows[0];

    // Log the deletion in audit
    await client.query(
      `INSERT INTO guided_workflow_healing_audit 
       (company_id, workflow_id, step_id, event_type, healing_source, confidence_score, 
        attempted_selector_candidates, success, error_message, page_url, user_id)
       VALUES ($1, $2, $3, 'deleted', $4, $5, $6, false, $7, $8, $9)`,
      [
        suggestion.company_id,
        suggestion.workflow_id,
        suggestion.step_id,
        suggestion.healing_source,
        suggestion.confidence_score,
        suggestion.proposed_selector_candidates,
        "Permanently deleted by trainer",
        suggestion.page_url,
        userId,
      ]
    );

    // Hard delete the suggestion
    await client.query(
      `DELETE FROM guided_workflow_healing_suggestions WHERE id = $1`,
      [suggestionId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Healing suggestion permanently deleted",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
