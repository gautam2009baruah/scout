/**
 * Triggers Monitoring Dashboard
 * View all active triggers, their status, and paginated execution history.
 */

"use client";

import { useState } from "react";
import {
  Play,
  Clock,
  Mail,
  Calendar,
  Zap,
  CheckCircle,
  XCircle,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { TRIGGER_TYPE_LABELS } from "@/shared/orchestrationTypes";

type CompanyOption = { id: string; name: string };
type TargetAppOption = { id: string; name: string; companyId: string };

// Only automated trigger types are meaningful to monitor here.
const MONITORABLE_TRIGGER_TYPES = ["email", "webhook", "schedule"] as const;

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
  scheduleNextRun: string | null;
  scheduleLastRun: string | null;
  scheduleExecutionCount: number;
  scheduleErrorCount: number;
  scheduleLastError: string | null;
  // Email-specific (respecting the date range)
  emailLastFound: string | null;
  emailLastRan: string | null;
  emailMessageCount: number;
  // Webhook-specific
  webhookUrl: string | null;
  webhookTotalDeliveries: number;
  webhookSuccessfulDeliveries: number;
  webhookFailedDeliveries: number;
  webhookLastTriggered: string | null;
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

type ExecutionDetail = {
  id: string;
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

export function TriggersMonitoringDashboard({
  companies = [],
  targetApps = [],
}: {
  companies?: CompanyOption[];
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
      companyId: "all",
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

  const availableTargetApps =
    filter.companyId === "all"
      ? targetApps
      : targetApps.filter((app) => app.companyId === filter.companyId);

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
      if (filter.companyId !== "all") params.append("companyId", filter.companyId);
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
    try {
      const response = await fetch(
        `/api/admin/orchestrations/triggers/${triggerId}/executions/${logId}`
      );
      const data = await response.json();
      if (data.success) setDetail(data.execution);
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
      case "webhook":
        return <Zap className="h-5 w-5 text-blue-600" />;
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

          {companies.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Company
              </label>
              <select
                className="rounded border border-slate-300 px-3 py-1.5 text-sm"
                value={filter.companyId}
                onChange={(e) =>
                  setFilter({ ...filter, companyId: e.target.value, targetAppId: "all" })
                }
              >
                <option value="all">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                      <Stat label="Next Run" value={formatDateTime(trigger.scheduleNextRun)} />
                      <Stat label="Last Run" value={formatDateTime(trigger.scheduleLastRun)} />
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

                  {trigger.triggerType === "webhook" && (
                    <>
                      <Stat
                        label="Total Deliveries"
                        value={String(trigger.webhookTotalDeliveries || 0)}
                      />
                      <Stat
                        label="Successful"
                        value={String(trigger.webhookSuccessfulDeliveries || 0)}
                        valueClass="text-green-700"
                      />
                      <Stat
                        label="Failed"
                        value={String(trigger.webhookFailedDeliveries || 0)}
                        valueClass="text-red-700"
                      />
                      <Stat
                        label="Last Triggered"
                        value={formatDateTime(trigger.webhookLastTriggered)}
                      />
                    </>
                  )}
                </div>

                {/* Webhook URL */}
                {trigger.webhookUrl && (
                  <div className="mb-3">
                    <div className="text-xs text-slate-500 mb-1">Webhook URL</div>
                    <div className="font-mono text-xs bg-slate-50 p-2 rounded border border-slate-200 truncate">
                      {trigger.webhookUrl}
                    </div>
                  </div>
                )}

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
                          <div className="flex items-center justify-between mt-3 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">Rows per page:</span>
                              <select
                                className="rounded border border-slate-300 px-2 py-1"
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
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">
                                Page {execState.page} of {execState.totalPages}
                              </span>
                              <button
                                onClick={() => changePage(trigger.id, execState.page - 1)}
                                disabled={execState.page <= 1}
                                className="px-2 py-1 border border-slate-300 rounded disabled:opacity-40"
                              >
                                Prev
                              </button>
                              <button
                                onClick={() => changePage(trigger.id, execState.page + 1)}
                                disabled={execState.page >= execState.totalPages}
                                className="px-2 py-1 border border-slate-300 rounded disabled:opacity-40"
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
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <DetailField label="Log Status" value={detail.status} />
                    <DetailField label="Execution Status" value={detail.executionStatus ?? "—"} />
                    <DetailField label="Triggered At" value={formatDateTime(detail.triggeredAt)} />
                    <DetailField label="Triggered By" value={detail.triggeredBy ?? "—"} />
                    <DetailField
                      label="Started At"
                      value={formatDateTime(detail.executionStartedAt)}
                    />
                    <DetailField
                      label="Completed At"
                      value={formatDateTime(detail.executionCompletedAt)}
                    />
                  </div>

                  {detail.errorMessage && (
                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-1">Error</div>
                      <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2 whitespace-pre-wrap">
                        {detail.errorMessage}
                      </div>
                    </div>
                  )}

                  {detail.email && (
                    <div className="border-t border-slate-200 pt-3 space-y-3">
                      <div className="text-sm font-semibold text-slate-800">Email</div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <DetailField label="From" value={detail.email.fromAddress} />
                        <DetailField label="To" value={detail.email.toAddress} />
                        <DetailField label="Subject" value={detail.email.subject} span />
                        <DetailField label="Mailbox" value={detail.email.mailbox} />
                        <DetailField label="Provider" value={detail.email.provider} />
                        <DetailField
                          label="Received At"
                          value={formatDateTime(detail.email.receivedAt)}
                        />
                        <DetailField
                          label="Processed At"
                          value={formatDateTime(detail.email.processedAt)}
                        />
                        <DetailField label="Status" value={detail.email.status} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-slate-700 mb-1">Body</div>
                        <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-64 overflow-y-auto whitespace-pre-wrap">
                          {detail.email.bodyText || "(no text body)"}
                        </div>
                      </div>
                      {Array.isArray(detail.email.attachments) &&
                        detail.email.attachments.length > 0 && (
                          <div>
                            <div className="text-xs font-semibold text-slate-700 mb-1">
                              Attachments
                            </div>
                            <ul className="text-xs text-slate-700 list-disc pl-5">
                              {(detail.email.attachments as Array<{ filename?: string; size?: number }>).map(
                                (att, idx) => (
                                  <li key={idx}>
                                    {att.filename || "attachment"}
                                    {att.size ? ` (${att.size} bytes)` : ""}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}
                    </div>
                  )}

                  {!detail.email && (
                    <div>
                      <div className="text-xs font-semibold text-slate-700 mb-1">Payload</div>
                      <pre className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 max-h-64 overflow-auto">
                        {JSON.stringify(detail.payload ?? {}, null, 2)}
                      </pre>
                    </div>
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

function DetailField({
  label,
  value,
  span = false,
}: {
  label: string;
  value: string;
  span?: boolean;
}) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 break-words">{value}</div>
    </div>
  );
}
