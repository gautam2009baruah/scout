import { NextResponse } from "next/server";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";

export const runtime = "nodejs";

type PathItem = {
  chunk_id?: string;
  document_id?: string;
  document_name?: string;
  folder_path?: string;
  section_title?: string;
  page_number?: number;
  score?: number;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
};

async function requireSession() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  }

  if (!hasModuleAccess(session, MODULE_KEYS.searchAnalytics)) {
    return { response: NextResponse.json({ message: "You do not have permission to view search explainability." }, { status: 403 }) };
  }

  return { session };
}

function buildTelemetryFilter(params: {
  days: number;
  fromUtc: string;
  toUtc: string;
  companyId: string;
  targetAppId: string;
  answerStatus: string;
  session: Awaited<ReturnType<typeof getCurrentAdminSession>>;
}) {
  const sqlParams: unknown[] = [];
  let filter = "1=1";

  if (params.fromUtc) {
    sqlParams.push(params.fromUtc);
    filter += ` AND t.created_at >= $${sqlParams.length}::timestamptz`;
  }

  if (params.toUtc) {
    sqlParams.push(params.toUtc);
    filter += ` AND t.created_at <= $${sqlParams.length}::timestamptz`;
  }

  if (!params.fromUtc && !params.toUtc) {
    sqlParams.push(params.days);
    filter += ` AND t.created_at >= now() - ($${sqlParams.length}::int || ' days')::interval`;
  }

  if (!params.session?.user.isAdminRole) {
    sqlParams.push(params.session?.user.tenantId, params.session?.user.id);
    filter += ` AND (
      cta.company_id = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = cta.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }

  if (params.companyId) {
    sqlParams.push(params.companyId);
    filter += ` AND cta.company_id = $${sqlParams.length}`;
  }

  if (params.targetAppId) {
    sqlParams.push(params.targetAppId);
    filter += ` AND t.target_app_id = $${sqlParams.length}`;
  }

  if (params.answerStatus && ["answered", "no_answer", "failed"].includes(params.answerStatus)) {
    sqlParams.push(params.answerStatus);
    filter += ` AND t.answer_status = $${sqlParams.length}`;
  }

  return { filter, sqlParams };
}

function buildDocumentScopeFilter(params: {
  companyId: string;
  session: Awaited<ReturnType<typeof getCurrentAdminSession>>;
}) {
  const sqlParams: unknown[] = [];
  let filter = "d.status <> 'deleted'";

  if (!params.session?.user.isAdminRole) {
    sqlParams.push(params.session?.user.tenantId, params.session?.user.id);
    filter += ` AND (
      d.company_id = $${sqlParams.length - 1}
      OR EXISTS (
        SELECT 1 FROM user_company_roles
        WHERE user_company_roles.user_id = $${sqlParams.length}
          AND user_company_roles.company_id = d.company_id
          AND user_company_roles.deleted_at IS NULL
      )
    )`;
  }

  if (params.companyId) {
    sqlParams.push(params.companyId);
    filter += ` AND d.company_id = $${sqlParams.length}`;
  }

  return { filter, sqlParams };
}

function toPathItems(value: unknown): PathItem[] {
  if (!Array.isArray(value)) return [];

  const items: PathItem[] = [];

  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;

    const item = raw as Record<string, unknown>;
    items.push({
      chunk_id: typeof item.chunk_id === "string" ? item.chunk_id : undefined,
      document_id: typeof item.document_id === "string" ? item.document_id : undefined,
      document_name: typeof item.document_name === "string" ? item.document_name : undefined,
      folder_path: typeof item.folder_path === "string" ? item.folder_path : undefined,
      section_title: typeof item.section_title === "string" ? item.section_title : undefined,
      page_number: typeof item.page_number === "number" ? item.page_number : undefined,
      score: typeof item.score === "number" ? item.score : undefined,
      citation_type: item.citation_type === "visual" ? "visual" : item.citation_type === "text" ? "text" : undefined,
      visual_asset_type: typeof item.visual_asset_type === "string" ? item.visual_asset_type : undefined,
    });
  }

  return items;
}

export async function GET(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  const params = new URL(request.url).searchParams;
  const queryId = (params.get("queryId") || "").trim();
  const companyId = params.get("companyId") || "";
  const targetAppId = params.get("targetAppId") || "";
  const answerStatus = params.get("answerStatus") || "";
  const fromUtc = params.get("fromUtc") || "";
  const toUtc = params.get("toUtc") || "";
  const days = Math.min(365, Math.max(1, Number(params.get("days") || "30") || 30));

  const { filter: telemetryFilter, sqlParams: telemetryParams } = buildTelemetryFilter({
    days,
    fromUtc,
    toUtc,
    companyId,
    targetAppId,
    answerStatus,
    session: auth.session,
  });

  if (queryId) {
    const detailParams = [...telemetryParams, queryId];
    const detailResult = await getPool().query(
      `
        SELECT
          t.id,
          t.created_at,
          t.question,
          t.answer,
          t.answer_status,
          t.no_answer_reason,
          t.retrieved_chunk_count,
          t.citation_count,
          t.latency_ms,
          t.llm_provider,
          t.llm_model,
          COALESCE(t.metadata_json -> 'retrievalDiagnostics' -> 'chunkPaths', t.citations_json, '[]'::jsonb) AS path_items
        FROM chat_query_telemetry t
        LEFT JOIN company_target_applications cta ON cta.id = t.target_app_id
        WHERE ${telemetryFilter}
          AND t.id = $${detailParams.length}
        LIMIT 1
      `,
      detailParams
    );

    const row = detailResult.rows[0];
    if (!row) {
      return NextResponse.json({ message: "Query explainability detail not found." }, { status: 404 });
    }

    const pathItems = toPathItems(row.path_items);
    const scopedRecommendations: string[] = [];

    if (Number(row.retrieved_chunk_count ?? 0) === 0) {
      scopedRecommendations.push("No retrieval chunks were found. Verify folder permissions and broaden query synonyms.");
    }

    if (Number(row.citation_count ?? 0) === 0) {
      scopedRecommendations.push("No citations were attached. Increase retrieval depth or review evidence filtering thresholds.");
    }

    if (row.answer_status === "no_answer") {
      scopedRecommendations.push("Query ended in no-answer. Add/refresh content for this topic or improve chunk granularity.");
    }

    if (row.answer_status === "failed") {
      scopedRecommendations.push("Query failed. Review model/provider health and retry policy for this workload.");
    }

    if (pathItems.some((item) => item.citation_type === "visual")) {
      scopedRecommendations.push("Visual evidence was used. Confirm visual assets are current and correctly labeled.");
    }

    if (scopedRecommendations.length === 0) {
      scopedRecommendations.push("No major quality issues detected for this answer path.");
    }

    return NextResponse.json({
      queryDetail: {
        id: row.id,
        created_at: row.created_at,
        question: row.question,
        answer: row.answer,
        answer_status: row.answer_status,
        no_answer_reason: row.no_answer_reason,
        retrieved_chunk_count: Number(row.retrieved_chunk_count ?? 0),
        citation_count: Number(row.citation_count ?? 0),
        latency_ms: Number(row.latency_ms ?? 0),
        llm_provider: row.llm_provider,
        llm_model: row.llm_model,
        path_items: pathItems,
      },
      recommendations: scopedRecommendations,
    });
  }

  const diagnosticsResult = await getPool().query(
    `
      SELECT
        COUNT(*)::int AS total_queries,
        COALESCE(AVG(t.retrieved_chunk_count), 0)::numeric(12, 2) AS avg_retrieved_chunks,
        COALESCE(AVG(t.citation_count), 0)::numeric(12, 2) AS avg_citations,
        COUNT(*) FILTER (WHERE t.retrieved_chunk_count = 0)::int AS zero_chunk_queries,
        COUNT(*) FILTER (WHERE t.citation_count = 0)::int AS zero_citation_queries,
        COUNT(*) FILTER (WHERE t.answer_status = 'no_answer')::int AS no_answer_queries,
        COUNT(*) FILTER (
          WHERE COALESCE(jsonb_array_length(t.metadata_json -> 'retrievalDiagnostics' -> 'chunkPaths'), 0) > 0
        )::int AS queries_with_path_data
      FROM chat_query_telemetry t
      LEFT JOIN company_target_applications cta ON cta.id = t.target_app_id
      WHERE ${telemetryFilter}
    `,
    telemetryParams
  );

  const pathRowsResult = await getPool().query(
    `
      SELECT
        t.id,
        t.created_at,
        t.question,
        t.answer_status,
        t.no_answer_reason,
        COALESCE(t.metadata_json -> 'retrievalDiagnostics' -> 'chunkPaths', t.citations_json, '[]'::jsonb) AS path_items
      FROM chat_query_telemetry t
      LEFT JOIN company_target_applications cta ON cta.id = t.target_app_id
      WHERE ${telemetryFilter}
      ORDER BY t.created_at DESC
      LIMIT 20
    `,
    telemetryParams
  );

  const { filter: docsFilter, sqlParams: docsParams } = buildDocumentScopeFilter({
    companyId,
    session: auth.session,
  });

  const duplicateResult = await getPool().query(
    `
      SELECT
        lower(trim(d.name)) AS name_key,
        d.file_size,
        d.file_type,
        COUNT(*)::int AS duplicate_count,
        ARRAY_AGG(d.id::text ORDER BY d.updated_at DESC) AS sample_document_ids
      FROM documents d
      WHERE ${docsFilter}
        AND d.status <> 'deleted'
      GROUP BY lower(trim(d.name)), d.file_size, d.file_type
      HAVING COUNT(*) > 1
      ORDER BY duplicate_count DESC, name_key ASC
      LIMIT 25
    `,
    docsParams
  );

  const staleResult = await getPool().query(
    `
      SELECT
        d.id::text AS id,
        d.name,
        d.file_type,
        d.status,
        d.storage_mode,
        d.updated_at
      FROM documents d
      WHERE ${docsFilter}
        AND d.status <> 'deleted'
        AND d.updated_at < now() - interval '90 days'
      ORDER BY d.updated_at ASC
      LIMIT 50
    `,
    docsParams
  );

  const brokenSourceResult = await getPool().query(
    `
      SELECT
        d.id::text AS id,
        d.name,
        d.status,
        d.storage_mode,
        d.external_source_url,
        d.external_source_reference,
        d.updated_at
      FROM documents d
      WHERE ${docsFilter}
        AND d.status <> 'deleted'
        AND d.storage_mode <> 'managed_upload'::document_storage_mode
        AND (
          d.external_source_url IS NULL
          OR trim(d.external_source_url) = ''
          OR d.status = 'failed'
        )
      ORDER BY d.updated_at DESC
      LIMIT 50
    `,
    docsParams
  );

  const diagnostics = diagnosticsResult.rows[0] ?? {};
  const totalQueries = Number(diagnostics.total_queries ?? 0);
  const zeroChunkQueries = Number(diagnostics.zero_chunk_queries ?? 0);
  const zeroCitationQueries = Number(diagnostics.zero_citation_queries ?? 0);
  const noAnswerQueries = Number(diagnostics.no_answer_queries ?? 0);

  const recommendations: string[] = [];

  if (totalQueries > 0 && noAnswerQueries / totalQueries >= 0.2) {
    recommendations.push("No-answer rate is high. Review chunking strategy and add missing topic coverage in knowledge base.");
  }

  if (totalQueries > 0 && zeroChunkQueries / totalQueries >= 0.15) {
    recommendations.push("Many queries return zero chunks. Improve query expansion/synonyms and verify permission scopes for indexed folders.");
  }

  if (totalQueries > 0 && zeroCitationQueries / totalQueries >= 0.25) {
    recommendations.push("Citation coverage is low. Tune top_k and retrieval fusion weights to improve evidence grounding.");
  }

  if (duplicateResult.rows.length > 0) {
    recommendations.push("Potential duplicate documents detected. Merge or archive duplicates to reduce conflicting retrieval evidence.");
  }

  if (staleResult.rows.length > 0) {
    recommendations.push("Stale documents found (>90 days old). Prioritize sync/refresh for frequently queried topics.");
  }

  if (brokenSourceResult.rows.length > 0) {
    recommendations.push("Broken external sources detected. Repair URLs/references and rerun ingestion jobs.");
  }

  if (recommendations.length === 0) {
    recommendations.push("No critical retrieval-quality issues detected in the selected window.");
  }

  return NextResponse.json({
    diagnostics: {
      totalQueries,
      avgRetrievedChunks: Number(diagnostics.avg_retrieved_chunks ?? 0),
      avgCitations: Number(diagnostics.avg_citations ?? 0),
      zeroChunkQueries,
      zeroCitationQueries,
      noAnswerQueries,
      queriesWithPathData: Number(diagnostics.queries_with_path_data ?? 0),
    },
    retrievalPaths: pathRowsResult.rows.map((row) => ({
      id: row.id,
      created_at: row.created_at,
      question: row.question,
      answer_status: row.answer_status,
      no_answer_reason: row.no_answer_reason,
      path_items: toPathItems(row.path_items).slice(0, 5),
    })),
    knowledgeQuality: {
      duplicateDocuments: duplicateResult.rows.map((row) => ({
        name_key: row.name_key,
        file_size: Number(row.file_size ?? 0),
        file_type: row.file_type,
        duplicate_count: Number(row.duplicate_count ?? 0),
        sample_document_ids: Array.isArray(row.sample_document_ids) ? row.sample_document_ids.slice(0, 5) : [],
      })),
      staleDocuments: staleResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        file_type: row.file_type,
        status: row.status,
        storage_mode: row.storage_mode,
        updated_at: row.updated_at,
      })),
      brokenSources: brokenSourceResult.rows.map((row) => ({
        id: row.id,
        name: row.name,
        status: row.status,
        storage_mode: row.storage_mode,
        external_source_url: row.external_source_url,
        external_source_reference: row.external_source_reference,
        updated_at: row.updated_at,
      })),
    },
    recommendations,
  });
}
