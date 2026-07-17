import { getPool } from "@/lib/db/pool";
import { CitationEngine, type Citation } from "./citation-engine";
import { BM25SearchService } from "./keyword-search";
import { normalizeAndExpandProcurementQuery } from "./query-normalization";
import { getRetrievalConfig } from "./retrieval-config";
import { detectFilterExclusionRisk } from "./filter-diagnostics";
import { buildRetrievalFallbackPlan } from "./retrieval-fallback";
import { reciprocalRankFusion, rerankCandidates, selectDiverseChunks } from "./retrieval-ranking";
import { VectorSearchService, type VectorSearchResult } from "./vector-search";
import { VisualSearchService } from "./visual-search";

export type RetrievalChunk = {
  chunk_id: string;
  content: string;
  document_id: string;
  document_name: string;
  folder_path: string;
  page_number: number;
  section_title: string;
  section_path?: string;
  document_type?: string;
  country?: string;
  department?: string;
  process_stage?: string;
  effective_date?: string;
  score: number;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
  source_url?: string;
  download_available?: boolean;
  metadata_json?: Record<string, unknown>;
};

type RetrievalAttempt = {
  stage: string;
  query: string;
  keywordOnly: boolean;
  relaxMetadataFilters: boolean;
  relaxTargetScope: boolean;
  rawVectorCount: number;
  rawBm25Count: number;
  rawVisualCount: number;
  afterFiltersCount: number;
};

export type RetrievalResponse = {
  query: string;
  chunks: RetrievalChunk[];
  citations: Citation[];
  diagnostics?: {
    attempts: RetrievalAttempt[];
    matchedSynonymGroups: string[][];
    filterDiagnostics?: {
      accessibleIndexedDocuments: number;
      targetScopedAccessibleDocuments: number;
    };
  };
};

type SearchMetadataHints = {
  country?: string;
  department?: string;
  process_stage?: string;
};

function parseMetadataHints(query: string): SearchMetadataHints {
  const normalized = query.toLowerCase();
  const hints: SearchMetadataHints = {};

  const countryMatch = normalized.match(/\b(?:in|for|country)\s+([a-z][a-z\s-]{2,30})\b/);
  if (countryMatch?.[1]) {
    hints.country = countryMatch[1].trim();
  }

  const departmentMatch = normalized.match(/\b(?:department|team|function)\s+([a-z][a-z\s-]{2,30})\b/);
  if (departmentMatch?.[1]) {
    hints.department = departmentMatch[1].trim();
  }

  const stageMatch = normalized.match(/\b(?:stage|phase|step)\s+([a-z][a-z\s-]{2,30})\b/);
  if (stageMatch?.[1]) {
    hints.process_stage = stageMatch[1].trim();
  }

  return hints;
}

function metadataMatches(result: VectorSearchResult, hints: SearchMetadataHints) {
  const checks: Array<[string | undefined, string | undefined]> = [
    [hints.country, result.country],
    [hints.department, result.department],
    [hints.process_stage, result.process_stage]
  ];

  const activeChecks = checks.filter((pair) => Boolean(pair[0]));

  if (activeChecks.length === 0) {
    return true;
  }

  return activeChecks.every(([expected, actual]) => {
    if (!expected || !actual) {
      return false;
    }

    return actual.toLowerCase().includes(expected.toLowerCase());
  });
}

async function getAllowedFolderIds(companyId: string, targetAppId?: string) {
  if (!targetAppId) {
    return null;
  }

  const allowed = await getPool().query<{ id: string }>(
    `
      SELECT folders.id
      FROM folders
      WHERE folders.company_id = $1
        AND folders.deleted_at IS NULL
        AND (
          NOT EXISTS (
            SELECT 1 FROM folder_target_apps any_scope
            WHERE any_scope.folder_id = folders.id AND any_scope.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM folder_target_apps app_scope
            WHERE app_scope.folder_id = folders.id
              AND app_scope.target_app_id = $2
              AND app_scope.deleted_at IS NULL
          )
        )
    `,
    [companyId, targetAppId]
  );

  return new Set(allowed.rows.map((row) => row.id));
}

function toTextChunk(result: VectorSearchResult, score: number): RetrievalChunk {
  return {
    chunk_id: result.chunk_id,
    content: result.content,
    document_id: result.document_id,
    document_name: result.document_name,
    folder_path: result.folder_path,
    page_number: result.page_number,
    section_title: result.section_title,
    section_path: result.section_path,
    document_type: result.document_type,
    country: result.country,
    department: result.department,
    process_stage: result.process_stage,
    effective_date: result.effective_date,
    source_url: result.source_url,
    metadata_json: result.metadata_json,
    score: Number(score.toFixed(4)),
    citation_type: "text"
  };
}

async function getDocumentSources(documentIds: string[]) {
  if (documentIds.length === 0) {
    return new Map<string, { sourceUrl?: string; downloadAvailable: boolean }>();
  }

  const result = await getPool().query<{
    id: string;
    external_source_url: string | null;
    storage_path: string | null;
    source_metadata_json: Record<string, unknown> | null;
  }>(
    `SELECT id, external_source_url, storage_path, source_metadata_json
     FROM documents
     WHERE id = ANY($1::uuid[])
       AND status <> 'deleted'`,
    [documentIds]
  );

  return new Map(result.rows.map((row) => {
    const sourceUrl = row.external_source_url?.trim()
      || (typeof row.source_metadata_json?.source_url === "string" ? row.source_metadata_json.source_url : undefined)
      || undefined;

    return [
      row.id,
      {
        sourceUrl,
        downloadAvailable: Boolean(row.storage_path)
      }
    ];
  }));
}

async function countAccessibleIndexedDocuments(companyId: string) {
  const result = await getPool().query<{ count: string }>(
    `
      SELECT COUNT(DISTINCT documents.id)::text AS count
      FROM documents
      INNER JOIN document_chunks ON document_chunks.document_id = documents.id
      WHERE documents.company_id = $1
        AND documents.status IN ('embedded', 'indexed')
    `,
    [companyId]
  );

  return Number(result.rows[0]?.count ?? 0);
}

function scopedByTargetApp(results: VectorSearchResult[], allowedFolderIds: Set<string> | null, relaxTargetScope: boolean) {
  if (relaxTargetScope || !allowedFolderIds) {
    return results;
  }

  return results.filter((item) => allowedFolderIds.has(item.folder_id));
}

function scopedByMetadata(results: VectorSearchResult[], hints: SearchMetadataHints, relaxMetadataFilters: boolean) {
  if (relaxMetadataFilters) {
    return results;
  }

  return results.filter((item) => metadataMatches(item, hints));
}

export class RetrievalEngine {
  static async retrieve(company_id: string, user_id: string, query: string, top_k = 10, target_app_id?: string): Promise<RetrievalResponse> {
    const normalizedQuery = query.trim();
    const requestedTopK = Math.min(8, Math.max(5, Number(top_k) || 8));

    if (!company_id) {
      throw new Error("Company is required.");
    }

    if (!user_id) {
      throw new Error("User is required.");
    }

    if (!normalizedQuery) {
      throw new Error("Search query is required.");
    }

    const roleIds: string[] = [];

    const config = getRetrievalConfig();
    const normalized = normalizeAndExpandProcurementQuery(normalizedQuery);
    const metadataHints = parseMetadataHints(normalizedQuery);
    const allowedFolderIds = await getAllowedFolderIds(company_id, target_app_id?.trim() || undefined);

    const attempts: RetrievalAttempt[] = [];

    const searchPlan = buildRetrievalFallbackPlan({
      normalized: normalized.normalized,
      expanded: normalized.expanded,
      aggressiveExpanded: normalized.aggressiveExpanded
    });

    for (const plan of searchPlan) {
      const [vectorRaw, bm25Raw, visualRaw] = await Promise.all([
        plan.keywordOnly
          ? Promise.resolve([])
          : VectorSearchService.search(company_id, plan.searchQuery, roleIds, config.vector_top_k, user_id),
        BM25SearchService.search(company_id, plan.searchQuery, roleIds, config.bm25_top_k, user_id),
        plan.keywordOnly
          ? Promise.resolve([])
          : VisualSearchService.search(company_id, plan.searchQuery, roleIds, config.bm25_top_k, user_id)
      ]);

      const vectorScoped = scopedByMetadata(
        scopedByTargetApp(vectorRaw, allowedFolderIds, plan.relaxTargetScope),
        metadataHints,
        plan.relaxMetadataFilters
      );
      const bm25Scoped = scopedByMetadata(
        scopedByTargetApp(bm25Raw, allowedFolderIds, plan.relaxTargetScope),
        metadataHints,
        plan.relaxMetadataFilters
      );
      const visualScoped = plan.relaxTargetScope || !allowedFolderIds
        ? visualRaw
        : visualRaw.filter((item) => allowedFolderIds.has(item.folder_id));

      const fused = reciprocalRankFusion({
        vectorResults: vectorScoped,
        bm25Results: bm25Scoped,
        vectorWeight: config.vector_weight,
        bm25Weight: config.bm25_weight,
        rrfK: config.rrf_k
      });

      const reranked = rerankCandidates(plan.searchQuery, fused);
      const rerankedTextChunks = reranked
        .slice(0, Math.max(config.reranker_top_k * 2, requestedTopK * 2))
        .map((candidate) => toTextChunk(candidate.result as VectorSearchResult, candidate.rerankScore));

      const visualChunks: RetrievalChunk[] = visualScoped.slice(0, config.reranker_top_k).map((result) => ({
        chunk_id: result.insight_id,
        content: result.extracted_text,
        document_id: result.document_id,
        document_name: result.document_name,
        folder_path: result.folder_path,
        page_number: result.page_number,
        section_title: `Visual ${result.asset_type.replaceAll("_", " ")}`,
        score: Number(result.score.toFixed(4)),
        citation_type: "visual",
        visual_asset_type: result.asset_type
      }));

      const mergedByScore = [...rerankedTextChunks, ...visualChunks].sort((a, b) => b.score - a.score);
      const diverse = selectDiverseChunks(
        mergedByScore,
        Math.min(config.min_final_chunks, requestedTopK),
        Math.min(config.max_final_chunks, requestedTopK)
      );

      attempts.push({
        stage: plan.stage,
        query: plan.searchQuery,
        keywordOnly: plan.keywordOnly,
        relaxMetadataFilters: plan.relaxMetadataFilters,
        relaxTargetScope: plan.relaxTargetScope,
        rawVectorCount: vectorRaw.length,
        rawBm25Count: bm25Raw.length,
        rawVisualCount: visualRaw.length,
        afterFiltersCount: diverse.length
      });

      if (diverse.length > 0) {
        const sourceMap = await getDocumentSources(Array.from(new Set(diverse.map((chunk) => chunk.document_id))));
        const chunks = diverse.map((chunk) => {
          const source = sourceMap.get(chunk.document_id);
          return {
            ...chunk,
            source_url: chunk.source_url || source?.sourceUrl,
            download_available: source?.downloadAvailable ?? chunk.download_available
          };
        });

        return {
          query: plan.searchQuery,
          chunks,
          citations: CitationEngine.build_citations(chunks),
          diagnostics: {
            attempts,
            matchedSynonymGroups: normalized.matchedGroups
          }
        };
      }
    }

    const accessibleIndexedDocuments = await countAccessibleIndexedDocuments(company_id);
    const targetScopedAccessibleDocuments = allowedFolderIds
      ? attempts[0]
        ? attempts[0].rawVectorCount + attempts[0].rawBm25Count
        : 0
      : accessibleIndexedDocuments;

    const exclusionRisk = detectFilterExclusionRisk({
      accessibleIndexedDocuments,
      targetScopedAccessibleDocuments,
      hasTargetScope: Boolean(target_app_id),
      attempts
    });

    if (exclusionRisk.targetScopeExcludedAll) {
      console.warn("[RAG] Retrieval found indexed documents but target-app scope filtered all candidates.", {
        company_id,
        target_app_id,
        accessibleIndexedDocuments,
        attempts
      });
    }

    if (exclusionRisk.likelyFilterExclusion) {
      console.warn("[RAG] Retrieval produced zero chunks despite indexed content. Check metadata filters and permission scope.", {
        company_id,
        user_id,
        accessibleIndexedDocuments,
        attempts
      });
    }

    return {
      query: normalized.normalized,
      chunks: [],
      citations: [],
      diagnostics: {
        attempts,
        matchedSynonymGroups: normalized.matchedGroups,
        filterDiagnostics: {
          accessibleIndexedDocuments,
          targetScopedAccessibleDocuments
        }
      }
    };
  }
}
