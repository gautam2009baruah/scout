// AI Planner (Step 3b): checks whether a saved, admin-approved-for-matching
// orchestration already does what the user is asking for, before the
// planner falls through to drafting a new one (Step 4).

import { getPool } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/embedding/providers";
import { checkExternalUserAccess } from "@/lib/chat/access-validator";
import { getOrchestrationEmbeddingColumnMode, serializeEmbeddingForColumn } from "./orchestration-index";

export const DEFAULT_MATCH_CONFIDENCE_THRESHOLD = 0.75;

/**
 * Admin-configurable override for the threshold above, read from the
 * matchConfidenceThreshold field of whichever published orchestration's
 * checked ai_planner node currently owns the "chatbot" drafting-entry-point
 * scope for this (companyId, targetAppId) — see
 * orchestrations.ai_planner_drafting_trigger_type (migration 137) and
 * AiPlannerNodeConfig in shared/orchestrationTypes.ts. Falls back to
 * DEFAULT_MATCH_CONFIDENCE_THRESHOLD if no such orchestration exists, or its
 * node never set a threshold. Used by findMatchingOrchestration when no
 * explicit confidenceThreshold is passed.
 */
export async function getEffectiveMatchConfidenceThreshold(
  companyId: string,
  targetAppId: string | null
): Promise<number> {
  const result = await getPool().query<{ config: { matchConfidenceThreshold?: number } | null }>(
    `
      SELECT n.config
      FROM orchestrations o
      INNER JOIN orchestration_nodes n ON n.orchestration_id = o.id AND n.node_type = 'ai_planner'
      WHERE o.company_id = $1
        AND COALESCE(o.target_app_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        AND o.ai_planner_drafting_trigger_type = 'chatbot'
      LIMIT 1
    `,
    [companyId, targetAppId]
  );

  const raw = result.rows[0]?.config?.matchConfidenceThreshold;
  return typeof raw === "number" ? raw : DEFAULT_MATCH_CONFIDENCE_THRESHOLD;
}

export type OrchestrationMatch = {
  orchestrationId: string;
  name: string;
  description: string | null;
  summaryText: string;
  score: number;
};

function cosineSimilarity(first: number[], second: number[]) {
  let dot = 0;
  let firstMagnitude = 0;
  let secondMagnitude = 0;

  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    dot += first[index] * second[index];
    firstMagnitude += first[index] * first[index];
    secondMagnitude += second[index] * second[index];
  }

  return dot / ((Math.sqrt(firstMagnitude) || 1) * (Math.sqrt(secondMagnitude) || 1));
}

/**
 * Finds the best existing orchestration for a user's request, if any clears
 * the confidence threshold. Only ever considers orchestrations that are (a)
 * published — a draft isn't "existing" in the sense of ready-to-run — and
 * (b) matchable_without_validation = true, the admin opt-in gate from Step
 * 3b's migration. Scoped to the requester's company and target app (a chat
 * request is always scoped to one target app; company-wide orchestrations
 * with no target app set are also eligible).
 *
 * Deviates from the roadmap's literal findMatchingOrchestration(userRequestText,
 * externalUserId) signature by also requiring companyId/targetAppId — same
 * reasoning as buildPlannerContext in ../planner/context.ts: tenant scoping
 * can't be inferred from externalUserId alone (see lib/chat/access-validator.ts),
 * and the caller (the future PlannerAgent) will already have both resolved.
 */
export async function findMatchingOrchestration(input: {
  userRequestText: string;
  externalUserId: string;
  companyId: string;
  targetAppId: string;
  confidenceThreshold?: number;
}): Promise<OrchestrationMatch | null> {
  // Currently a no-op stub (see lib/chat/access-validator.ts) — kept as the
  // single call site so real enforcement, once the client's access API
  // exists, is a one-file change rather than a hunt through every caller.
  const access = await checkExternalUserAccess(input.externalUserId, "orchestration_match");
  if (!access.allowed) return null;

  const requestText = input.userRequestText.trim();
  if (!requestText) return null;

  const threshold = input.confidenceThreshold ?? (await getEffectiveMatchConfidenceThreshold(input.companyId, input.targetAppId));

  const provider = await getEmbeddingProvider(input.companyId, input.targetAppId);
  const queryEmbedding = await provider.embed_text(requestText);
  const mode = await getOrchestrationEmbeddingColumnMode();

  const candidate =
    mode === "vector"
      ? await findTopMatchVector(input.companyId, input.targetAppId, queryEmbedding, provider.provider, provider.model)
      : await findTopMatchJson(input.companyId, input.targetAppId, queryEmbedding, provider.provider, provider.model);

  if (!candidate || candidate.score < threshold) {
    return null;
  }

  return candidate;
}

async function findTopMatchVector(
  companyId: string,
  targetAppId: string,
  queryEmbedding: number[],
  provider: string,
  model: string
): Promise<OrchestrationMatch | null> {
  const result = await getPool().query<{
    orchestration_id: string;
    name: string;
    description: string | null;
    summary_text: string;
    score: number;
  }>(
    `
      SELECT
        oe.orchestration_id,
        o.name,
        o.description,
        oe.summary_text,
        1 - (oe.embedding <=> $1::vector) AS score
      FROM orchestration_embeddings oe
      INNER JOIN orchestrations o ON o.id = oe.orchestration_id
      WHERE oe.company_id = $2
        AND oe.embedding_provider = $3
        AND oe.embedding_model = $4
        AND o.status = 'published'
        AND o.matchable_without_validation = true
        AND (o.target_app_id IS NULL OR o.target_app_id = $5)
      ORDER BY oe.embedding <=> $1::vector
      LIMIT 1
    `,
    [serializeEmbeddingForColumn(queryEmbedding, "vector"), companyId, provider, model, targetAppId]
  );

  return mapMatchRow(result.rows[0]);
}

async function findTopMatchJson(
  companyId: string,
  targetAppId: string,
  queryEmbedding: number[],
  provider: string,
  model: string
): Promise<OrchestrationMatch | null> {
  const result = await getPool().query<{
    orchestration_id: string;
    name: string;
    description: string | null;
    summary_text: string;
    embedding: number[];
  }>(
    `
      SELECT
        oe.orchestration_id,
        o.name,
        o.description,
        oe.summary_text,
        oe.embedding
      FROM orchestration_embeddings oe
      INNER JOIN orchestrations o ON o.id = oe.orchestration_id
      WHERE oe.company_id = $1
        AND oe.embedding_provider = $2
        AND oe.embedding_model = $3
        AND o.status = 'published'
        AND o.matchable_without_validation = true
        AND (o.target_app_id IS NULL OR o.target_app_id = $4)
    `,
    [companyId, provider, model, targetAppId]
  );

  const scored = result.rows
    .map((row) => ({ row, score: cosineSimilarity(queryEmbedding, row.embedding) }))
    .sort((first, second) => second.score - first.score);

  if (scored.length === 0) return null;
  return mapMatchRow({ ...scored[0].row, score: scored[0].score });
}

function mapMatchRow(
  row?: { orchestration_id: string; name: string; description: string | null; summary_text: string; score: number }
): OrchestrationMatch | null {
  if (!row) return null;
  return {
    orchestrationId: row.orchestration_id,
    name: row.name,
    description: row.description,
    summaryText: row.summary_text,
    score: Number(Number(row.score).toFixed(4)),
  };
}
