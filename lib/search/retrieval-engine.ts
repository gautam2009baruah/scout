import { getPool } from "@/lib/db/pool";
import { CitationEngine, type Citation } from "./citation-engine";
import { KeywordSearchService } from "./keyword-search";
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
  static async retrieve(company_id: string, user_id: string, query: string, top_k = 10): Promise<RetrievalResponse> {
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

    const [vectorResults, keywordResults] = await Promise.all([
      VectorSearchService.search(company_id, normalizedQuery, roleIds, 20, user_id),
      KeywordSearchService.search(company_id, normalizedQuery, roleIds, 20, user_id)
    ]);

    const merged = new Map<string, SearchScores>();

    for (const result of vectorResults) {
      merged.set(result.chunk_id, {
        result,
        vectorScore: result.score
      });
    }

    for (const result of keywordResults) {
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

    const items = Array.from(merged.values());
    const maxVectorScore = Math.max(0, ...items.map((item) => item.vectorScore ?? 0));
    const maxKeywordScore = Math.max(0, ...items.map((item) => item.keywordScore ?? 0));
    const recencyByDocumentId = await getDocumentRecency(Array.from(new Set(items.map((item) => item.result.document_id))));

    const chunks = items
      .map((item) => {
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
          score: Number(score.toFixed(4))
        };
      })
      .sort((first, second) => second.score - first.score)
      .slice(0, limit);

    return {
      query: normalizedQuery,
      chunks,
      citations: CitationEngine.build_citations(chunks)
    };
  }
}
