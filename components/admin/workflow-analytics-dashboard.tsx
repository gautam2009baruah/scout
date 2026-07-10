"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Bot, ChevronLeft, ChevronRight, Clock, Download, HeartPulse, ListFilter, RotateCcw, TimerReset, TrendingUp } from "lucide-react";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowTargetAppRow } from "@/lib/admin/guided-workflows";

type AnalyticsResponse = {
  summary: {
    totalExecutions: number;
    successRate: number;
    failedExecutions: number;
    abandonedWorkflows: number;
    averageCompletionTimeMs: number;
    executionsWithHealing: number;
    aiUsageCount: number;
    healingAttempts: number;
    healingSuccesses: number;
    estimatedTimeSavedMs: number;
  };
  failedSteps: Array<{ step_id: string; step_order: number; failures: number }>;
  mostHealedControls: Array<{ step_id: string; healed_count: number }>;
};

type RawAnalyticsRow = {
  id: string;
  workflow_execution_id: string;
  company_name: string;
  target_app_name: string;
  session_title: string;
  topic_title: string;
  workflow_title: string;
  step_order: number | null;
  step_description: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  status: string;
  user_id: string;
  error_message: string | null;
  healing_used: boolean;
  ai_used: boolean;
};

type RawAnalyticsResponse = {
  rows: RawAnalyticsRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

const emptyData: AnalyticsResponse = {
  summary: {
    totalExecutions: 0,
    successRate: 0,
    failedExecutions: 0,
    abandonedWorkflows: 0,
    averageCompletionTimeMs: 0,
    executionsWithHealing: 0,
    aiUsageCount: 0,
    healingAttempts: 0,
    healingSuccesses: 0,
    estimatedTimeSavedMs: 0,
  },
  failedSteps: [],
  mostHealedControls: [],
};

const emptyRawData: RawAnalyticsResponse = {
  rows: [],
  pagination: {
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  },
};

export function WorkflowAnalyticsDashboard({ selectedCompanyId = "", targetApps = [], recordingSessions = [] }: {
  selectedCompanyId?: string;
  targetApps?: GuidedWorkflowTargetAppRow[];
  recordingSessions?: GuidedWorkflowRecordingSessionRow[];
}) {
  const [days, setDays] = useState("30");
  const [appliedDays, setAppliedDays] = useState("30");
  const [filters, setFilters] = useState({
    targetAppId: "",
    sessionId: "",
    topicId: "all"
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [data, setData] = useState<AnalyticsResponse>(emptyData);
  const [rawData, setRawData] = useState<RawAnalyticsResponse>(emptyRawData);
  const [loading, setLoading] = useState(true);
  const [rawLoading, setRawLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawError, setRawError] = useState("");
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(25);

  const filteredTargetApps = useMemo(
    () => targetApps.filter((app) => !selectedCompanyId || app.companyId === selectedCompanyId),
    [selectedCompanyId, targetApps]
  );
  const filteredRecordingSessions = useMemo(
    () => recordingSessions.filter((session) => {
      const matchesCompany = !selectedCompanyId || session.companyId === selectedCompanyId;
      const matchesTargetApp = !filters.targetAppId || session.targetAppId === filters.targetAppId;
      return matchesCompany && matchesTargetApp;
    }),
    [selectedCompanyId, filters.targetAppId, recordingSessions]
  );
  const filteredTopics = useMemo(
    () => filteredRecordingSessions
      .filter((session) => !filters.sessionId || session.id === filters.sessionId)
      .flatMap((session) => session.topics.map((topic) => ({ ...topic, sessionId: session.id }))),
    [filteredRecordingSessions, filters.sessionId]
  );

  useEffect(() => {
    setFilters((current) => {
      const nextTargetAppId = current.targetAppId && filteredTargetApps.some((app) => app.id === current.targetAppId) ? current.targetAppId : "";
      const nextSessionId = current.sessionId && filteredRecordingSessions.some((session) => session.id === current.sessionId) ? current.sessionId : "";
      const nextTopicId = current.topicId === "all" || filteredTopics.some((topic) => topic.id === current.topicId) ? current.topicId : "all";
      if (nextTargetAppId === current.targetAppId && nextSessionId === current.sessionId && nextTopicId === current.topicId) return current;
      return { ...current, targetAppId: nextTargetAppId, sessionId: nextSessionId, topicId: nextTopicId };
    });
  }, [filteredRecordingSessions, filteredTargetApps, filteredTopics]);

  useEffect(() => {
    setFilters({ targetAppId: "", sessionId: "", topicId: "all" });
    setAppliedFilters({ targetAppId: "", sessionId: "", topicId: "all" });
    setRawPage(1);
  }, [selectedCompanyId]);

  function buildQueryString(includeRawParams = false) {
    const params = new URLSearchParams();
    params.set("days", appliedDays);
    if (selectedCompanyId) params.set("companyId", selectedCompanyId);
    if (appliedFilters.targetAppId) params.set("targetAppId", appliedFilters.targetAppId);
    if (appliedFilters.sessionId) params.set("sessionId", appliedFilters.sessionId);
    if (appliedFilters.topicId && appliedFilters.topicId !== "all") params.set("topicId", appliedFilters.topicId);
    if (includeRawParams) {
      params.set("view", "raw-data");
      params.set("page", String(rawPage));
      params.set("pageSize", String(rawPageSize));
    }
    return params.toString();
  }

  function applyFilters() {
    setAppliedDays(days);
    setAppliedFilters(filters);
    setRawPage(1);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setRawLoading(true);
        setError("");
        setRawError("");

        const [summaryResponse, rawResponse] = await Promise.all([
          fetch(`/api/admin/guided-workflow-analytics?${buildQueryString(false)}`),
          fetch(`/api/admin/guided-workflow-analytics?${buildQueryString(true)}`),
        ]);

        const summaryBody = await summaryResponse.json().catch(() => null);
        const rawBody = await rawResponse.json().catch(() => null);

        if (!summaryResponse.ok) throw new Error(summaryBody?.message || "Unable to load analytics.");
        if (!rawResponse.ok) throw new Error(rawBody?.message || "Unable to load raw analytics data.");

        if (!cancelled) {
          setData(summaryBody);
          setRawData(rawBody);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load analytics.");
          setRawError(err instanceof Error ? err.message : "Unable to load raw analytics data.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRawLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [appliedDays, appliedFilters.targetAppId, appliedFilters.sessionId, appliedFilters.topicId, rawPage, rawPageSize, selectedCompanyId]);

  const summary = data.summary;

  function exportRows(format: "csv" | "json") {
    const rows = rawData.rows.map((row) => ({
      company: row.company_name,
      targetApp: row.target_app_name,
      session: row.session_title,
      topic: row.topic_title,
      workflow: row.workflow_title,
      stepNumber: row.step_order ?? "",
      stepDescription: row.step_description,
      stepStarted: row.started_at,
      stepCompleted: row.completed_at || "",
      durationMs: row.duration_ms ?? "",
      status: row.status,
      userId: row.user_id || "pending",
      error: row.error_message || "",
      healingUsed: row.healing_used ? "yes" : "no",
      aiUsed: row.ai_used ? "yes" : "no",
    }));

    const content = format === "csv"
      ? toCsv(rows)
      : JSON.stringify(rows, null, 2);

    const blob = new Blob([content], { type: format === "csv" ? "text/csv;charset=utf-8;" : "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `workflow-analytics-${appliedDays}-days.${format}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
      <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
        <FilterSelect
          label="Date range"
          onChange={(days) => setDays(days)}
          value={days}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last 365 days</option>
        </FilterSelect>
        <FilterSelect
          label="Target app"
          onChange={(targetAppId) => setFilters((current) => ({ ...current, targetAppId, sessionId: "", topicId: "all" }))}
          value={filters.targetAppId}
        >
          <option value="">All target apps</option>
          {filteredTargetApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
        </FilterSelect>
        <FilterSelect
          label="Training session"
          onChange={(sessionId) => setFilters((current) => ({ ...current, sessionId, topicId: "all" }))}
          value={filters.sessionId}
        >
          <option value="">All training sessions</option>
          {filteredRecordingSessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
        </FilterSelect>
        <FilterSelect
          label="Topic"
          onChange={(topicId) => setFilters((current) => ({ ...current, topicId }))}
          value={filters.topicId}
        >
          <option value="all">All topics</option>
          {filteredTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
        </FilterSelect>
        <div className="flex items-end">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            onClick={applyFilters}
            type="button"
          >
            <ListFilter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Activity className="h-4 w-4" />} label="Total executions" loading={loading} value={summary.totalExecutions.toLocaleString()} />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Success rate" loading={loading} value={`${summary.successRate}%`} />
        <Metric icon={<Clock className="h-4 w-4" />} label="Avg completion time" loading={loading} value={formatDuration(summary.averageCompletionTimeMs)} />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Abandoned workflows" loading={loading} value={summary.abandonedWorkflows.toLocaleString()} />
        <Metric icon={<HeartPulse className="h-4 w-4" />} label="Failed executions" loading={loading} value={summary.failedExecutions.toLocaleString()} />
        <Metric icon={<RotateCcw className="h-4 w-4" />} label="Healing successes" loading={loading} value={`${summary.healingSuccesses.toLocaleString()} / ${summary.healingAttempts.toLocaleString()}`} />
        <Metric icon={<Bot className="h-4 w-4" />} label="AI usage count" loading={loading} value={summary.aiUsageCount.toLocaleString()} />
        <Metric icon={<TimerReset className="h-4 w-4" />} label="Estimated time saved" loading={loading} value={formatDuration(summary.estimatedTimeSavedMs)} />
      </div>

      <div className="grid gap-2 xl:grid-cols-2">
        <AnalyticsList emptyText="No failed steps in this range." items={data.failedSteps.map((item) => ({ label: `Step ${item.step_order || item.step_id}`, value: `${item.failures} failures` }))} title="Failed steps" />
        <AnalyticsList emptyText="No healed controls in this range." items={data.mostHealedControls.map((item) => ({ label: item.step_id || "Unknown step", value: `${item.healed_count} healed` }))} title="Most healed controls" />
      </div>

      <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Raw analytics data</h2>
            <p className="mt-1 text-sm text-slate-500">Step execution history with all related context.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("csv")} type="button">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("json")} type="button">
              <Download className="h-4 w-4" /> JSON
            </button>
          </div>
        </div>

        {rawError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rawError}</p> : null}

        <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="whitespace-nowrap px-3 py-2">Company</th>
                <th className="whitespace-nowrap px-3 py-2">Target App</th>
                <th className="whitespace-nowrap px-3 py-2">Session</th>
                <th className="whitespace-nowrap px-3 py-2">Topic</th>
                <th className="whitespace-nowrap px-3 py-2">Workflow</th>
                <th className="whitespace-nowrap px-3 py-2">Step #</th>
                <th className="whitespace-nowrap px-3 py-2">Step Description</th>
                <th className="whitespace-nowrap px-3 py-2">Started</th>
                <th className="whitespace-nowrap px-3 py-2">Completed</th>
                <th className="whitespace-nowrap px-3 py-2">Duration</th>
                <th className="whitespace-nowrap px-3 py-2">Status</th>
                <th className="whitespace-nowrap px-3 py-2">User ID</th>
                <th className="whitespace-nowrap px-3 py-2">Error</th>
                <th className="whitespace-nowrap px-3 py-2">Healing</th>
                <th className="whitespace-nowrap px-3 py-2">AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawLoading ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={15}>Loading analytics data...</td></tr>
              ) : rawData.rows.length === 0 ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={15}>No step executions found for this time range.</td></tr>
              ) : rawData.rows.map((row) => (
                <tr className="align-top hover:bg-slate-50" key={row.id}>
                  <td className="px-3 py-3 text-slate-700">{row.company_name}</td>
                  <td className="px-3 py-3 text-slate-700">{row.target_app_name}</td>
                  <td className="px-3 py-3 text-slate-700">{row.session_title}</td>
                  <td className="px-3 py-3 text-slate-700">{row.topic_title}</td>
                  <td className="max-w-[200px] px-3 py-3 truncate font-medium text-slate-900">{row.workflow_title}</td>
                  <td className="px-3 py-3 text-slate-700">{row.step_order ?? "—"}</td>
                  <td className="max-w-[250px] px-3 py-3 truncate text-slate-700">{row.step_description || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDateTimeUTC(row.started_at)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{row.completed_at ? formatDateTimeUTC(row.completed_at) : "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{formatDuration(row.duration_ms)}</td>
                  <td className="px-3 py-3"><StatusBadge status={row.status} /></td>
                  <td className="px-3 py-3 text-slate-700">{row.user_id}</td>
                  <td className="max-w-[200px] px-3 py-3 truncate text-xs text-slate-600">{row.error_message || "—"}</td>
                  <td className="px-3 py-3 text-center">{row.healing_used ? "✓" : "—"}</td>
                  <td className="px-3 py-3 text-center">{row.ai_used ? "✓" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold">
              Page size:
              <select className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-sm" onChange={(event) => {
                setRawPageSize(Number(event.target.value));
                setRawPage(1);
              }} value={rawPageSize}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
            <span>|</span>
            <p>Showing {rawData.rows.length} of {rawData.pagination.total} records</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white disabled:cursor-not-allowed disabled:opacity-50" disabled={rawData.pagination.page <= 1} onClick={() => setRawPage((current) => Math.max(1, current - 1))} type="button">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700">Page {rawData.pagination.page} of {rawData.pagination.totalPages}</span>
            <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white disabled:cursor-not-allowed disabled:opacity-50" disabled={rawData.pagination.page >= rawData.pagination.totalPages} onClick={() => setRawPage((current) => current + 1)} type="button">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({ children, label, onChange, value }: { children: React.ReactNode; label: string; onChange(value: string): void; value: string }) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-slate-600">
      {label}
      <select
        className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
    </label>
  );
}

function Metric({ icon, label, loading, value }: { icon: React.ReactNode; label: string; loading: boolean; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{icon}{label}</div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{loading ? "..." : value}</p>
    </div>
  );
}

function AnalyticsList({ emptyText, items, title }: { emptyText: string; items: Array<{ label: string; value: string }>; title: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <div className="mt-3 grid gap-2">
        {items.length === 0 ? <p className="text-sm text-slate-500">{emptyText}</p> : items.map((item) => (
          <div className="flex items-center justify-between gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm" key={`${item.label}-${item.value}`}>
            <span className="truncate text-slate-700">{item.label}</span>
            <span className="font-semibold text-slate-950">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(ms: number | null) {
  if (!ms) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatDateTimeUTC(value: string) {
  const date = new Date(value);
  const formatted = date.toUTCString().replace("GMT", "").trim();
  return `${formatted.slice(0, -9)} (UTC)`;
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    completed: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
    started: "bg-blue-100 text-blue-800",
    abandoned: "bg-amber-100 text-amber-800",
  };
  const color = colors[status as keyof typeof colors] || "bg-slate-100 text-slate-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{status}</span>;
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["company", "targetApp", "session", "topic", "workflow", "stepNumber", "stepDescription", "stepStarted", "stepCompleted", "durationMs", "status", "userId", "error", "healingUsed", "aiUsed"];
  const escapeValue = (value: unknown) => {
    const text = value == null ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => escapeValue(row[header])).join(","));
  }
  return lines.join("\n");
}
