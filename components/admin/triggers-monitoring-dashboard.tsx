/**
 * Triggers Monitoring Dashboard
 * View all active triggers, their status, and paginated execution history.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Play,
  Clock,
  Mail,
  Calendar,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { TRIGGER_TYPE_LABELS } from "@/shared/orchestrationTypes";

type TargetAppOption = { id: string; name: string; companyId: string };

// Only automated trigger types are meaningful to monitor here.
const MONITORABLE_TRIGGER_TYPES = ["email", "schedule"] as const;

type TriggerStatus = {
  id: string;
  orchestrationId: string;
  orchestrationName: string;
  orchestrationStatus: string;
  triggerType: string;
  isActive: boolean;
  companyId: string | null;
  targetAppId: string | null;
  targetAppName: string | null;
  lastTriggeredAt: string | null;
  lastPolledAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Schedule-specific
  scheduleTimezone: string;
  scheduleNextRun: string | null;
  scheduleLastRun: string | null;
  scheduleExecutionCount: number;
  scheduleErrorCount: number;
  scheduleLastError: string | null;
  // Email-specific (respecting the date range)
  emailLastFound: string | null;
  emailLastRan: string | null;
  emailMessageCount: number;
};

type ExecutionRow = {
  id: string;
  status: string;
  executionStatus: string | null;
  triggeredAt: string;
  triggeredBy: string | null;
  errorMessage: string | null;
  emailSubject: string | null;
  emailFrom: string | null;
};

type ExecutionsState = {
  loading: boolean;
  rows: ExecutionRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type NodeStep = {
  id: string;
  nodeLabel: string;
  nodeType: string;
  status: string;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
};

type ExecutionDetail = {
  id: string;
  executionId: string | null;
  status: string;
  payload: unknown;
  errorMessage: string | null;
  triggeredAt: string;
  triggeredBy: string | null;
  executionStatus: string | null;
  executionStartedAt: string | null;
  executionCompletedAt: string | null;
  email: {
    messageId: string;
    provider: string;
    mailbox: string;
    fromAddress: string;
    toAddress: string;
    subject: string;
    bodyText: string | null;
    bodyHtml: string | null;
    attachments: unknown;
    receivedAt: string | null;
    processedAt: string | null;
    status: string;
    errorMessage: string | null;
  } | null;
};

const PAGE_SIZE_OPTIONS = [25, 50, 100];

// Interpret a datetime-local value (YYYY-MM-DDTHH:mm) as UTC and return ISO 8601.
function localInputToUtcIso(value: string): string | undefined {
  if (!value) return undefined;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  return `${withSeconds}Z`;
}

// Format a Date as a UTC datetime-local string (YYYY-MM-DDTHH:mm) for the inputs.
function toUtcInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
  );
}

// Defaults: start of today (UTC) -> now (UTC)
function defaultDateRange(): { from: string; to: string } {
  const now = new Date();
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)
  );
  return { from: toUtcInputValue(startOfTodayUtc), to: toUtcInputValue(now) };
}

function formatDateTime(dateStr: string | null) {
  if (!dateStr) return "Never";
  return new Date(dateStr).toLocaleString();
}

function formatDateTimeInTimeZone(dateStr: string | null, timeZone: string) {
  if (!dateStr) return "Never";
  return `${new Date(dateStr).toLocaleString(undefined, { timeZone })} (${timeZone})`;
}

export function TriggersMonitoringDashboard({
  selectedCompanyId = "",
  targetApps = [],
}: {
  selectedCompanyId?: string;
  targetApps?: TargetAppOption[];
}) {
  const [triggers, setTriggers] = useState<TriggerStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filter, setFilter] = useState(() => {
    const { from, to } = defaultDateRange();
    return {
      triggerType: "all",
      status: "all",
      targetAppId: "all",
      from,
      to,
    };
  });
  const [testing, setTesting] = useState<string | null>(null);

  // Per-trigger expand + executions state, keyed by trigger id
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [executions, setExecutions] = useState<Record<string, ExecutionsState>>({});

  // Detail modal
  const [detail, setDetail] = useState<ExecutionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [nodeSteps, setNodeSteps] = useState<NodeStep[]>([]);
  const [nodeStepsLoading, setNodeStepsLoading] = useState(false);
  // Per-step output view mode ("json" default, or "readable")
  const [stepView, setStepView] = useState<Record<string, "readable" | "json">>({});
  // Per-step expand/collapse (collapsed by default)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  const availableTargetApps =
    !selectedCompanyId
      ? targetApps
      : targetApps.filter((app) => app.companyId === selectedCompanyId);

  useEffect(() => {
    setFilter((current) => ({ ...current, targetAppId: "all" }));
  }, [selectedCompanyId]);

  const loadTriggers = async () => {
    setLoading(true);
    setHasSearched(true);
    // Collapse and reset any previously expanded executions
    setExpanded({});
    setExecutions({});
    try {
      const params = new URLSearchParams();
      if (filter.triggerType !== "all") params.append("triggerType", filter.triggerType);
      if (filter.status !== "all") params.append("status", filter.status);
      if (selectedCompanyId) params.append("companyId", selectedCompanyId);
      if (filter.targetAppId !== "all") params.append("targetAppId", filter.targetAppId);
      const fromIso = localInputToUtcIso(filter.from);
      const toIso = localInputToUtcIso(filter.to);
      if (fromIso) params.append("from", fromIso);
      if (toIso) params.append("to", toIso);

      const response = await fetch(
        `/api/admin/orchestrations/triggers/monitoring?${params.toString()}`
      );
      const data = await response.json();
      setTriggers(data.success ? data.triggers : []);
    } catch (error) {
      console.error("Failed to load triggers:", error);
      setTriggers([]);
    } finally {
      setLoading(false);
    }
  };

  const loadExecutions = async (triggerId: string, page: number, pageSize: number) => {
    setExecutions((prev) => ({
      ...prev,
      [triggerId]: {
        ...(prev[triggerId] ?? { rows: [], total: 0, totalPages: 1 }),
        loading: true,
        page,
        pageSize,
      },
    }));

    try {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("pageSize", String(pageSize));
      const fromIso = localInputToUtcIso(filter.from);
      const toIso = localInputToUtcIso(filter.to);
      if (fromIso) params.append("from", fromIso);
      if (toIso) params.append("to", toIso);

      const response = await fetch(
        `/api/admin/orchestrations/triggers/${triggerId}/executions?${params.toString()}`
      );
      const data = await response.json();

      setExecutions((prev) => ({
        ...prev,
        [triggerId]: {
          loading: false,
          rows: data.success ? data.executions : [],
          page: data.success ? data.pagination.page : page,
          pageSize: data.success ? data.pagination.pageSize : pageSize,
          total: data.success ? data.pagination.total : 0,
          totalPages: data.success ? data.pagination.totalPages : 1,
        },
      }));
    } catch (error) {
      console.error("Failed to load executions:", error);
      setExecutions((prev) => ({
        ...prev,
        [triggerId]: {
          loading: false,
          rows: [],
          page,
          pageSize,
          total: 0,
          totalPages: 1,
        },
      }));
    }
  };

  const toggleExpand = (triggerId: string) => {
    const isOpen = !!expanded[triggerId];
    setExpanded((prev) => ({ ...prev, [triggerId]: !isOpen }));
    if (!isOpen && !executions[triggerId]) {
      loadExecutions(triggerId, 1, PAGE_SIZE_OPTIONS[1]);
    }
  };

  const changePage = (triggerId: string, nextPage: number) => {
    const state = executions[triggerId];
    if (!state) return;
    if (nextPage < 1 || nextPage > state.totalPages) return;
    loadExecutions(triggerId, nextPage, state.pageSize);
  };

  const changePageSize = (triggerId: string, size: number) => {
    loadExecutions(triggerId, 1, size);
  };

  const openDetail = async (triggerId: string, logId: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    setNodeSteps([]);
    setStepView({});
    setExpandedSteps({});
    try {
      const response = await fetch(
        `/api/admin/orchestrations/triggers/${triggerId}/executions/${logId}`
      );
      const data = await response.json();
      if (data.success) {
        setDetail(data.execution);
        // If this trigger created an orchestration execution, load its node steps
        const executionId = data.execution?.executionId;
        if (executionId) {
          setNodeStepsLoading(true);
          try {
            const stepsResp = await fetch(
              `/api/admin/orchestrations/executions/${executionId}`
            );
            const stepsData = await stepsResp.json();
            setNodeSteps(
              Array.isArray(stepsData.nodeExecutions) ? stepsData.nodeExecutions : []
            );
          } catch (err) {
            console.error("Failed to load node steps:", err);
          } finally {
            setNodeStepsLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Failed to load execution detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const testTrigger = async (triggerId: string) => {
    setTesting(triggerId);
    try {
      const response = await fetch(
        `/api/admin/orchestrations/triggers/${triggerId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testPayload: { testMode: true } }),
        }
      );
      const data = await response.json();
      alert(data.success ? "Test execution started" : `Test failed: ${data.error}`);
    } catch (error) {
      alert("Test failed: " + error);
    } finally {
      setTesting(null);
    }
  };

  const getTriggerIcon = (triggerType: string) => {
    switch (triggerType) {
      case "schedule":
        return <Calendar className="h-5 w-5 text-purple-600" />;
      case "email":
        return <Mail className="h-5 w-5 text-pink-600" />;
      default:
        return <Clock className="h-5 w-5 text-slate-600" />;
    }
  };

  const getStatusBadge = (isActive: boolean) =>
    isActive ? (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
        <CheckCircle className="h-3 w-3" />
        Active
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-slate-100 text-slate-600 rounded">
        <XCircle className="h-3 w-3" />
        Inactive
      </span>
    );

  const execStatusIcon = (executionStatus: string | null) => {
    if (executionStatus === "completed")
      return <CheckCircle className="h-3 w-3 text-green-600" />;
    if (executionStatus === "failed")
      return <XCircle className="h-3 w-3 text-red-600" />;
    return <Clock className="h-3 w-3 text-slate-400" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-slate-600">
          Monitor and manage all orchestration triggers
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-end gap-4 flex-wrap">
          <Filter className="h-5 w-5 text-slate-600 mb-2" />

          {targetApps.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Target App
              </label>
              <select
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                value={filter.targetAppId}
                onChange={(e) => setFilter({ ...filter, targetAppId: e.target.value })}
              >
                <option value="all">All Target Apps</option>
                {availableTargetApps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Trigger Type
            </label>
            <select
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              value={filter.triggerType}
              onChange={(e) => setFilter({ ...filter, triggerType: e.target.value })}
            >
              <option value="all">All Types</option>
              {MONITORABLE_TRIGGER_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TRIGGER_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Status
            </label>
            <select
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              value={filter.status}
              onChange={(e) => setFilter({ ...filter, status: e.target.value })}
            >
              <option value="all">All</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Executions From (UTC)
            </label>
            <input
              type="datetime-local"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              value={filter.from}
              onChange={(e) => setFilter({ ...filter, from: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Executions To (UTC)
            </label>
            <input
              type="datetime-local"
              className="rounded border border-slate-300 px-3 py-1.5 text-sm"
              value={filter.to}
              onChange={(e) => setFilter({ ...filter, to: e.target.value })}
            />
          </div>

          <button
            onClick={loadTriggers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Filter className="h-4 w-4" />
            Filter
          </button>
        </div>
      </div>

      {/* Triggers List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : !hasSearched ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <p className="text-slate-600">
              Choose filters and click <span className="font-semibold">Filter</span> to load triggers.
            </p>
          </div>
        ) : triggers.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
            <p className="text-slate-600">No triggers found</p>
          </div>
        ) : (
          triggers.map((trigger) => {
            const execState = executions[trigger.id];
            const isOpen = !!expanded[trigger.id];
            return (
              <div
                key={trigger.id}
                className="bg-white border border-slate-200 rounded-lg p-4"
              >
                {/* Trigger Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getTriggerIcon(trigger.triggerType)}
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        {trigger.orchestrationName}
                      </h3>
                      <p className="text-xs text-slate-600">
                        {TRIGGER_TYPE_LABELS[trigger.triggerType as keyof typeof TRIGGER_TYPE_LABELS] ?? trigger.triggerType}
                        {trigger.targetAppName ? ` • ${trigger.targetAppName}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getStatusBadge(trigger.isActive)}
                    {trigger.triggerType !== "email" && (
                      <button
                        onClick={() => testTrigger(trigger.id)}
                        disabled={testing === trigger.id || !trigger.isActive}
                        className="flex items-center gap-1 px-3 py-1 text-sm font-medium bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Play className="h-3 w-3" />
                        {testing === trigger.id ? "Testing..." : "Test"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Trigger-Specific Stats */}
                <div className="grid grid-cols-4 gap-4 mb-3">
                  {trigger.triggerType === "schedule" && (
                    <>
                      <Stat label="Next Run" value={formatDateTimeInTimeZone(trigger.scheduleNextRun, trigger.scheduleTimezone || "UTC")} />
                      <Stat label="Last Run" value={formatDateTimeInTimeZone(trigger.scheduleLastRun, trigger.scheduleTimezone || "UTC")} />
                      <Stat
                        label="Executions"
                        value={String(trigger.scheduleExecutionCount || 0)}
                        valueClass="text-blue-700"
                      />
                      <Stat
                        label="Errors"
                        value={String(trigger.scheduleErrorCount || 0)}
                        valueClass={(trigger.scheduleErrorCount || 0) > 0 ? "text-red-700" : "text-green-700"}
                      />
                    </>
                  )}

                  {trigger.triggerType === "email" && (
                    <>
                      <Stat label="Last Found" value={formatDateTime(trigger.emailLastFound)} />
                      <Stat
                        label="Emails Found"
                        value={String(trigger.emailMessageCount || 0)}
                        valueClass="text-green-700"
                      />
                    </>
                  )}

                </div>

                {/* Recent Executions (collapsible + paginated) */}
                <div className="border-t border-slate-100 pt-3">
                  <button
                    onClick={() => toggleExpand(trigger.id)}
                    className="flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-900"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    Recent Executions
                    {execState ? ` (${execState.total})` : ""}
                  </button>

                  {isOpen && (
                    <div className="mt-3">
                      {execState?.loading ? (
                        <div className="flex items-center justify-center p-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                        </div>
                      ) : !execState || execState.rows.length === 0 ? (
                        <p className="text-xs text-slate-500 p-2">No executions found.</p>
                      ) : (
                        <>
                          <div className="space-y-1">
                            {execState.rows.map((exec) => (
                              <div
                                key={exec.id}
                                className="flex items-center justify-between gap-3 text-xs bg-slate-50 p-2 rounded"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {execStatusIcon(exec.executionStatus)}
                                  <span className="text-slate-900 whitespace-nowrap">
                                    {formatDateTime(exec.triggeredAt)}
                                  </span>
                                  {trigger.triggerType === "email" && exec.emailSubject && (
                                    <span className="text-slate-600 truncate">
                                      • {exec.emailSubject}
                                      {exec.emailFrom ? ` — ${exec.emailFrom}` : ""}
                                    </span>
                                  )}
                                  {exec.errorMessage && (
                                    <span className="text-red-600 truncate">
                                      • {exec.errorMessage}
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => openDetail(trigger.id, exec.id)}
                                  className="px-2 py-1 text-xs font-medium bg-white border border-slate-300 rounded hover:bg-slate-100 whitespace-nowrap"
                                >
                                  View
                                </button>
                              </div>
                            ))}
                          </div>

                          {/* Pagination controls */}
                          <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
                              <span>Page <strong className="text-slate-900">{execState.page}</strong> of <strong className="text-slate-900">{execState.totalPages}</strong></span>
                              <span>Total: <strong className="text-slate-900">{execState.total}</strong> executions</span>
                              <label className="inline-flex items-center gap-2">
                              <span>Page size</span>
                              <select
                                aria-label="Executions per page"
                                className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
                                value={execState.pageSize}
                                onChange={(e) =>
                                  changePageSize(trigger.id, parseInt(e.target.value, 10))
                                }
                              >
                                {PAGE_SIZE_OPTIONS.map((size) => (
                                  <option key={size} value={size}>
                                    {size}
                                  </option>
                                ))}
                              </select>
                              </label>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                onClick={() => changePage(trigger.id, execState.page - 1)}
                                disabled={execState.page <= 1}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
                              >
                                Previous
                              </button>
                              {Array.from({ length: execState.totalPages }, (_, index) => index + 1)
                                .filter((pageNumber) => pageNumber === 1 || pageNumber === execState.totalPages || Math.abs(pageNumber - execState.page) <= 1)
                                .map((pageNumber, index, pages) => (
                                  <span className="contents" key={pageNumber}>
                                    {index > 0 && pageNumber - pages[index - 1] > 1 ? <span className="px-1 text-slate-400">…</span> : null}
                                    <button className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${pageNumber === execState.page ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`} onClick={() => changePage(trigger.id, pageNumber)} type="button">{pageNumber}</button>
                                  </span>
                                ))}
                              <button
                                onClick={() => changePage(trigger.id, execState.page + 1)}
                                disabled={execState.page >= execState.totalPages}
                                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {detailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sticky top-0 bg-white">
              <h3 className="font-semibold text-slate-900">Execution Detail</h3>
              <button
                onClick={() => setDetailOpen(false)}
                className="text-slate-500 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {detailLoading ? (
                <div className="flex items-center justify-center p-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
                </div>
              ) : !detail ? (
                <p className="text-sm text-slate-500">Failed to load detail.</p>
              ) : (
                <>
                  {detail.errorMessage && (
                    <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap">
                      {detail.errorMessage}
                    </div>
                  )}

                  {/* Node steps / outputs for the orchestration run */}
                  {detail.executionId ? (
                    <div>
                      <div className="text-sm font-semibold text-slate-800 mb-2">
                        Orchestration Steps
                      </div>
                      {nodeStepsLoading ? (
                        <div className="flex items-center justify-center p-4">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                        </div>
                      ) : nodeSteps.length === 0 ? (
                        <p className="text-xs text-slate-500">No steps recorded.</p>
                      ) : (
                        <div className="space-y-2">
                          {nodeSteps.map((step, index) => {
                            const view = stepView[step.id] ?? "json";
                            const hasOutput = step.output && Object.keys(step.output).length > 0;
                            const isStepOpen = !!expandedSteps[step.id];
                            return (
                              <div
                                key={step.id}
                                className="rounded-lg border border-slate-200"
                              >
                                <button
                                  onClick={() =>
                                    setExpandedSteps((prev) => ({
                                      ...prev,
                                      [step.id]: !isStepOpen,
                                    }))
                                  }
                                  className="w-full flex items-center justify-between p-2 hover:bg-slate-50"
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    {isStepOpen ? (
                                      <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                                    )}
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-bold shrink-0">
                                      {index + 1}
                                    </span>
                                    <span className="text-sm font-medium text-slate-900 truncate">
                                      {step.nodeLabel}
                                    </span>
                                    <span className="text-xs text-slate-500">{step.nodeType}</span>
                                  </div>
                                  <span
                                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                                      step.status === "completed"
                                        ? "bg-green-100 text-green-700"
                                        : step.status === "failed"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {step.status}
                                  </span>
                                </button>

                                {isStepOpen && (
                                  <div className="px-2 pb-2">
                                    {step.errorMessage && (
                                      <div className="mt-1 text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap">
                                        {step.errorMessage}
                                      </div>
                                    )}
                                    {hasOutput ? (
                                      <div className="mt-2">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="text-xs font-medium text-slate-600">
                                            Output
                                          </span>
                                          <button
                                            onClick={() =>
                                              setStepView((prev) => ({
                                                ...prev,
                                                [step.id]: view === "readable" ? "json" : "readable",
                                              }))
                                            }
                                            className="text-xs text-blue-600 hover:text-blue-700"
                                          >
                                            {view === "readable" ? "View JSON" : "View readable"}
                                          </button>
                                        </div>
                                        <div className="bg-slate-50 border border-slate-200 rounded p-2 max-h-64 overflow-auto text-xs">
                                          {view === "json" ? (
                                            <pre className="text-slate-700 whitespace-pre-wrap">
                                              {JSON.stringify(step.output, null, 2)}
                                            </pre>
                                          ) : (
                                            <ReadableValue value={step.output} />
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      !step.errorMessage && (
                                        <p className="mt-2 text-xs text-slate-500">No output.</p>
                                      )
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">
                      This email did not start an orchestration run.
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "text-slate-900",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-sm font-medium ${valueClass}`}>{value}</div>
    </div>
  );
}

// Renders an arbitrary JSON value as a readable, nested key/value view.
function ReadableValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">null</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400 italic">(empty)</span>;
    }
    return (
      <ul className="list-disc pl-4 space-y-0.5">
        {value.map((item, i) => (
          <li key={i}>
            <ReadableValue value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="text-slate-400 italic">(empty)</span>;
    }
    return (
      <div className="space-y-1">
        {entries.map(([key, val]) => (
          <div key={key} className="flex gap-2">
            <span className="font-medium text-slate-600 shrink-0">{key}:</span>
            <span className="text-slate-900 break-words min-w-0">
              <ReadableValue value={val} />
            </span>
          </div>
        ))}
      </div>
    );
  }

  return <span className="text-slate-900 break-words">{String(value)}</span>;
}
