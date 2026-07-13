"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Clock3, Download, ExternalLink, Filter, MessageSquareText, ThumbsUp, Timer } from "lucide-react";
import { formatDateTimeForDisplay } from "@/lib/datetime";

type TargetAppOption = {
  id: string;
  name: string;
  companyId: string;
};

type SummaryResponse = {
  summary: {
    totalQueries: number;
    answeredQueries: number;
    noAnswerQueries: number;
    failedQueries: number;
    answerRate: number;
    noAnswerRate: number;
    avgLatencyMs: number;
    avgRetrievedChunks: number;
    avgCitations: number;
    totalTokens: number;
    totalEstimatedCostUsd: number;
    queriesWithFeedback: number;
    feedbackCoverageRate: number;
    positiveFeedbackRate: number;
  };
  noAnswerReasons: Array<{ reason: string; count: number }>;
};

type RawRow = {
  id: string;
  created_at: string;
  company_name: string;
  target_app_name: string;
  question: string;
  answer_status: "answered" | "no_answer" | "failed";
  no_answer_reason: string | null;
  retrieved_chunk_count: number;
  citation_count: number;
  latency_ms: number;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  llm_provider: string | null;
  llm_model: string | null;
  feedback_up: number;
  feedback_down: number;
};

type RawResponse = {
  rows: RawRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const emptySummary: SummaryResponse = {
  summary: {
    totalQueries: 0,
    answeredQueries: 0,
    noAnswerQueries: 0,
    failedQueries: 0,
    answerRate: 0,
    noAnswerRate: 0,
    avgLatencyMs: 0,
    avgRetrievedChunks: 0,
    avgCitations: 0,
    totalTokens: 0,
    totalEstimatedCostUsd: 0,
    queriesWithFeedback: 0,
    feedbackCoverageRate: 0,
    positiveFeedbackRate: 0
  },
  noAnswerReasons: []
};

const emptyRaw: RawResponse = {
  rows: [],
  pagination: {
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1
  }
};

type ExplainabilityResponse = {
  diagnostics: {
    totalQueries: number;
    avgRetrievedChunks: number;
    avgCitations: number;
    zeroChunkQueries: number;
    zeroCitationQueries: number;
    noAnswerQueries: number;
    queriesWithPathData: number;
  };
  retrievalPaths: Array<{
    id: string;
    created_at: string;
    question: string;
    answer_status: "answered" | "no_answer" | "failed";
    no_answer_reason: string | null;
    path_items: Array<{
      chunk_id?: string;
      document_id?: string;
      document_name?: string;
      folder_path?: string;
      section_title?: string;
      page_number?: number;
      score?: number;
      citation_type?: "text" | "visual";
      visual_asset_type?: string;
    }>;
  }>;
  knowledgeQuality: {
    duplicateDocuments: Array<{
      name_key: string;
      file_size: number;
      file_type: string;
      duplicate_count: number;
      sample_document_ids: string[];
    }>;
    staleDocuments: Array<{
      id: string;
      name: string;
      file_type: string;
      status: string;
      storage_mode: string;
      updated_at: string;
    }>;
    brokenSources: Array<{
      id: string;
      name: string;
      status: string;
      storage_mode: string;
      external_source_url: string | null;
      external_source_reference: string | null;
      updated_at: string;
    }>;
  };
  recommendations: string[];
};

type QueryExplainabilityDetail = {
  queryDetail: {
    id: string;
    created_at: string;
    question: string;
    answer: string;
    answer_status: "answered" | "no_answer" | "failed";
    no_answer_reason: string | null;
    retrieved_chunk_count: number;
    citation_count: number;
    latency_ms: number;
    llm_provider: string | null;
    llm_model: string | null;
    path_items: Array<{
      chunk_id?: string;
      document_id?: string;
      document_name?: string;
      folder_path?: string;
      section_title?: string;
      page_number?: number;
      score?: number;
      citation_type?: "text" | "visual";
      visual_asset_type?: string;
    }>;
  };
  recommendations: string[];
};

const emptyExplainability: ExplainabilityResponse = {
  diagnostics: {
    totalQueries: 0,
    avgRetrievedChunks: 0,
    avgCitations: 0,
    zeroChunkQueries: 0,
    zeroCitationQueries: 0,
    noAnswerQueries: 0,
    queriesWithPathData: 0
  },
  retrievalPaths: [],
  knowledgeQuality: {
    duplicateDocuments: [],
    staleDocuments: [],
    brokenSources: []
  },
  recommendations: []
};

export function SearchAnalyticsDashboard({
  selectedCompanyId = "",
  targetApps = []
}: {
  selectedCompanyId?: string;
  targetApps?: TargetAppOption[];
}) {
  const [days, setDays] = useState("30");
  const [appliedDays, setAppliedDays] = useState("30");
  const [targetAppId, setTargetAppId] = useState("all");
  const [appliedTargetAppId, setAppliedTargetAppId] = useState("all");
  const [answerStatus, setAnswerStatus] = useState("all");
  const [appliedAnswerStatus, setAppliedAnswerStatus] = useState("all");
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(25);
  const [summaryData, setSummaryData] = useState<SummaryResponse>(emptySummary);
  const [rawData, setRawData] = useState<RawResponse>(emptyRaw);
  const [explainability, setExplainability] = useState<ExplainabilityResponse>(emptyExplainability);
  const [loading, setLoading] = useState(true);
  const [rawLoading, setRawLoading] = useState(true);
  const [explainabilityLoading, setExplainabilityLoading] = useState(true);
  const [queryDetailLoading, setQueryDetailLoading] = useState(false);
  const [queryDetailError, setQueryDetailError] = useState<string | null>(null);
  const [selectedQuery, setSelectedQuery] = useState<RawRow | null>(null);
  const [queryDetail, setQueryDetail] = useState<QueryExplainabilityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const availableTargetApps = useMemo(
    () => (!selectedCompanyId ? targetApps : targetApps.filter((app) => app.companyId === selectedCompanyId)),
    [selectedCompanyId, targetApps]
  );

  useEffect(() => {
    if (targetAppId !== "all" && !availableTargetApps.some((app) => app.id === targetAppId)) {
      setTargetAppId("all");
      setAppliedTargetAppId("all");
    }
  }, [availableTargetApps, targetAppId]);

  useEffect(() => {
    setRawPage(1);
  }, [rawPageSize]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setRawLoading(true);
        setExplainabilityLoading(true);
        setError(null);

        const summaryParams = new URLSearchParams();
        summaryParams.set("days", appliedDays);
        if (selectedCompanyId) summaryParams.set("companyId", selectedCompanyId);
        if (appliedTargetAppId !== "all") summaryParams.set("targetAppId", appliedTargetAppId);
        if (appliedAnswerStatus !== "all") summaryParams.set("answerStatus", appliedAnswerStatus);

        const rawParams = new URLSearchParams(summaryParams);
        rawParams.set("view", "raw-data");
        rawParams.set("page", String(rawPage));
        rawParams.set("pageSize", String(rawPageSize));

        const explainabilityParams = new URLSearchParams(summaryParams);

        const [summaryResponse, rawResponse, explainabilityResponse] = await Promise.all([
          fetch(`/api/admin/chat-search-analytics?${summaryParams.toString()}`),
          fetch(`/api/admin/chat-search-analytics?${rawParams.toString()}`),
          fetch(`/api/admin/chat-search-analytics/explainability?${explainabilityParams.toString()}`)
        ]);

        const summaryBody = await summaryResponse.json().catch(() => null);
        const rawBody = await rawResponse.json().catch(() => null);
        const explainabilityBody = await explainabilityResponse.json().catch(() => null);

        if (!summaryResponse.ok) {
          throw new Error(summaryBody?.message || "Unable to load search analytics.");
        }

        if (!rawResponse.ok) {
          throw new Error(rawBody?.message || "Unable to load query history.");
        }

        if (!explainabilityResponse.ok) {
          throw new Error(explainabilityBody?.message || "Unable to load explainability diagnostics.");
        }

        if (!cancelled) {
          setSummaryData(summaryBody);
          setRawData(rawBody);
          setExplainability(explainabilityBody);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load search analytics.");
          setSummaryData(emptySummary);
          setRawData(emptyRaw);
          setExplainability(emptyExplainability);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRawLoading(false);
          setExplainabilityLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [appliedDays, appliedTargetAppId, appliedAnswerStatus, rawPage, rawPageSize, selectedCompanyId]);

  function applyFilters() {
    setAppliedDays(days);
    setAppliedTargetAppId(targetAppId);
    setAppliedAnswerStatus(answerStatus);
    setRawPage(1);
  }

  function exportRows(format: "csv" | "json") {
    const exportRowsData = rawData.rows.map((row) => ({
      timestamp: row.created_at,
      company: row.company_name,
      targetApp: row.target_app_name,
      question: row.question,
      status: row.answer_status,
      noAnswerReason: row.no_answer_reason || "",
      latencyMs: row.latency_ms,
      retrievedChunks: row.retrieved_chunk_count,
      citations: row.citation_count,
      tokens: row.total_tokens ?? "",
      estimatedCostUsd: row.estimated_cost_usd ?? "",
      llmProvider: row.llm_provider || "",
      llmModel: row.llm_model || "",
      feedbackUp: row.feedback_up,
      feedbackDown: row.feedback_down
    }));

    const payload = format === "json"
      ? JSON.stringify(exportRowsData, null, 2)
      : toCsv(exportRowsData);

    const blob = new Blob([payload], {
      type: format === "json" ? "application/json;charset=utf-8;" : "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `search-analytics-${appliedDays}-days.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function openExplainabilityDrillDown(row: RawRow) {
    try {
      setSelectedQuery(row);
      setQueryDetail(null);
      setQueryDetailError(null);
      setQueryDetailLoading(true);

      const detailParams = new URLSearchParams();
      detailParams.set("queryId", row.id);
      detailParams.set("days", appliedDays);
      if (selectedCompanyId) detailParams.set("companyId", selectedCompanyId);
      if (appliedTargetAppId !== "all") detailParams.set("targetAppId", appliedTargetAppId);
      if (appliedAnswerStatus !== "all") detailParams.set("answerStatus", appliedAnswerStatus);

      const response = await fetch(`/api/admin/chat-search-analytics/explainability?${detailParams.toString()}`);
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.message || "Unable to load query explainability details.");
      }

      setQueryDetail(body as QueryExplainabilityDetail);
    } catch (err) {
      setQueryDetailError(err instanceof Error ? err.message : "Unable to load query explainability details.");
    } finally {
      setQueryDetailLoading(false);
    }
  }

  function closeExplainabilityDrillDown() {
    setSelectedQuery(null);
    setQueryDetail(null);
    setQueryDetailError(null);
    setQueryDetailLoading(false);
  }

  const summary = summaryData.summary;

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <div className="grid grid-cols-1 items-end gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(180px,1fr))_auto]">
        <FilterSelect
          label="Date range"
          value={days}
          onChange={setDays}
          options={[
            { label: "Last 7 days", value: "7" },
            { label: "Last 30 days", value: "30" },
            { label: "Last 90 days", value: "90" },
            { label: "Last 365 days", value: "365" }
          ]}
        />
        <FilterSelect
          label="Target app"
          value={targetAppId}
          onChange={setTargetAppId}
          options={[
            { label: "All target apps", value: "all" },
            ...availableTargetApps.map((app) => ({ label: app.name, value: app.id }))
          ]}
        />
        <FilterSelect
          label="Answer status"
          value={answerStatus}
          onChange={setAnswerStatus}
          options={[
            { label: "All statuses", value: "all" },
            { label: "Answered", value: "answered" },
            { label: "No answer", value: "no_answer" },
            { label: "Failed", value: "failed" }
          ]}
        />
        <div className="flex min-w-0 items-end sm:col-span-2 xl:col-span-1">
          <button
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 xl:w-auto"
            onClick={applyFilters}
            type="button"
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="Total queries" value={summary.totalQueries.toLocaleString()} loading={loading} icon={<MessageSquareText className="h-4 w-4" />} />
        <Metric label="Answer rate" value={`${summary.answerRate}%`} loading={loading} icon={<BarChart3 className="h-4 w-4" />} />
        <Metric label="No-answer rate" value={`${summary.noAnswerRate}%`} loading={loading} icon={<AlertTriangle className="h-4 w-4" />} />
        <Metric label="Avg latency" value={formatDuration(summary.avgLatencyMs)} loading={loading} icon={<Clock3 className="h-4 w-4" />} />
        <Metric label="Avg chunks" value={summary.avgRetrievedChunks.toFixed(2)} loading={loading} icon={<Timer className="h-4 w-4" />} />
        <Metric label="Avg citations" value={summary.avgCitations.toFixed(2)} loading={loading} icon={<Timer className="h-4 w-4" />} />
        <Metric label="Feedback coverage" value={`${summary.feedbackCoverageRate}%`} loading={loading} icon={<ThumbsUp className="h-4 w-4" />} />
        <Metric label="Positive feedback" value={`${summary.positiveFeedbackRate}%`} loading={loading} icon={<ThumbsUp className="h-4 w-4" />} />
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">No-answer reasons</h2>
          <p className="mt-1 text-sm text-slate-500">Top reasons where retrieval could not confidently answer.</p>
          <div className="mt-3 space-y-2">
            {summaryData.noAnswerReasons.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">No no-answer reasons in this range.</p>
            ) : (
              summaryData.noAnswerReasons.map((item) => (
                <div key={item.reason} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="truncate text-sm font-medium text-slate-700">{item.reason}</p>
                  <p className="text-sm font-semibold text-slate-950">{item.count}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Cost and token trend summary</h2>
          <p className="mt-1 text-sm text-slate-500">Aggregate LLM usage for the selected slice.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Total tokens</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{summary.totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Estimated cost</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">${summary.totalEstimatedCostUsd.toFixed(4)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Answered</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{summary.answeredQueries.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">No answer</p>
              <p className="mt-2 text-xl font-semibold text-slate-950">{summary.noAnswerQueries.toLocaleString()}</p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Retrieval Diagnostics</h2>
          <p className="mt-1 text-sm text-slate-500">Explainability metrics from retrieval paths and evidence density.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Metric label="Queries with paths" value={String(explainability.diagnostics.queriesWithPathData)} loading={explainabilityLoading} icon={<BarChart3 className="h-4 w-4" />} />
            <Metric label="Zero chunk queries" value={String(explainability.diagnostics.zeroChunkQueries)} loading={explainabilityLoading} icon={<AlertTriangle className="h-4 w-4" />} />
            <Metric label="Zero citation queries" value={String(explainability.diagnostics.zeroCitationQueries)} loading={explainabilityLoading} icon={<AlertTriangle className="h-4 w-4" />} />
            <Metric label="Avg chunks" value={explainability.diagnostics.avgRetrievedChunks.toFixed(2)} loading={explainabilityLoading} icon={<Timer className="h-4 w-4" />} />
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">Retrieval Recommendations</h2>
          <p className="mt-1 text-sm text-slate-500">Actionable guidance to improve answer quality and grounding.</p>
          <div className="mt-3 space-y-2">
            {explainabilityLoading ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">Loading recommendations...</p>
            ) : explainability.recommendations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">No recommendations for this range.</p>
            ) : (
              explainability.recommendations.map((recommendation, index) => (
                <div key={`${recommendation}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                  {recommendation}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-2 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Duplicate Documents</h2>
          <p className="mt-1 text-xs text-slate-500">Potential duplicate files by normalized name + size + type.</p>
          <div className="mt-2 space-y-1.5">
            {explainability.knowledgeQuality.duplicateDocuments.length === 0 ? (
              <p className="text-sm text-slate-500">No duplicates detected.</p>
            ) : (
              explainability.knowledgeQuality.duplicateDocuments.slice(0, 5).map((item) => (
                <div key={`${item.name_key}-${item.file_size}-${item.file_type}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name_key}</p>
                  <p className="text-xs text-slate-600">{item.duplicate_count} copies • {item.file_type} • {formatBytes(item.file_size)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Stale Documents</h2>
          <p className="mt-1 text-xs text-slate-500">Documents older than 90 days without refresh.</p>
          <div className="mt-2 space-y-1.5">
            {explainability.knowledgeQuality.staleDocuments.length === 0 ? (
              <p className="text-sm text-slate-500">No stale documents detected.</p>
            ) : (
              explainability.knowledgeQuality.staleDocuments.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-600">{item.file_type} • Updated {formatDateTimeForDisplay(item.updated_at, { fallback: "-" })}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-base font-semibold text-slate-950">Broken Sources</h2>
          <p className="mt-1 text-xs text-slate-500">External references that are failed or missing source URLs.</p>
          <div className="mt-2 space-y-1.5">
            {explainability.knowledgeQuality.brokenSources.length === 0 ? (
              <p className="text-sm text-slate-500">No broken sources detected.</p>
            ) : (
              explainability.knowledgeQuality.brokenSources.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                  <p className="text-sm font-medium text-slate-800 truncate">{item.name}</p>
                  <p className="text-xs text-slate-600">{item.status} • {item.storage_mode}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">Retrieval Path Visualization</h2>
        <p className="mt-1 text-sm text-slate-500">Recent query-to-evidence paths used to construct answers.</p>
        <div className="mt-3 space-y-2">
          {explainabilityLoading ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">Loading retrieval paths...</p>
          ) : explainability.retrievalPaths.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">No retrieval paths in this range.</p>
          ) : (
            explainability.retrievalPaths.map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDateTimeForDisplay(entry.created_at, { fallback: "-" })}</span>
                  <span>•</span>
                  <span>{entry.answer_status}</span>
                  {entry.no_answer_reason ? (
                    <>
                      <span>•</span>
                      <span>{entry.no_answer_reason}</span>
                    </>
                  ) : null}
                </div>
                <p className="mt-1 text-sm font-medium text-slate-900">{entry.question}</p>
                <div className="mt-2 space-y-1.5">
                  {entry.path_items.length === 0 ? (
                    <p className="text-xs text-slate-500">No evidence path captured.</p>
                  ) : (
                    entry.path_items.map((item, index) => (
                      <div key={`${entry.id}-${item.chunk_id || index}`} className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs">
                        <p className="font-medium text-slate-800 truncate">{item.document_name || "Unknown document"}</p>
                        <p className="text-slate-600 truncate">
                          {item.folder_path || "-"} • p.{item.page_number || 1} • {item.section_title || "section"}
                        </p>
                        <p className="text-slate-500">
                          {item.citation_type || "text"}
                          {item.visual_asset_type ? ` / ${item.visual_asset_type}` : ""}
                          {typeof item.score === "number" ? ` • score ${item.score.toFixed(4)}` : ""}
                        </p>
                        {item.document_id ? (
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <a
                              className="inline-flex items-center rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=versions`}
                            >
                              Open versions
                            </a>
                            <a
                              aria-label="Open versions in new tab"
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                              href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=versions`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            <a
                              className="inline-flex items-center rounded border border-slate-300 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                              href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=compare`}
                            >
                              Open compare
                            </a>
                            <a
                              aria-label="Open compare in new tab"
                              className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-50"
                              href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=compare`}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Raw query history</h2>
            <p className="mt-1 text-sm text-slate-500">Per-query details, retrieval stats, model info, and user feedback.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("csv")} type="button">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("json")} type="button">
              <Download className="h-4 w-4" /> JSON
            </button>
          </div>
        </div>

        <div className="mt-3 min-h-0 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Target app</th>
                <th className="px-3 py-2">Latency</th>
                <th className="px-3 py-2">Chunks/Citations</th>
                <th className="px-3 py-2">Feedback</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Explain</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {rawLoading ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={9}>Loading query history...</td>
                </tr>
              ) : rawData.rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-6 text-center text-sm text-slate-500" colSpan={9}>No query telemetry in this range.</td>
                </tr>
              ) : (
                rawData.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 align-top text-xs text-slate-500">{formatDateTimeForDisplay(row.created_at, { fallback: "-" })}</td>
                    <td className="max-w-[340px] px-3 py-2 align-top">
                      <p className="line-clamp-2 font-medium text-slate-900">{row.question}</p>
                      {row.no_answer_reason ? <p className="mt-1 text-xs text-amber-700">Reason: {row.no_answer_reason}</p> : null}
                    </td>
                    <td className="px-3 py-2 align-top">{statusBadge(row.answer_status)}</td>
                    <td className="px-3 py-2 align-top text-xs">{row.target_app_name}</td>
                    <td className="px-3 py-2 align-top">{formatDuration(row.latency_ms)}</td>
                    <td className="px-3 py-2 align-top text-xs">{row.retrieved_chunk_count} / {row.citation_count}</td>
                    <td className="px-3 py-2 align-top text-xs">👍 {row.feedback_up} / 👎 {row.feedback_down}</td>
                    <td className="px-3 py-2 align-top text-xs">{row.llm_provider && row.llm_model ? `${row.llm_provider}:${row.llm_model}` : "-"}</td>
                    <td className="px-3 py-2 align-top">
                      <button
                        type="button"
                        className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          void openExplainabilityDrillDown(row);
                        }}
                      >
                        Why this answer
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing page {rawData.pagination.page} of {rawData.pagination.totalPages} ({rawData.pagination.total.toLocaleString()} total)
          </p>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold uppercase text-slate-500" htmlFor="raw-page-size">Rows</label>
            <select
              id="raw-page-size"
              value={rawPageSize}
              onChange={(event) => setRawPageSize(Number(event.target.value))}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2"
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setRawPage((current) => Math.max(1, current - 1))}
              disabled={rawData.pagination.page <= 1 || rawLoading}
            >
              Previous
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setRawPage((current) => Math.min(rawData.pagination.totalPages, current + 1))}
              disabled={rawData.pagination.page >= rawData.pagination.totalPages || rawLoading}
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {selectedQuery ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-lg border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Answer Explainability Drill-down</h2>
                <p className="text-xs text-slate-500">Query ID: {selectedQuery.id}</p>
              </div>
              <button
                type="button"
                onClick={closeExplainabilityDrillDown}
                className="inline-flex h-8 items-center rounded-md border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4">
              {queryDetailLoading ? (
                <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">Loading explainability detail...</p>
              ) : queryDetailError ? (
                <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{queryDetailError}</p>
              ) : queryDetail?.queryDetail ? (
                <>
                  <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">Question</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{queryDetail.queryDetail.question}</p>
                    <p className="mt-2 text-xs text-slate-500">Answer</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{queryDetail.queryDetail.answer || "-"}</p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs">
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <span className="font-semibold text-slate-600">Status:</span> {queryDetail.queryDetail.answer_status}
                      </div>
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <span className="font-semibold text-slate-600">Chunks/Citations:</span> {queryDetail.queryDetail.retrieved_chunk_count} / {queryDetail.queryDetail.citation_count}
                      </div>
                      <div className="rounded border border-slate-200 bg-white p-2">
                        <span className="font-semibold text-slate-600">Latency:</span> {formatDuration(queryDetail.queryDetail.latency_ms)}
                      </div>
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-slate-900">Retrieval Path</h3>
                    <div className="mt-2 space-y-2">
                      {queryDetail.queryDetail.path_items.length === 0 ? (
                        <p className="text-sm text-slate-500">No path data available for this query.</p>
                      ) : (
                        queryDetail.queryDetail.path_items.map((item, index) => (
                          <div key={`${queryDetail.queryDetail.id}-${item.chunk_id || index}`} className="rounded border border-slate-200 bg-slate-50 p-2">
                            <p className="text-sm font-medium text-slate-900 truncate">{index + 1}. {item.document_name || "Unknown document"}</p>
                            <p className="text-xs text-slate-600 truncate">{item.folder_path || "-"} • p.{item.page_number || 1} • {item.section_title || "section"}</p>
                            <p className="text-xs text-slate-500">
                              {item.citation_type || "text"}
                              {item.visual_asset_type ? ` / ${item.visual_asset_type}` : ""}
                              {typeof item.score === "number" ? ` • score ${item.score.toFixed(4)}` : ""}
                            </p>
                            {item.document_id ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                <a
                                  className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=versions`}
                                >
                                  Open versions
                                </a>
                                <a
                                  aria-label="Open versions in new tab"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                  href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=versions`}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <a
                                  className="inline-flex items-center rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                  href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=compare`}
                                >
                                  Open compare
                                </a>
                                <a
                                  aria-label="Open compare in new tab"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                  href={`/control-panel/content-structure?documentId=${encodeURIComponent(item.document_id)}&docAction=compare`}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            ) : null}
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <h3 className="text-sm font-semibold text-slate-900">Targeted Recommendations</h3>
                    <div className="mt-2 space-y-2">
                      {queryDetail.recommendations.length === 0 ? (
                        <p className="text-sm text-slate-500">No recommendations for this query.</p>
                      ) : (
                        queryDetail.recommendations.map((recommendation, index) => (
                          <div key={`${recommendation}-${index}`} className="rounded border border-slate-200 bg-slate-50 p-2 text-sm text-slate-700">
                            {recommendation}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function statusBadge(status: RawRow["answer_status"]) {
  const map: Record<RawRow["answer_status"], { label: string; className: string }> = {
    answered: { label: "Answered", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    no_answer: { label: "No answer", className: "bg-amber-100 text-amber-700 border-amber-200" },
    failed: { label: "Failed", className: "bg-red-100 text-red-700 border-red-200" }
  };

  const value = map[status];
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${value.className}`}>
      {value.label}
    </span>
  );
}

function Metric({
  icon,
  label,
  value,
  loading
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading: boolean;
}) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700">{icon}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-normal text-slate-950">{loading ? "..." : value}</p>
    </article>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs font-semibold uppercase text-slate-500">{label}</span>
      <select
        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function formatDuration(ms: number) {
  if (ms <= 0) return "0 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function toCsv(rows: Array<Record<string, string | number>>) {
  if (rows.length === 0) return "";

  const headers = Object.keys(rows[0]);
  const escapeCell = (value: string | number) => `"${String(value).replaceAll("\"", "\"\"")}"`;

  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeCell(row[header] ?? "")).join(","));
  }

  return lines.join("\n");
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
