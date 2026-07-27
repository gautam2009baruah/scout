// Grounding context for the AI Planner: merges (a) tenant-scoped DB schema
// summaries and (b) top-k knowledge-base passages for a user's request into
// one object the planner LLM can read alongside the tool catalog
// (config/planner-tools.json) when drafting a plan.
//
// Deliberately thin — both halves are read straight from the systems that
// already own this data (the database-node schema fetcher, the RAG
// RetrievalEngine) rather than reimplemented here.

import {
  listActiveDatabaseSchemasForTargetApp,
  type ActiveDatabaseSchemaSummary,
} from "../nodes/database-node";
import { RetrievalEngine, type RetrievalChunk } from "@/lib/search/retrieval-engine";
import type { Citation } from "@/lib/search/citation-engine";

export type PlannerSchemaContext = {
  id: string;
  databaseName: string;
  databaseType: string;
  schemaSummary: string;
};

export type PlannerKnowledgeContext = {
  query: string;
  chunks: RetrievalChunk[];
  citations: Citation[];
  formattedText: string;
};

export type PlannerContext = {
  companyId: string;
  targetAppId: string;
  schemas: PlannerSchemaContext[];
  knowledge: PlannerKnowledgeContext;
};

function formatChunksAsText(chunks: RetrievalChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((chunk) => `Source: ${chunk.document_name}${chunk.page_number ? ` (p.${chunk.page_number})` : ""}\n${chunk.content}`)
    .join("\n\n---\n\n");
}

/**
 * Builds the planner's grounding context for a single user request: every
 * active database schema configured for the target app (there's no
 * relevance-ranking mechanism for schemas yet, so all of them are included
 * and the planner LLM judges relevance itself, same as a human would when
 * picking a schema in the Database node's config UI) plus the top-k
 * knowledge-base passages semantically relevant to the request text.
 */
export async function buildPlannerContext(input: {
  companyId: string;
  targetAppId: string;
  userId: string;
  requestText: string;
  topK?: number;
}): Promise<PlannerContext> {
  const [schemas, retrieval] = await Promise.all([
    listActiveDatabaseSchemasForTargetApp({
      companyId: input.companyId,
      targetAppId: input.targetAppId,
    }),
    RetrievalEngine.retrieve(
      input.companyId,
      input.userId,
      input.requestText,
      input.topK ?? 5,
      input.targetAppId
    ),
  ]);

  return {
    companyId: input.companyId,
    targetAppId: input.targetAppId,
    schemas: schemas.map((schema: ActiveDatabaseSchemaSummary) => ({
      id: schema.id,
      databaseName: schema.databaseName,
      databaseType: schema.databaseType,
      schemaSummary: schema.schemaSummary,
    })),
    knowledge: {
      query: retrieval.query,
      chunks: retrieval.chunks,
      citations: retrieval.citations,
      formattedText: formatChunksAsText(retrieval.chunks),
    },
  };
}
