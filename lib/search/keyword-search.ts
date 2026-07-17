import { getPool } from "@/lib/db/pool";
import { documentPermissionClause, mapSearchRow, resolveDocumentNameExpression, type SearchAccessOptions, type VectorSearchResult } from "./vector-search";

export class KeywordSearchService {
  static async search(
    company_id: string,
    query: string,
    user_role_ids: string[],
    top_k = 10,
    user_id?: string,
    options?: SearchAccessOptions
  ): Promise<VectorSearchResult[]> {
    const normalizedQuery = query.trim();
    const limit = Math.min(50, Math.max(1, Number(top_k) || 10));
    const enforceAccess = options?.enforceAccess === true;

    if (!company_id) {
      throw new Error("Company is required.");
    }

    if (!normalizedQuery) {
      throw new Error("Search query is required.");
    }

    const documentNameExpression = await resolveDocumentNameExpression("documents");
    const permissionSql = enforceAccess ? documentPermissionClause(5, 4) : "";
    const params = enforceAccess
      ? [company_id, normalizedQuery, limit, user_role_ids, user_id ?? "00000000-0000-0000-0000-000000000000"]
      : [company_id, normalizedQuery, limit];

    const result = await getPool().query(
      `
        WITH search_query AS (
          SELECT websearch_to_tsquery('simple', $2) AS query
        )
        SELECT
          document_chunks.id AS chunk_id,
          document_chunks.document_id,
          ${documentNameExpression} AS document_name,
          document_chunks.folder_id,
          COALESCE(document_chunks.metadata_json ->> 'folder_path', '') AS folder_path,
          document_chunks.content,
          document_chunks.page_number,
          COALESCE(document_chunks.section_title, '') AS section_title,
          COALESCE(document_chunks.metadata_json ->> 'section_path', '') AS section_path,
          COALESCE(document_chunks.metadata_json ->> 'document_type', documents.file_type) AS document_type,
          COALESCE(document_chunks.metadata_json ->> 'country', documents.source_metadata_json ->> 'country', '') AS country,
          COALESCE(document_chunks.metadata_json ->> 'department', documents.source_metadata_json ->> 'department', '') AS department,
          COALESCE(document_chunks.metadata_json ->> 'process_stage', documents.source_metadata_json ->> 'process_stage', '') AS process_stage,
          COALESCE(document_chunks.metadata_json ->> 'effective_date', documents.source_metadata_json ->> 'effective_date', '') AS effective_date,
          COALESCE(documents.external_source_url, documents.source_metadata_json ->> 'source_url', '') AS source_url,
          document_chunks.metadata_json,
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
          ${permissionSql}
        ORDER BY score DESC, document_chunks.chunk_index ASC
        LIMIT $3
      `,
      params
    );

    return result.rows.map(mapSearchRow);
  }
}

export const BM25SearchService = KeywordSearchService;
