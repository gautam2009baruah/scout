"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, ChevronLeft, ChevronRight, Clock, Download, HeartPulse, RotateCcw, TimerReset, TrendingUp } from "lucide-react";

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
  step_execution_id: string | null;
  step_id: string | null;
  action_type: string | null;
  event_type: string;
  status: string | null;
  duration_ms: number | null;
  error_message: string | null;
  healing_used: boolean;
  ai_used: boolean;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  execution_status: string | null;
  user_id: string;
  workflow_id: string;
  workflow_title: string;
  workflow_version: number | null;
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

export function WorkflowAnalyticsDashboard() {
  const [days, setDays] = useState("30");
  const [appliedDays, setAppliedDays] = useState("30");
  const [data, setData] = useState<AnalyticsResponse>(emptyData);
  const [rawData, setRawData] = useState<RawAnalyticsResponse>(emptyRawData);
  const [loading, setLoading] = useState(true);
  const [rawLoading, setRawLoading] = useState(true);
  const [error, setError] = useState("");
  const [rawError, setRawError] = useState("");
  const [rawPage, setRawPage] = useState(1);
  const [rawPageSize, setRawPageSize] = useState(25);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setRawLoading(true);
        setError("");
        setRawError("");

        const [summaryResponse, rawResponse] = await Promise.all([
          fetch(`/api/admin/guided-workflow-analytics?days=${appliedDays}`),
          fetch(`/api/admin/guided-workflow-analytics?days=${appliedDays}&view=raw-data&page=${rawPage}&pageSize=${rawPageSize}`),
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
  }, [appliedDays, rawPage, rawPageSize]);

  const summary = data.summary;

  function exportRows(format: "csv" | "json") {
    const rows = rawData.rows.map((row) => ({
      timestamp: row.created_at,
      workflow: row.workflow_title || row.workflow_id,
      workflowId: row.workflow_id,
      step: row.step_id || "-",
      event: row.event_type,
      status: row.status || row.execution_status || "-",
      userId: row.user_id || "pending",
      durationMs: row.duration_ms ?? "",
      healingUsed: row.healing_used ? "yes" : "no",
      aiUsed: row.ai_used ? "yes" : "no",
      errorMessage: row.error_message || "",
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
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-sm text-slate-500">Aggregated from stored workflow execution, step execution, and analytics event rows.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            Date range
            <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" onChange={(event) => setDays(event.target.value)} value={days}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 365 days</option>
            </select>
          </label>
          <button className="h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={() => {
            setAppliedDays(days);
            setRawPage(1);
          }} type="button">Filter</button>
        </div>
      </div>

      {error ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Activity className="h-4 w-4" />} label="Total executions" loading={loading} value={summary.totalExecutions.toLocaleString()} />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Success rate" loading={loading} value={`${summary.successRate}%`} />
        <Metric icon={<Clock className="h-4 w-4" />} label="Avg completion time" loading={loading} value={formatDuration(summary.averageCompletionTimeMs)} />
        <Metric icon={<AlertTriangle className="h-4 w-4" />} label="Abandoned workflows" loading={loading} value={summary.abandonedWorkflows.toLocaleString()} />
        <Metric icon={<HeartPulse className="h-4 w-4" />} label="Failed executions" loading={loading} value={summary.failedExecutions.toLocaleString()} />
        <Metric icon={<RotateCcw className="h-4 w-4" />} label="Healing successes" loading={loading} value={`${summary.healingSuccesses.toLocaleString()} / ${summary.healingAttempts.toLocaleString()}`} />
        <Metric icon={<Bot className="h-4 w-4" />} label="AI usage count" loading={loading} value={summary.aiUsageCount.toLocaleString()} />
        <Metric icon={<TimerReset className="h-4 w-4" />} label="Estimated time saved" loading={loading} value={formatDuration(summary.estimatedTimeSavedMs)} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AnalyticsList emptyText="No failed steps in this range." items={data.failedSteps.map((item) => ({ label: `Step ${item.step_order || item.step_id}`, value: `${item.failures} failures` }))} title="Failed steps" />
        <AnalyticsList emptyText="No healed controls in this range." items={data.mostHealedControls.map((item) => ({ label: item.step_id || "Unknown step", value: `${item.healed_count} healed` }))} title="Most healed controls" />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Raw analytics data</h2>
            <p className="mt-1 text-sm text-slate-500">This table is paginated and uses the same date-range filter as the dashboard summary.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-600">
              Page size
              <select className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900" onChange={(event) => {
                setRawPageSize(Number(event.target.value));
                setRawPage(1);
              }} value={rawPageSize}>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </label>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("csv")} type="button">
              <Download className="h-4 w-4" /> CSV
            </button>
            <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700" onClick={() => exportRows("json")} type="button">
              <Download className="h-4 w-4" /> JSON
            </button>
          </div>
        </div>

        {rawError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rawError}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Timestamp</th>
                <th className="px-3 py-2">Workflow</th>
                <th className="px-3 py-2">Step</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">User ID</th>
                <th className="px-3 py-2">Duration</th>
                <th className="px-3 py-2">Healing / AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rawLoading ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>Loading raw analytics data...</td></tr>
              ) : rawData.rows.length === 0 ? (
                <tr><td className="px-3 py-4 text-sm text-slate-500" colSpan={8}>No analytics events found for this time range.</td></tr>
              ) : rawData.rows.map((row) => (
                <tr className="align-top" key={row.id}>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-700">{formatDateTime(row.created_at)}</td>
                  <td className="max-w-[220px] px-3 py-3">
                    <div className="truncate font-medium text-slate-900">{row.workflow_title || row.workflow_id}</div>
                    <div className="truncate text-xs text-slate-500">{row.workflow_id}</div>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{row.step_id || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.event_type}</td>
                  <td className="px-3 py-3 text-slate-700">{row.status || row.execution_status || "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.user_id || "pending"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.duration_ms != null ? `${row.duration_ms}ms` : "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{row.healing_used ? "Healing" : "—"}{row.healing_used && row.ai_used ? " / " : ""}{row.ai_used ? "AI" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 text-sm text-slate-500">
          <p>Showing {rawData.rows.length} of {rawData.pagination.total} records</p>
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

function Metric({ icon, label, loading, value }: { icon: React.ReactNode; label: string; loading: boolean; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">{icon}{label}</div>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{loading ? "..." : value}</p>
    </div>
  );
}

function AnalyticsList({ emptyText, items, title }: { emptyText: string; items: Array<{ label: string; value: string }>; title: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
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

function formatDuration(ms: number) {
  if (!ms) return "0s";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = ["timestamp", "workflow", "workflowId", "step", "event", "status", "userId", "durationMs", "healingUsed", "aiUsed", "errorMessage"];
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
