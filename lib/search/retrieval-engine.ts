import { getPool } from "@/lib/db/pool";
import { CitationEngine, type Citation } from "./citation-engine";
import { KeywordSearchService } from "./keyword-search";
import { VisualSearchService } from "./visual-search";
import { VectorSearchService, type VectorSearchResult } from "./vector-search";

export type RetrievalChunk = {
  chunk_id: string;
  content: string;
  document_id: string;
  document_name: string;
  folder_path: string;
  page_number: number;
  section_title: string;
  score: number;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
};

export type RetrievalResponse = {
  query: string;
  chunks: RetrievalChunk[];
  citations: Citation[];
};

type SearchScores = {
  result: VectorSearchResult;
  vectorScore?: number;
  keywordScore?: number;
  recencyBoost?: number;
};

async function getUserRoleIds(companyId: string, userId: string) {
  const result = await getPool().query<{ role_id: string; is_admin_role: boolean }>(
    `
      SELECT roles.id AS role_id, roles.is_admin_role
      FROM user_company_roles
      INNER JOIN roles ON roles.id = user_company_roles.role_id
      WHERE user_company_roles.user_id = $1
        AND user_company_roles.company_id = $2
        AND user_company_roles.deleted_at IS NULL
        AND user_company_roles.status = 'active'
        AND roles.deleted_at IS NULL
    `,
    [userId, companyId]
  );

  if (result.rows.some((row) => row.is_admin_role)) {
    const adminRoles = await getPool().query<{ id: string }>(
      "SELECT id FROM roles WHERE company_id = $1 AND deleted_at IS NULL",
      [companyId]
    );
    return adminRoles.rows.map((row) => row.id);
  }

  return Array.from(new Set(result.rows.map((row) => row.role_id)));
}

function normalizeScore(value: number | undefined, max: number) {
  if (!value || max <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, value / max));
}

function calculateRecencyBoost(updatedAt: Date) {
  const ageInDays = Math.max(0, (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

  if (ageInDays >= 90) {
    return 0;
  }

  return 1 - ageInDays / 90;
}

async function getDocumentRecency(documentIds: string[]) {
  if (documentIds.length === 0) {
    return new Map<string, number>();
  }

  const result = await getPool().query<{ id: string; updated_at: Date }>(
    "SELECT id, updated_at FROM documents WHERE id = ANY($1::uuid[])",
    [documentIds]
  );

  return new Map(result.rows.map((row) => [row.id, calculateRecencyBoost(row.updated_at)]));
}

export class RetrievalEngine {
  static async retrieve(company_id: string, user_id: string, query: string, top_k = 10, target_app_id?: string): Promise<RetrievalResponse> {
    const normalizedQuery = query.trim();
    const limit = Math.min(50, Math.max(1, Number(top_k) || 10));

    if (!company_id) {
      throw new Error("Company is required.");
    }

    if (!user_id) {
      throw new Error("User is required.");
    }

    if (!normalizedQuery) {
      throw new Error("Search query is required.");
    }

    const roleIds = await getUserRoleIds(company_id, user_id);

    if (roleIds.length === 0) {
      return { query: normalizedQuery, chunks: [], citations: [] };
    }

    const [vectorResults, keywordResults, visualResults] = await Promise.all([
      VectorSearchService.search(company_id, normalizedQuery, roleIds, 20, user_id),
      KeywordSearchService.search(company_id, normalizedQuery, roleIds, 20, user_id),
      VisualSearchService.search(company_id, normalizedQuery, roleIds, 20, user_id)
    ]);

    let allowedFolderIds: Set<string> | null = null;
    if (target_app_id) {
      const allowed = await getPool().query<{ id: string }>(`
        SELECT topics.id
        FROM topics
        WHERE topics.company_id = $1
          AND topics.deleted_at IS NULL
          AND (
            NOT EXISTS (
              SELECT 1 FROM folder_target_apps any_scope
              WHERE any_scope.folder_id = topics.id AND any_scope.deleted_at IS NULL
            )
            OR EXISTS (
              SELECT 1 FROM folder_target_apps app_scope
              WHERE app_scope.folder_id = topics.id
                AND app_scope.target_app_id = $2
                AND app_scope.deleted_at IS NULL
            )
          )
      `, [company_id, target_app_id]);
      allowedFolderIds = new Set(allowed.rows.map((row) => row.id));
    }

    const merged = new Map<string, SearchScores>();

    for (const result of vectorResults) {
      if (allowedFolderIds && !allowedFolderIds.has(result.folder_id)) continue;
      merged.set(result.chunk_id, {
        result,
        vectorScore: result.score
      });
    }

    for (const result of keywordResults) {
      if (allowedFolderIds && !allowedFolderIds.has(result.folder_id)) continue;
      const existing = merged.get(result.chunk_id);

      if (existing) {
        existing.keywordScore = result.score;
      } else {
        merged.set(result.chunk_id, {
          result,
          keywordScore: result.score
        });
      }
    }

    const filteredVisualResults = allowedFolderIds
      ? visualResults.filter((result) => allowedFolderIds.has(result.folder_id))
      : visualResults;

    const items = Array.from(merged.values());
    const maxVectorScore = Math.max(0, ...items.map((item) => item.vectorScore ?? 0));
    const maxKeywordScore = Math.max(0, ...items.map((item) => item.keywordScore ?? 0));
    const maxVisualScore = Math.max(0, ...filteredVisualResults.map((item) => item.score));
    const recencyByDocumentId = await getDocumentRecency(Array.from(new Set([
      ...items.map((item) => item.result.document_id),
      ...filteredVisualResults.map((item) => item.document_id)
    ])));

    const textChunks: RetrievalChunk[] = items.map((item) => {
      const recencyBoost = recencyByDocumentId.get(item.result.document_id) ?? 0;
      const score =
        normalizeScore(item.vectorScore, maxVectorScore) * 0.55
        + normalizeScore(item.keywordScore, maxKeywordScore) * 0.35
        + recencyBoost * 0.1;

      return {
        chunk_id: item.result.chunk_id,
        content: item.result.content,
        document_id: item.result.document_id,
        document_name: item.result.document_name,
        folder_path: item.result.folder_path,
        page_number: item.result.page_number,
        section_title: item.result.section_title,
        score: Number(score.toFixed(4)),
        citation_type: "text" as const
      };
    });

    const visualChunks: RetrievalChunk[] = filteredVisualResults.map((result) => {
      const recencyBoost = recencyByDocumentId.get(result.document_id) ?? 0;
      const score = normalizeScore(result.score, maxVisualScore) * 0.75 + recencyBoost * 0.25;

      return {
        chunk_id: result.insight_id,
        content: result.extracted_text,
        document_id: result.document_id,
        document_name: result.document_name,
        folder_path: result.folder_path,
        page_number: result.page_number,
        section_title: `Visual ${result.asset_type.replaceAll("_", " ")}`,
        score: Number(score.toFixed(4)),
        citation_type: "visual" as const,
        visual_asset_type: result.asset_type
      };
    });

    const chunks: RetrievalChunk[] = [...textChunks, ...visualChunks]
      .sort((first, second) => second.score - first.score)
      .slice(0, limit);

    return {
      query: normalizedQuery,
      chunks,
      citations: CitationEngine.build_citations(chunks)
    };
  }
}
