// AI Planner (Step 3b): keeps orchestration_embeddings in sync with saved
// orchestrations, reusing the same embedding-provider abstraction the
// document knowledge base uses (lib/embedding/providers.ts) so this index
// lives on the same vector-store infrastructure, just in its own table
// instead of chunk_embeddings (see db/migrations/132_orchestration_planner_index.sql
// for why it isn't literally the same table).

import { getPool } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/embedding/providers";
import type { Orchestration, OrchestrationNode, TriggerNodeConfig } from "@/shared/orchestrationTypes";

export function serializeEmbeddingForColumn(embedding: number[], mode: "vector" | "jsonb") {
  return mode === "vector" ? `[${embedding.join(",")}]` : JSON.stringify(embedding);
}

export async function getOrchestrationEmbeddingColumnMode(): Promise<"vector" | "jsonb"> {
  const result = await getPool().query<{ udt_name: string }>(
    `
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'orchestration_embeddings'
        AND column_name = 'embedding'
    `
  );

  return result.rows[0]?.udt_name === "vector" ? "vector" : "jsonb";
}

function describeTrigger(nodes: OrchestrationNode[]): string {
  const triggerNode = nodes.find((node) => node.nodeType === "trigger");
  if (!triggerNode) return "no trigger configured";

  const config = triggerNode.config as TriggerNodeConfig;
  return `triggered by ${config.triggerType || "an unconfigured trigger"}`;
}

/**
 * Plain-language rendering of an orchestration's node sequence. Deliberately
 * simple for now (ordered node label/type concatenation) per Step 3b's own
 * fallback instruction — swap this out for the per-node justification logic
 * from Step 6 once that exists, without changing indexOrchestration's shape.
 */
function describeNodeSequence(nodes: OrchestrationNode[]): string {
  const steps = nodes
    .filter((node) => node.nodeType !== "trigger" && node.nodeType !== "end" && node.nodeType !== "ai_planner")
    .map((node) => node.label?.trim() || node.nodeType);

  if (steps.length === 0) return "no steps configured yet";
  return `Steps: ${steps.join(" -> ")}`;
}

export function buildOrchestrationSummaryText(orchestration: Orchestration, nodes: OrchestrationNode[]): string {
  const parts = [
    orchestration.name,
    orchestration.description || "",
    describeTrigger(nodes),
    describeNodeSequence(nodes),
  ].filter(Boolean);

  return parts.join("\n");
}

/**
 * (Re)indexes a single orchestration into orchestration_embeddings. Takes an
 * already-loaded orchestration + nodes rather than an id: every call site in
 * ../db.ts (create/update/publish) already has both in hand, and taking them
 * as parameters instead of re-fetching avoids a circular import back into
 * db.ts. Safe to call on an orchestration with no nodes yet (early in
 * creation) — it just produces a thin summary that publishOrchestration's
 * later call will replace with a full one once the graph is built out.
 *
 * Best-effort: failures are caught and logged by the caller (see the create/
 * update/publish hooks in ../db.ts), never allowed to fail the orchestration
 * save itself — this index is a matching aid, not a system of record.
 */
export async function indexOrchestration(orchestration: Orchestration, nodes: OrchestrationNode[]): Promise<void> {
  const summaryText = buildOrchestrationSummaryText(orchestration, nodes);

  const provider = await getEmbeddingProvider(orchestration.companyId, orchestration.targetAppId || undefined);
  const embedding = await provider.embed_text(summaryText);
  const mode = await getOrchestrationEmbeddingColumnMode();

  await getPool().query(
    `
      INSERT INTO orchestration_embeddings (
        company_id, orchestration_id, summary_text, embedding,
        embedding_provider, embedding_model, embedding_dimension, updated_at
      )
      VALUES ($1, $2, $3, $4::${mode}, $5, $6, $7, now())
      ON CONFLICT (orchestration_id, embedding_provider, embedding_model)
      DO UPDATE SET
        summary_text = EXCLUDED.summary_text,
        embedding = EXCLUDED.embedding,
        embedding_dimension = EXCLUDED.embedding_dimension,
        updated_at = now()
    `,
    [
      orchestration.companyId,
      orchestration.id,
      summaryText,
      serializeEmbeddingForColumn(embedding, mode),
      provider.provider,
      provider.model,
      provider.dimensions,
    ]
  );
}
