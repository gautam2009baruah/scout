// Step 7: the pending-approval queue a submitted draft plan lands in.
// Step 7b's admin UI reads/resolves these.

import { getPool } from "@/lib/db/pool";
import type { DraftPlan } from "./draft-plan";

export type PendingPlanRequestStatus = "pending" | "approved" | "rejected";

export type PendingPlanRequest = {
  id: string;
  companyId: string;
  targetAppId: string | null;
  externalUserId: string;
  conversationId: string | null;
  draftOrchestrationId: string | null;
  requestText: string;
  draftPlan: DraftPlan;
  planSummary: string;
  status: PendingPlanRequestStatus;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  rejectionReason: string | null;
};

type PendingPlanRequestRow = {
  id: string;
  company_id: string;
  target_app_id: string | null;
  external_user_id: string;
  conversation_id: string | null;
  draft_orchestration_id: string | null;
  request_text: string;
  draft_plan: DraftPlan;
  plan_summary: string;
  status: PendingPlanRequestStatus;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  rejection_reason: string | null;
};

function mapRow(row: PendingPlanRequestRow): PendingPlanRequest {
  return {
    id: row.id,
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    externalUserId: row.external_user_id,
    conversationId: row.conversation_id,
    draftOrchestrationId: row.draft_orchestration_id,
    requestText: row.request_text,
    draftPlan: row.draft_plan,
    planSummary: row.plan_summary,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() || null,
    resolvedBy: row.resolved_by,
    rejectionReason: row.rejection_reason,
  };
}

export class PendingPlanRequestConflictError extends Error {
  constructor() {
    super("A request from this user is already pending approval.");
    this.name = "PendingPlanRequestConflictError";
  }
}

/**
 * Looks up whether externalUserId already has a request awaiting admin
 * review for this company — the pending-request lock's read side. Used by
 * the chatbot orchestrations list (Step 7, to disable the AI Planner entry)
 * and will be used again by Step 8's service-layer guard.
 */
export async function getActivePendingPlanRequest(input: {
  companyId: string;
  externalUserId: string;
}): Promise<PendingPlanRequest | null> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `
      SELECT *
      FROM ai_planner_pending_requests
      WHERE company_id = $1
        AND external_user_id = $2
        AND status = 'pending'
      LIMIT 1
    `,
    [input.companyId, input.externalUserId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Creates the pending-approval record for a completed draft plan. Relies on
 * the DB's partial unique index (one pending row per company+external_user_id)
 * as the ultimate guarantee against a race between the lock check and this
 * insert — thrown as PendingPlanRequestConflictError rather than a raw
 * Postgres error so callers can show a friendly message.
 */
export async function createPendingPlanRequest(input: {
  companyId: string;
  targetAppId?: string | null;
  externalUserId: string;
  conversationId?: string | null;
  requestText: string;
  draftPlan: DraftPlan;
  planSummary: string;
}): Promise<PendingPlanRequest> {
  try {
    const result = await getPool().query<PendingPlanRequestRow>(
      `
        INSERT INTO ai_planner_pending_requests (
          company_id, target_app_id, external_user_id, conversation_id, request_text, draft_plan, plan_summary
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING *
      `,
      [
        input.companyId,
        input.targetAppId || null,
        input.externalUserId,
        input.conversationId || null,
        input.requestText,
        JSON.stringify(input.draftPlan),
        input.planSummary,
      ]
    );

    return mapRow(result.rows[0]);
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "23505") {
      throw new PendingPlanRequestConflictError();
    }
    throw error;
  }
}

/** Step 7b's queue listing — every pending request for a company, newest first. */
export async function listPendingPlanRequests(companyId: string): Promise<PendingPlanRequest[]> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `
      SELECT *
      FROM ai_planner_pending_requests
      WHERE company_id = $1
        AND status = 'pending'
      ORDER BY created_at ASC
    `,
    [companyId]
  );

  return result.rows.map(mapRow);
}

export async function getPendingPlanRequestById(input: { id: string; companyId: string }): Promise<PendingPlanRequest | null> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `SELECT * FROM ai_planner_pending_requests WHERE id = $1 AND company_id = $2`,
    [input.id, input.companyId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Records which draft-status orchestration a pending request's plan was
 * converted into (Step 5's converter), the first time an admin opens it in
 * the builder — so re-opening reuses the same orchestration instead of
 * creating a duplicate.
 */
export async function setPendingPlanRequestDraftOrchestrationId(input: {
  id: string;
  draftOrchestrationId: string;
}): Promise<void> {
  await getPool().query(
    `UPDATE ai_planner_pending_requests SET draft_orchestration_id = $2, updated_at = now() WHERE id = $1`,
    [input.id, input.draftOrchestrationId]
  );
}

export async function resolvePendingPlanRequest(input: {
  id: string;
  companyId: string;
  status: "approved" | "rejected";
  resolvedById: string;
  rejectionReason?: string | null;
}): Promise<PendingPlanRequest | null> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `
      UPDATE ai_planner_pending_requests
      SET status = $3, resolved_at = now(), resolved_by = $4, rejection_reason = $5, updated_at = now()
      WHERE id = $1
        AND company_id = $2
        AND status = 'pending'
      RETURNING *
    `,
    [input.id, input.companyId, input.status, input.resolvedById, input.rejectionReason || null]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
