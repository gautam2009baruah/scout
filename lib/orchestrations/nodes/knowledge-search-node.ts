// Knowledge Search node executor
// Wraps the existing RAG retrieval pipeline (RetrievalEngine) as an
// orchestration step: query in, ranked knowledge-base passages + citations
// out. Retrieval only — no LLM synthesis here, that's AI Task's job
// downstream (point its "Context Content" field at this node's output).

import type { KnowledgeSearchNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression, resolveVariablePath, setVariablePath } from "../expression-evaluator";
import { RetrievalEngine } from "@/lib/search/retrieval-engine";
import { getPool } from "@/lib/db/pool";

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function firstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function getTopK(config: KnowledgeSearchNodeConfig): number {
  const parsed = Number(config.topK);
  if (!Number.isFinite(parsed)) return 5;
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function formatChunksAsText(chunks: Array<{ document_name: string; page_number: number; content: string }>): string {
  return chunks
    .map((chunk) => `Source: ${chunk.document_name}${chunk.page_number ? ` (p.${chunk.page_number})` : ""}\n${chunk.content}`)
    .join("\n\n---\n\n");
}

// A chatbot is always scoped to exactly one target app (never run at the
// company level), so the target app is the authoritative source of tenant
// identity for chat-triggered orchestrations. Derive companyId from it.
async function resolveCompanyIdForTargetApp(targetAppId: string): Promise<string> {
  const result = await getPool().query<{ company_id: string }>(
    `SELECT company_id FROM company_target_applications WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [targetAppId]
  );
  return result.rows[0]?.company_id || "";
}

export async function executeKnowledgeSearchNode(
  config: KnowledgeSearchNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const query = normalizeText(evaluateExpression(config.query || "", context));
    if (!query) {
      throw new Error("Knowledge Search query is required.");
    }

    const outputVariable = normalizeText(config.outputVariable) || "knowledgeSearch";

    const targetAppId = firstNonEmptyString([
      resolveVariablePath("targetAppId", context),
      resolveVariablePath("trigger.input.targetAppId", context),
    ]);

    const directCompanyId = firstNonEmptyString([
      resolveVariablePath("companyId", context),
      resolveVariablePath("trigger.input.companyId", context),
    ]);

    // Prefer deriving companyId from the target app (the reliable identity
    // for chat-triggered orchestrations); fall back to a directly-provided
    // companyId only when no target app is present (e.g. a company-wide
    // schedule/manual-triggered orchestration).
    const companyId = targetAppId
      ? (await resolveCompanyIdForTargetApp(targetAppId)) || directCompanyId
      : directCompanyId;

    if (!companyId) {
      throw new Error("Unable to resolve company context for Knowledge Search node.");
    }

    const userId = firstNonEmptyString([
      resolveVariablePath("_system.triggeredBy", context),
      resolveVariablePath("trigger.startedBy", context),
    ]);
    if (!userId) {
      throw new Error("Unable to resolve user context for Knowledge Search node.");
    }

    const topK = getTopK(config);
    const response = await RetrievalEngine.retrieve(companyId, userId, query, topK, targetAppId || undefined);

    const output: Record<string, unknown> = {};
    setVariablePath(outputVariable, formatChunksAsText(response.chunks), output);
    setVariablePath(`${outputVariable}Chunks`, response.chunks, output);
    setVariablePath(`${outputVariable}Citations`, response.citations, output);
    setVariablePath(`${outputVariable}Meta`, {
      query: response.query,
      resultCount: response.chunks.length,
    }, output);

    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to search the knowledge base",
    };
  }
}
