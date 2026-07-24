import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import type { SelectorCandidate, TargetElement } from "@/shared/guideTypes";

type ApproveRequest = {
  suggestionId: string;
  editedSelectorCandidates?: SelectorCandidate[];
  editedTarget?: TargetElement;
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
  const { suggestionId, editedSelectorCandidates, editedTarget, versionNotes } = body;
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
        cta.company_id
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       LEFT JOIN company_target_applications cta ON cta.id = w.target_app_id
       WHERE s.id = $1 AND s.status = 'pending' AND s.deleted_at IS NULL`,
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

    const selectorCandidates = editedSelectorCandidates || (typeof suggestion.proposed_selector_candidates === "string" ? JSON.parse(suggestion.proposed_selector_candidates) : suggestion.proposed_selector_candidates);

    const proposedTargetOrIdentity = suggestion.proposed_element_identity
      ? (typeof suggestion.proposed_element_identity === "string" ? JSON.parse(suggestion.proposed_element_identity) : suggestion.proposed_element_identity)
      : null;
    const replacementTarget = editedTarget || targetFromSuggestionPayload(proposedTargetOrIdentity, selectorCandidates);

    // Replace the old control details entirely so stale selectors/properties cannot survive approval.
    steps[stepIndex].target = replacementTarget;

    // Update the existing workflow (replace the step)
    await client.query(
      `UPDATE guided_workflow_guides 
       SET 
         steps_json = $1,
         status = 'draft',
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
       (workflow_id, step_id, event_type, healing_source, confidence_score,
        attempted_selector_candidates, success, page_url, user_id)
       VALUES ($1, $2, 'approved', $3, $4, $5, true, $6, $7)`,
      [
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
      message: "Healing suggestion approved and workflow moved to draft for publishing",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function targetFromSuggestionPayload(value: unknown, selectorCandidates: SelectorCandidate[]): TargetElement {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const nestedIdentity = source.elementIdentity && typeof source.elementIdentity === "object" ? source.elementIdentity as Record<string, unknown> : null;
  const identity = nestedIdentity || source;
  const stringField = (key: string) => typeof source[key] === "string" ? source[key] as string : typeof identity[key] === "string" ? identity[key] as string : undefined;

  return {
    elementIdentity: nestedIdentity ? nestedIdentity as TargetElement["elementIdentity"] : source as TargetElement["elementIdentity"],
    selectorCandidates,
    fallbackText: stringField("fallbackText") || stringField("text") || stringField("accessibleName") || stringField("labelText") || stringField("ariaLabel") || stringField("placeholder"),
    role: stringField("role"),
    tagName: stringField("tagName"),
    accessibleName: stringField("accessibleName"),
    text: stringField("text"),
    ariaLabel: stringField("ariaLabel"),
    labelText: stringField("labelText"),
    placeholder: stringField("placeholder"),
    inputType: stringField("inputType"),
    selectedOptionText: stringField("selectedOptionText"),
    name: stringField("name"),
    id: stringField("id"),
    dataAttributes: (source.dataAttributes || identity.dataAttributes) as TargetElement["dataAttributes"],
    nearbyHeading: stringField("nearbyHeading"),
    parentContainerText: stringField("parentContainerText"),
    previousSiblingText: stringField("previousSiblingText"),
    nextSiblingText: stringField("nextSiblingText"),
    parentTagName: stringField("parentTagName"),
    parentRole: stringField("parentRole"),
    parentAccessibleName: stringField("parentAccessibleName"),
    parentText: stringField("parentText"),
    formTitle: stringField("formTitle"),
    dialogTitle: stringField("dialogTitle"),
    cardTitle: stringField("cardTitle"),
    cssFallback: stringField("cssFallback"),
    xpathFallback: stringField("xpathFallback"),
    boundingBox: (source.boundingBox || identity.boundingBox) as TargetElement["boundingBox"],
  };
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
      `SELECT s.*
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       WHERE s.id = $1 AND s.status = 'pending' AND s.deleted_at IS NULL`,
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
       (workflow_id, step_id, event_type, healing_source, confidence_score,
        attempted_selector_candidates, success, error_message, page_url, user_id)
       VALUES ($1, $2, 'rejected', $3, $4, $5, false, $6, $7, $8)`,
      [
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
      `SELECT s.*
       FROM guided_workflow_healing_suggestions s
       JOIN guided_workflow_guides w ON s.workflow_id = w.id
       WHERE s.id = $1 AND s.deleted_at IS NULL`,
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
       (workflow_id, step_id, event_type, healing_source, confidence_score,
        attempted_selector_candidates, success, error_message, page_url, user_id)
       VALUES ($1, $2, 'deleted', $3, $4, $5, false, $6, $7, $8)`,
      [
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

    // Soft delete the suggestion so it is hidden everywhere but retained for auditability.
    await client.query(
      `UPDATE guided_workflow_healing_suggestions
       SET deleted_at = now(),
           deleted_by = $1,
           updated_at = now()
       WHERE id = $2`,
      [userId, suggestionId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Healing suggestion deleted",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
