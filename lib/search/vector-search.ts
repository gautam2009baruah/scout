import { getPool } from "@/lib/db/pool";
import { getEmbeddingProvider } from "@/lib/embedding/providers";

export type VectorSearchResult = {
  chunk_id: string;
  document_id: string;
  document_name: string;
  folder_id: string;
  folder_path: string;
  content: string;
  page_number: number;
  section_title: string;
  section_path?: string;
  document_type?: string;
  country?: string;
  department?: string;
  process_stage?: string;
  effective_date?: string;
  source_url?: string;
  metadata_json?: Record<string, unknown>;
  score: number;
};

export class VectorSearchService {
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

    const provider = await getEmbeddingProvider();
    const queryEmbedding = await provider.embed_text(normalizedQuery);
    const mode = await getEmbeddingColumnMode();

    return mode === "vector"
      ? searchVector(company_id, queryEmbedding, user_role_ids, provider.provider, provider.model, limit, user_id)
      : searchJson(company_id, queryEmbedding, user_role_ids, provider.provider, provider.model, limit, user_id);
  }
}

async function getEmbeddingColumnMode() {
  const result = await getPool().query<{ udt_name: string }>(
    `
      SELECT udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'chunk_embeddings'
        AND column_name = 'embedding'
    `
  );

  return result.rows[0]?.udt_name === "vector" ? "vector" : "jsonb";
}

function serializeVector(vector: number[]) {
  return `[${vector.join(",")}]`;
}

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

export function documentPermissionClause(userIdParam: number, roleIdsParam: number) {
  return `
    AND (
      (
        (
          EXISTS (
            SELECT 1 FROM document_role_permissions
            WHERE document_role_permissions.document_id = documents.id
              AND document_role_permissions.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM document_user_permissions
            WHERE document_user_permissions.document_id = documents.id
              AND document_user_permissions.deleted_at IS NULL
          )
        )
        AND (
          EXISTS (
            SELECT 1 FROM document_role_permissions
            WHERE document_role_permissions.document_id = documents.id
              AND document_role_permissions.role_id = ANY($${roleIdsParam}::uuid[])
              AND document_role_permissions.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM document_user_permissions
            WHERE document_user_permissions.document_id = documents.id
              AND document_user_permissions.user_id = $${userIdParam}
              AND document_user_permissions.deleted_at IS NULL
          )
        )
      )
      OR (
        NOT EXISTS (
          SELECT 1 FROM document_role_permissions
          WHERE document_role_permissions.document_id = documents.id
            AND document_role_permissions.deleted_at IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM document_user_permissions
          WHERE document_user_permissions.document_id = documents.id
            AND document_user_permissions.deleted_at IS NULL
        )
        AND (
          (
            NOT EXISTS (
              SELECT 1 FROM folder_document_role_permissions
              WHERE folder_document_role_permissions.folder_id = documents.folder_id
                AND folder_document_role_permissions.deleted_at IS NULL
            )
            AND NOT EXISTS (
              SELECT 1 FROM folder_document_user_permissions
              WHERE folder_document_user_permissions.folder_id = documents.folder_id
                AND folder_document_user_permissions.deleted_at IS NULL
            )
          )
          OR EXISTS (
            SELECT 1 FROM folder_document_role_permissions
            WHERE folder_document_role_permissions.folder_id = documents.folder_id
              AND folder_document_role_permissions.role_id = ANY($${roleIdsParam}::uuid[])
              AND folder_document_role_permissions.deleted_at IS NULL
          )
          OR EXISTS (
            SELECT 1 FROM folder_document_user_permissions
            WHERE folder_document_user_permissions.folder_id = documents.folder_id
              AND folder_document_user_permissions.user_id = $${userIdParam}
              AND folder_document_user_permissions.deleted_at IS NULL
          )
        )
      )
    )
  `;
}

async function searchVector(companyId: string, queryEmbedding: number[], roleIds: string[], provider: string, model: string, limit: number, userId = "00000000-0000-0000-0000-000000000000") {
  const result = await getPool().query(
    `
      SELECT
        document_chunks.id AS chunk_id,
        document_chunks.document_id,
        documents.name AS document_name,
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
        1 - (chunk_embeddings.embedding <=> $2::vector) AS score
      FROM chunk_embeddings
      INNER JOIN document_chunks ON document_chunks.id = chunk_embeddings.chunk_id
      INNER JOIN documents ON documents.id = document_chunks.document_id
      WHERE chunk_embeddings.company_id = $1
        AND chunk_embeddings.embedding_model = $4
        AND chunk_embeddings.embedding_provider = $6
        AND documents.status IN ('embedded', 'indexed')
        ${documentPermissionClause(7, 3)}
      ORDER BY chunk_embeddings.embedding <=> $2::vector
      LIMIT $5
    `,
    [companyId, serializeVector(queryEmbedding), roleIds, model, limit, provider, userId]
  );

  return result.rows.map(mapSearchRow);
}

async function searchJson(companyId: string, queryEmbedding: number[], roleIds: string[], provider: string, model: string, limit: number, userId = "00000000-0000-0000-0000-000000000000") {
  const result = await getPool().query(
    `
      SELECT
        document_chunks.id AS chunk_id,
        document_chunks.document_id,
        documents.name AS document_name,
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
        chunk_embeddings.embedding
      FROM chunk_embeddings
      INNER JOIN document_chunks ON document_chunks.id = chunk_embeddings.chunk_id
      INNER JOIN documents ON documents.id = document_chunks.document_id
      WHERE chunk_embeddings.company_id = $1
        AND chunk_embeddings.embedding_model = $3
        AND chunk_embeddings.embedding_provider = $5
        AND documents.status IN ('embedded', 'indexed')
        ${documentPermissionClause(4, 2)}
    `,
    [companyId, roleIds, model, userId, provider]
  );

  return result.rows
    .map((row) => ({
      ...mapSearchRow({ ...row, score: cosineSimilarity(queryEmbedding, row.embedding) })
    }))
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);
}

export function mapSearchRow(row: {
  chunk_id: string;
  document_id: string;
  document_name: string;
  folder_id: string;
  folder_path: string;
  content: string;
  page_number: number;
  section_title?: string | null;
  section_path?: string | null;
  document_type?: string | null;
  country?: string | null;
  department?: string | null;
  process_stage?: string | null;
  effective_date?: string | null;
  source_url?: string | null;
  metadata_json?: Record<string, unknown> | null;
  score: string | number;
}): VectorSearchResult {
  return {
    chunk_id: row.chunk_id,
    document_id: row.document_id,
    document_name: row.document_name,
    folder_id: row.folder_id,
    folder_path: row.folder_path,
    content: row.content,
    page_number: Number(row.page_number),
    section_title: row.section_title ?? "",
    section_path: row.section_path || undefined,
    document_type: row.document_type || undefined,
    country: row.country || undefined,
    department: row.department || undefined,
    process_stage: row.process_stage || undefined,
    effective_date: row.effective_date || undefined,
    source_url: row.source_url || undefined,
    metadata_json: row.metadata_json ?? {},
    score: Number(Number(row.score).toFixed(4))
  };
}

export async function getSearchRoleIds(companyId: string, userId: string, primaryRoleId: string, isAdminRole: boolean) {
  if (isAdminRole) {
    const result = await getPool().query<{ id: string }>(
      "SELECT id FROM roles WHERE company_id = $1 AND deleted_at IS NULL",
      [companyId]
    );
    return result.rows.map((row) => row.id);
  }

  const result = await getPool().query<{ role_id: string }>(
    `
      SELECT role_id
      FROM users
      WHERE id = $1
        AND company_id = $2
        AND deleted_at IS NULL
      UNION
      SELECT role_id
      FROM user_company_roles
      WHERE user_id = $1
        AND company_id = $2
        AND deleted_at IS NULL
    `,
    [userId, companyId]
  );

  const roleIds = new Set(result.rows.map((row) => row.role_id));

  if (companyId && roleIds.size === 0) {
    roleIds.add(primaryRoleId);
  }

  return Array.from(roleIds);
}
