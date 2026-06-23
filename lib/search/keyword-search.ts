import { getPool } from "@/lib/db/pool";
import { documentPermissionClause, mapSearchRow, type VectorSearchResult } from "./vector-search";

export class KeywordSearchService {
  static async search(company_id: string, query: string, user_role_ids: string[], top_k = 10, user_id?: string): Promise<VectorSearchResult[]> {
    const normalizedQuery = query.trim();
    const limit = Math.min(50, Math.max(1, Number(top_k) || 10));

    if (!company_id) {
      throw new Error("Company is required.");
    }

    if (!normalizedQuery) {
      throw new Error("Search query is required.");
    }

    if (user_role_ids.length === 0) {
      return [];
    }

    const result = await getPool().query(
      `
        WITH search_query AS (
          SELECT websearch_to_tsquery('simple', $2) AS query
        )
        SELECT
          document_chunks.id AS chunk_id,
          document_chunks.document_id,
          documents.name AS document_name,
          document_chunks.folder_id,
          COALESCE(document_chunks.metadata_json ->> 'folder_path', '') AS folder_path,
          document_chunks.content,
          document_chunks.page_number,
          COALESCE(document_chunks.section_title, '') AS section_title,
          (
            ts_rank_cd(to_tsvector('simple', document_chunks.content), search_query.query)
            + CASE WHEN document_chunks.content ILIKE '%' || $2 || '%' THEN 0.05 ELSE 0 END
          ) AS score
        FROM document_chunks
        INNER JOIN documents ON documents.id = document_chunks.document_id
        CROSS JOIN search_query
        WHERE document_chunks.company_id = $1
          AND documents.status IN ('chunked', 'embedded', 'indexed')
          AND (
            to_tsvector('simple', document_chunks.content) @@ search_query.query
            OR document_chunks.content ILIKE '%' || $2 || '%'
          )
          ${documentPermissionClause(5, 3)}
        ORDER BY score DESC, document_chunks.chunk_index ASC
        LIMIT $4
      `,
      [company_id, normalizedQuery, user_role_ids, limit, user_id ?? "00000000-0000-0000-0000-000000000000"]
    );

    return result.rows.map(mapSearchRow);
  }
}
