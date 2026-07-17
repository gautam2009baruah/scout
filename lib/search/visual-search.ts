import { getPool } from "@/lib/db/pool";
import { documentPermissionClause, resolveDocumentNameExpression } from "./vector-search";

export type VisualSearchResult = {
  insight_id: string;
  asset_id: string;
  asset_type: string;
  document_id: string;
  document_name: string;
  folder_id: string;
  folder_path: string;
  page_number: number;
  extracted_text: string;
  citation_preview: string;
  score: number;
};

export class VisualSearchService {
  static async search(companyId: string, query: string, roleIds: string[], topK = 10, userId?: string): Promise<VisualSearchResult[]> {
    const normalizedQuery = query.trim();
    const limit = Math.min(50, Math.max(1, Number(topK) || 10));

    if (!companyId) {
      throw new Error("Company is required.");
    }

    if (!normalizedQuery) {
      throw new Error("Search query is required.");
    }

    if (roleIds.length === 0) {
      return [];
    }

    const documentNameExpression = await resolveDocumentNameExpression("documents");

    const result = await getPool().query(
      `
        WITH search_query AS (
          SELECT websearch_to_tsquery('simple', $2) AS query
        )
        SELECT
          document_visual_insights.id AS insight_id,
          document_visual_assets.id AS asset_id,
          document_visual_assets.asset_type,
          documents.id AS document_id,
          ${documentNameExpression} AS document_name,
          documents.folder_id,
          COALESCE(document_chunks.metadata_json ->> 'folder_path', '') AS folder_path,
          document_visual_assets.page_number,
          document_visual_insights.extracted_text,
          COALESCE(document_visual_insights.citation_preview, document_visual_insights.extracted_text) AS citation_preview,
          (
            ts_rank_cd(to_tsvector('simple', document_visual_insights.extracted_text), search_query.query)
            + CASE WHEN document_visual_insights.extracted_text ILIKE '%' || $2 || '%' THEN 0.08 ELSE 0 END
            + COALESCE(document_visual_insights.confidence::float, 0) * 0.05
          ) AS score
        FROM document_visual_insights
        INNER JOIN document_visual_assets ON document_visual_assets.id = document_visual_insights.asset_id
        INNER JOIN documents ON documents.id = document_visual_insights.document_id
        LEFT JOIN LATERAL (
          SELECT metadata_json
          FROM document_chunks
          WHERE document_chunks.document_id = documents.id
          ORDER BY chunk_index ASC
          LIMIT 1
        ) document_chunks ON TRUE
        CROSS JOIN search_query
        WHERE document_visual_insights.company_id = $1
          AND documents.status IN ('parsed', 'chunked', 'embedded', 'indexed')
          AND (
            to_tsvector('simple', document_visual_insights.extracted_text) @@ search_query.query
            OR document_visual_insights.extracted_text ILIKE '%' || $2 || '%'
          )
          ${documentPermissionClause(5, 3)}
        ORDER BY score DESC, document_visual_assets.page_number ASC
        LIMIT $4
      `,
      [companyId, normalizedQuery, roleIds, limit, userId ?? "00000000-0000-0000-0000-000000000000"]
    );

    return result.rows.map((row) => ({
      insight_id: row.insight_id,
      asset_id: row.asset_id,
      asset_type: row.asset_type,
      document_id: row.document_id,
      document_name: row.document_name,
      folder_id: row.folder_id,
      folder_path: row.folder_path,
      page_number: Number(row.page_number),
      extracted_text: row.extracted_text,
      citation_preview: row.citation_preview,
      score: Number(Number(row.score).toFixed(4))
    }));
  }
}
