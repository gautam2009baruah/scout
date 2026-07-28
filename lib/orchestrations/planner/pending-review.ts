// Step 7b: shared logic between the pending-request GET route (open in
// builder) and the approve route — both need the draft plan converted into
// a real orchestration, created at most once per pending request.

import { getOrchestrationById } from "../db";
import { resolveCompanyIdForTargetApp } from "../target-app-scope";
import { persistDraftPlanAsOrchestration } from "./graph-convert";
import {
  setPendingPlanRequestDraftOrchestrationId,
  type PendingPlanRequest,
} from "./pending-requests";

function deriveOrchestrationName(requestText: string): string {
  const trimmed = requestText.trim().replace(/\s+/g, " ");
  const truncated = trimmed.length > 70 ? `${trimmed.slice(0, 67)}...` : trimmed;
  return `AI Planner: ${truncated || "Untitled request"}`;
}

export async function ensureDraftOrchestrationForPendingRequest(input: {
  pendingRequest: PendingPlanRequest;
  createdById: string;
}): Promise<string> {
  const { pendingRequest } = input;

  if (pendingRequest.draftOrchestrationId) {
    const existing = await getOrchestrationById(pendingRequest.draftOrchestrationId);
    if (existing) return existing.id;
  }

  const companyId = await resolveCompanyIdForTargetApp(pendingRequest.targetAppId);

  const persisted = await persistDraftPlanAsOrchestration({
    draftPlan: pendingRequest.draftPlan,
    companyId,
    targetAppId: pendingRequest.targetAppId,
    name: deriveOrchestrationName(pendingRequest.requestText),
    description: pendingRequest.requestText,
    createdById: input.createdById,
  });

  await setPendingPlanRequestDraftOrchestrationId({
    id: pendingRequest.id,
    draftOrchestrationId: persisted.orchestrationId,
  });

  return persisted.orchestrationId;
}
