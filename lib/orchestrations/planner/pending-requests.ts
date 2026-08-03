// Step 7: the pending-approval queue a submitted draft plan lands in.
// Step 7b's admin UI reads/resolves these.

import { getPool } from "@/lib/db/pool";
import type { DraftPlan } from "./draft-plan";

export type PendingPlanRequestStatus = "pending" | "approved" | "rejected";

export type PendingPlanRequest = {
  id: string;
  targetAppId: string;
  targetAppName: string | null;
  environmentId: string | null;
  environmentName: string | null;
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
  resolvedByName: string | null;
  rejectionReason: string | null;
};

export type PendingPlanRequestPage = {
  requests: PendingPlanRequest[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

type PendingPlanRequestRow = {
  id: string;
  target_app_id: string;
  target_app_name: string | null;
  environment_id: string | null;
  environment_name: string | null;
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
  resolved_by_name: string | null;
  rejection_reason: string | null;
};

function mapRow(row: PendingPlanRequestRow): PendingPlanRequest {
  return {
    id: row.id,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name ?? null,
    environmentId: row.environment_id ?? null,
    environmentName: row.environment_name ?? null,
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
    resolvedByName: row.resolved_by_name ?? null,
    rejectionReason: row.rejection_reason,
  };
}

function clampPageSize(pageSize: number | undefined): number {
  if (!pageSize || Number.isNaN(pageSize)) return 10;
  return Math.min(Math.max(Math.trunc(pageSize), 5), 100);
}

function clampPage(page: number | undefined): number {
  if (!page || Number.isNaN(page) || page < 1) return 1;
  return Math.trunc(page);
}

export class PendingPlanRequestConflictError extends Error {
  constructor() {
    super("A request from this user is already pending approval.");
    this.name = "PendingPlanRequestConflictError";
  }
}

/**
 * Looks up whether externalUserId already has a request awaiting admin
 * review for this target app — the pending-request lock's read side. Used
 * by the chatbot orchestrations list (Step 7, to disable the AI Planner
 * entry) and will be used again by Step 8's service-layer guard. Scoped to
 * target_app_id to match the DB's own partial-unique-index granularity (see
 * createPendingPlanRequest's doc comment) — a user can have at most one
 * pending request per target app, not per company.
 */
export async function getActivePendingPlanRequest(input: {
  targetAppId: string;
  externalUserId: string;
}): Promise<PendingPlanRequest | null> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `
      SELECT *
      FROM ai_planner_pending_requests
      WHERE target_app_id = $1
        AND external_user_id = $2
        AND status = 'pending'
      LIMIT 1
    `,
    [input.targetAppId, input.externalUserId]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}

/**
 * Creates the pending-approval record for a completed draft plan. Relies on
 * the DB's partial unique index (one pending row per target_app_id+external_user_id)
 * as the ultimate guarantee against a race between the lock check and this
 * insert — thrown as PendingPlanRequestConflictError rather than a raw
 * Postgres error so callers can show a friendly message.
 */
export async function createPendingPlanRequest(input: {
  targetAppId: string;
  environmentId?: string | null;
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
          target_app_id, environment_id, external_user_id, conversation_id, request_text, draft_plan, plan_summary
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
        RETURNING *
      `,
      [
        input.targetAppId,
        input.environmentId || null,
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

/** Step 7b's queue listing — pending requests for a company, oldest first (FIFO), filterable and paginated. */
export async function listPendingPlanRequests(input: {
  companyId: string;
  targetAppId?: string | null;
  environmentId?: string | null;
  requestedFrom?: string | null;
  requestedTo?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<PendingPlanRequestPage> {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const offset = (page - 1) * pageSize;

  const params = [
    input.companyId,
    input.targetAppId || null,
    input.requestedFrom || null,
    input.requestedTo || null,
    input.environmentId || null,
  ];

  const whereClause = `
    WHERE cta.company_id = $1
      AND r.status = 'pending'
      AND ($2::uuid IS NULL OR r.target_app_id = $2)
      AND ($3::timestamptz IS NULL OR r.created_at >= $3)
      AND ($4::timestamptz IS NULL OR r.created_at <= $4)
      AND ($5::uuid IS NULL OR r.environment_id = $5)
  `;

  const [rowsResult, countResult] = await Promise.all([
    getPool().query<PendingPlanRequestRow>(
      `
        SELECT r.*, cta.name AS target_app_name, env.name AS environment_name
        FROM ai_planner_pending_requests r
        INNER JOIN company_target_applications cta ON cta.id = r.target_app_id
        LEFT JOIN target_app_environments env ON env.id = r.environment_id
        ${whereClause}
        ORDER BY r.created_at ASC
        LIMIT $6 OFFSET $7
      `,
      [...params, pageSize, offset]
    ),
    getPool().query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM ai_planner_pending_requests r
        INNER JOIN company_target_applications cta ON cta.id = r.target_app_id
        ${whereClause}
      `,
      params
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count || "0", 10);

  return {
    requests: rowsResult.rows.map(mapRow),
    page,
    pageSize,
    total,
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
  };
}

/** Archived-tab listing — resolved (approved/rejected) requests for a company, most recently resolved first. */
export async function listResolvedPlanRequests(input: {
  companyId: string;
  targetAppId?: string | null;
  environmentId?: string | null;
  status?: "approved" | "rejected" | "all";
  resolvedFrom?: string | null;
  resolvedTo?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<PendingPlanRequestPage> {
  const page = clampPage(input.page);
  const pageSize = clampPageSize(input.pageSize);
  const offset = (page - 1) * pageSize;
  const status = input.status && input.status !== "all" ? input.status : null;

  const params = [
    input.companyId,
    input.targetAppId || null,
    input.resolvedFrom || null,
    input.resolvedTo || null,
    status,
    input.environmentId || null,
  ];

  const whereClause = `
    WHERE cta.company_id = $1
      AND r.status IN ('approved', 'rejected')
      AND ($2::uuid IS NULL OR r.target_app_id = $2)
      AND ($3::timestamptz IS NULL OR r.resolved_at >= $3)
      AND ($4::timestamptz IS NULL OR r.resolved_at <= $4)
      AND ($5::text IS NULL OR r.status = $5)
      AND ($6::uuid IS NULL OR r.environment_id = $6)
  `;

  const [rowsResult, countResult] = await Promise.all([
    getPool().query<PendingPlanRequestRow>(
      `
        SELECT r.*, cta.name AS target_app_name, u.name AS resolved_by_name, env.name AS environment_name
        FROM ai_planner_pending_requests r
        INNER JOIN company_target_applications cta ON cta.id = r.target_app_id
        LEFT JOIN users u ON u.id = r.resolved_by
        LEFT JOIN target_app_environments env ON env.id = r.environment_id
        ${whereClause}
        ORDER BY r.resolved_at DESC
        LIMIT $7 OFFSET $8
      `,
      [...params, pageSize, offset]
    ),
    getPool().query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM ai_planner_pending_requests r
        INNER JOIN company_target_applications cta ON cta.id = r.target_app_id
        ${whereClause}
      `,
      params
    ),
  ]);

  const total = parseInt(countResult.rows[0]?.count || "0", 10);

  return {
    requests: rowsResult.rows.map(mapRow),
    page,
    pageSize,
    total,
    pageCount: Math.max(Math.ceil(total / pageSize), 1),
  };
}

export async function getPendingPlanRequestById(input: { id: string; companyId: string }): Promise<PendingPlanRequest | null> {
  const result = await getPool().query<PendingPlanRequestRow>(
    `
      SELECT *
      FROM ai_planner_pending_requests
      WHERE id = $1
        AND EXISTS (
          SELECT 1 FROM company_target_applications cta
          WHERE cta.id = ai_planner_pending_requests.target_app_id AND cta.company_id = $2
        )
    `,
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
        AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM company_target_applications cta
          WHERE cta.id = ai_planner_pending_requests.target_app_id AND cta.company_id = $2
        )
      RETURNING *
    `,
    [input.id, input.companyId, input.status, input.resolvedById, input.rejectionReason || null]
  );

  return result.rows[0] ? mapRow(result.rows[0]) : null;
}
