"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, ChevronDown, ChevronRight, Clock, ExternalLink, Filter, CheckCircle2, XCircle } from "lucide-react";
import { useToast } from "./toast";

type PendingPlanRequestStatus = "pending" | "approved" | "rejected";

type PendingPlanRequest = {
  id: string;
  externalUserId: string;
  requestText: string;
  planSummary: string;
  createdAt: string;
  draftOrchestrationId: string | null;
  targetAppId: string | null;
  targetAppName: string | null;
  status: PendingPlanRequestStatus;
  resolvedAt: string | null;
  resolvedByName: string | null;
  rejectionReason: string | null;
};

type TargetApp = {
  id: string;
  name: string;
};

type RequestsPage = {
  requests: PendingPlanRequest[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50];

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

// The date input holds a plain "YYYY-MM-DD" with no timezone. Appending a
// bare time (no "Z") makes `Date` parse it as local midnight/end-of-day, so
// toISOString() below converts it to the correct UTC instant before it's
// compared against the timestamptz columns in the database.
function startOfDayIso(dateStr: string): string | null {
  if (!dateStr) return null;
  return new Date(`${dateStr}T00:00:00`).toISOString();
}

function endOfDayIso(dateStr: string): string | null {
  if (!dateStr) return null;
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  itemLabel,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <span>
          Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{pageCount}</strong>
        </span>
        <span>
          Total: <strong className="text-slate-900">{total}</strong> {itemLabel}
        </span>
        <label className="inline-flex items-center gap-2">
          <span>Page size</span>
          <select
            aria-label={`${itemLabel} per page`}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm"
            value={pageSize}
            onChange={(event) => onPageSizeChange(parseInt(event.target.value, 10))}
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
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(page - 1, 1))}
          type="button"
        >
          Previous
        </button>
        {Array.from({ length: pageCount }, (_, index) => index + 1)
          .filter((pageNumber) => pageNumber === 1 || pageNumber === pageCount || Math.abs(pageNumber - page) <= 1)
          .map((pageNumber, index, pages) => (
            <span className="contents" key={pageNumber}>
              {index > 0 && pageNumber - pages[index - 1] > 1 ? <span className="px-1 text-slate-400">…</span> : null}
              <button
                className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${
                  pageNumber === page ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => onPageChange(pageNumber)}
                type="button"
              >
                {pageNumber}
              </button>
            </span>
          ))}
        <button
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-40"
          disabled={page >= pageCount}
          onClick={() => onPageChange(Math.min(page + 1, pageCount))}
          type="button"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PendingPlanRequestStatus }) {
  if (status === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Approved
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
      <XCircle className="h-3.5 w-3.5" />
      Rejected
    </span>
  );
}

export function PendingAiPlans() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [targetApps, setTargetApps] = useState<TargetApp[]>([]);
  const [openingId, setOpeningId] = useState<string | null>(null);

  // Active Pending Requests tab
  const [activeFilterDraft, setActiveFilterDraft] = useState({ targetAppId: "", requestedFrom: "", requestedTo: "" });
  const [activeFilter, setActiveFilter] = useState({ targetAppId: "", requestedFrom: "", requestedTo: "" });
  const [activePage, setActivePage] = useState(1);
  const [activePageSize, setActivePageSize] = useState(10);
  const [activeData, setActiveData] = useState<RequestsPage>({ requests: [], page: 1, pageSize: 10, total: 0, pageCount: 1 });
  const [activeLoading, setActiveLoading] = useState(true);
  const { showToast } = useToast();
  const [activeExpanded, setActiveExpanded] = useState<Record<string, boolean>>({});

  // Archived Requests tab
  const [archivedFilterDraft, setArchivedFilterDraft] = useState({ targetAppId: "", resolvedFrom: "", resolvedTo: "", status: "all" });
  const [archivedFilter, setArchivedFilter] = useState({ targetAppId: "", resolvedFrom: "", resolvedTo: "", status: "all" });
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedPageSize, setArchivedPageSize] = useState(10);
  const [archivedData, setArchivedData] = useState<RequestsPage>({ requests: [], page: 1, pageSize: 10, total: 0, pageCount: 1 });
  const [archivedLoading, setArchivedLoading] = useState(true);
  const [archivedExpanded, setArchivedExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/orchestrations/target-apps");
        const data = await response.json();
        if (!cancelled && data.success && Array.isArray(data.targetApps)) {
          setTargetApps(data.targetApps.map((app: { id: string; name: string }) => ({ id: app.id, name: app.name })));
        }
      } catch {
        // Non-critical — the target application filter just stays empty.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadActive = useCallback(async () => {
    setActiveLoading(true);
    try {
      const params = new URLSearchParams();
      if (activeFilter.targetAppId) params.set("targetAppId", activeFilter.targetAppId);
      const from = startOfDayIso(activeFilter.requestedFrom);
      const to = endOfDayIso(activeFilter.requestedTo);
      if (from) params.set("requestedFrom", from);
      if (to) params.set("requestedTo", to);
      params.set("page", String(activePage));
      params.set("pageSize", String(activePageSize));

      const response = await fetch(`/api/admin/orchestrations/planner/pending?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to load pending requests.");
      }
      const data = await response.json();
      setActiveData({
        requests: Array.isArray(data.requests) ? data.requests : [],
        page: data.page || 1,
        pageSize: data.pageSize || activePageSize,
        total: data.total || 0,
        pageCount: data.pageCount || 1,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load pending requests.", "error");
    } finally {
      setActiveLoading(false);
    }
  }, [activeFilter, activePage, activePageSize, showToast]);

  const loadArchived = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const params = new URLSearchParams();
      if (archivedFilter.targetAppId) params.set("targetAppId", archivedFilter.targetAppId);
      if (archivedFilter.status !== "all") params.set("status", archivedFilter.status);
      const from = startOfDayIso(archivedFilter.resolvedFrom);
      const to = endOfDayIso(archivedFilter.resolvedTo);
      if (from) params.set("resolvedFrom", from);
      if (to) params.set("resolvedTo", to);
      params.set("page", String(archivedPage));
      params.set("pageSize", String(archivedPageSize));

      const response = await fetch(`/api/admin/orchestrations/planner/archived?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to load archived requests.");
      }
      const data = await response.json();
      setArchivedData({
        requests: Array.isArray(data.requests) ? data.requests : [],
        page: data.page || 1,
        pageSize: data.pageSize || archivedPageSize,
        total: data.total || 0,
        pageCount: data.pageCount || 1,
      });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to load archived requests.", "error");
    } finally {
      setArchivedLoading(false);
    }
  }, [archivedFilter, archivedPage, archivedPageSize, showToast]);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  useEffect(() => {
    loadArchived();
  }, [loadArchived]);

  function submitActiveFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActivePage(1);
    setActiveFilter(activeFilterDraft);
  }

  function submitArchivedFilter(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setArchivedPage(1);
    setArchivedFilter(archivedFilterDraft);
  }

  async function openInBuilder(request: PendingPlanRequest) {
    setOpeningId(request.id);
    try {
      const response = await fetch(`/api/admin/orchestrations/planner/pending/${request.id}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to open this request.");
      }
      const data = await response.json();
      const orchestrationId = data.draftOrchestrationId;
      if (!orchestrationId) {
        throw new Error("No draft orchestration was returned.");
      }
      router.push(`/control-panel/orchestration-designer?orchestrationId=${orchestrationId}&pendingRequestId=${request.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to open this request.", "error");
      setOpeningId(null);
    }
  }

  const sortedTargetApps = [...targetApps].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-violet-700" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pending AI Plans</h1>
          <p className="text-sm text-slate-500">Draft plans submitted by AI Planner, awaiting your review.</p>
        </div>
      </div>

      <div className="mb-4 border-b border-slate-200" role="tablist">
        <div className="flex gap-2">
          <button
            aria-controls="active-pending-requests-panel"
            aria-selected={activeTab === "active"}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              activeTab === "active" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("active")}
            role="tab"
            type="button"
          >
            Active Pending Requests
          </button>
          <button
            aria-controls="archived-requests-panel"
            aria-selected={activeTab === "archived"}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              activeTab === "archived" ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
            onClick={() => setActiveTab("archived")}
            role="tab"
            type="button"
          >
            Archived Requests
          </button>
        </div>
      </div>

      {activeTab === "active" ? (
        <div id="active-pending-requests-panel" role="tabpanel">
          <form className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={submitActiveFilter}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-4 lg:grid-cols-[2fr_1fr_1fr_auto]">
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Target Application</span>
                <select
                  aria-label="Target application"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setActiveFilterDraft({ ...activeFilterDraft, targetAppId: event.target.value })}
                  value={activeFilterDraft.targetAppId}
                >
                  <option value="">All target apps</option>
                  {sortedTargetApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Requested From Date</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setActiveFilterDraft({ ...activeFilterDraft, requestedFrom: event.target.value })}
                  type="date"
                  value={activeFilterDraft.requestedFrom}
                />
              </label>
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Requested To Date</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setActiveFilterDraft({ ...activeFilterDraft, requestedTo: event.target.value })}
                  type="date"
                  value={activeFilterDraft.requestedTo}
                />
              </label>
              <button className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </div>
          </form>


          {activeLoading ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Loading pending requests...</p>
          ) : activeData.requests.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No requests are waiting for review right now.
            </p>
          ) : (
            <div className="space-y-3">
              {activeData.requests.map((request) => {
                const isOpen = !!activeExpanded[request.id];
                return (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm" key={request.id}>
                    <button
                      className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left"
                      onClick={() => setActiveExpanded({ ...activeExpanded, [request.id]: !isOpen })}
                      type="button"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Requester: {request.externalUserId}
                            {request.targetAppName ? ` • ${request.targetAppName}` : ""}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-slate-900">{request.requestText}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                        <Clock className="h-3.5 w-3.5" />
                        {formatTimestamp(request.createdAt)}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 px-4 pb-4">
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                          <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-slate-700">{request.planSummary}</p>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                            disabled={openingId === request.id}
                            onClick={() => openInBuilder(request)}
                            type="button"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {openingId === request.id ? "Opening..." : "Review in builder"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <Pagination
                itemLabel="requests"
                onPageChange={setActivePage}
                onPageSizeChange={(size) => {
                  setActivePageSize(size);
                  setActivePage(1);
                }}
                page={activeData.page}
                pageCount={activeData.pageCount}
                pageSize={activeData.pageSize}
                total={activeData.total}
              />
            </div>
          )}
        </div>
      ) : (
        <div id="archived-requests-panel" role="tabpanel">
          <form className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={submitArchivedFilter}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="h-4 w-4" />
              Filters
            </div>
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-5 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Target Application</span>
                <select
                  aria-label="Target application"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setArchivedFilterDraft({ ...archivedFilterDraft, targetAppId: event.target.value })}
                  value={archivedFilterDraft.targetAppId}
                >
                  <option value="">All target apps</option>
                  {sortedTargetApps.map((app) => (
                    <option key={app.id} value={app.id}>
                      {app.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Resolved From Date</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setArchivedFilterDraft({ ...archivedFilterDraft, resolvedFrom: event.target.value })}
                  type="date"
                  value={archivedFilterDraft.resolvedFrom}
                />
              </label>
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Resolved To Date</span>
                <input
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setArchivedFilterDraft({ ...archivedFilterDraft, resolvedTo: event.target.value })}
                  type="date"
                  value={archivedFilterDraft.resolvedTo}
                />
              </label>
              <label className="flex min-w-0 flex-col">
                <span className="mb-1 text-xs text-slate-500">Status</span>
                <select
                  aria-label="Status"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm"
                  onChange={(event) => setArchivedFilterDraft({ ...archivedFilterDraft, status: event.target.value })}
                  value={archivedFilterDraft.status}
                >
                  <option value="all">All statuses</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </label>
              <button className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit">
                <Filter className="h-4 w-4" />
                Filter
              </button>
            </div>
          </form>


          {archivedLoading ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Loading archived requests...</p>
          ) : archivedData.requests.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No archived requests found.</p>
          ) : (
            <div className="space-y-3">
              {archivedData.requests.map((request) => {
                const isOpen = !!archivedExpanded[request.id];
                return (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm" key={request.id}>
                    <button
                      className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left"
                      onClick={() => setArchivedExpanded({ ...archivedExpanded, [request.id]: !isOpen })}
                      type="button"
                    >
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        {isOpen ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Requester: {request.externalUserId}
                            {request.targetAppName ? ` • ${request.targetAppName}` : ""}
                          </p>
                          <p className="mt-1 truncate text-sm font-medium text-slate-900">{request.requestText}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusBadge status={request.status} />
                        {request.resolvedAt && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            {formatTimestamp(request.resolvedAt)}
                          </div>
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-slate-100 px-4 pb-4">
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                          <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-slate-700">{request.planSummary}</p>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                          {request.resolvedByName && <span>Resolved by: {request.resolvedByName}</span>}
                          {request.status === "rejected" && request.rejectionReason && (
                            <span>Reason: {request.rejectionReason}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              <Pagination
                itemLabel="requests"
                onPageChange={setArchivedPage}
                onPageSizeChange={(size) => {
                  setArchivedPageSize(size);
                  setArchivedPage(1);
                }}
                page={archivedData.page}
                pageCount={archivedData.pageCount}
                pageSize={archivedData.pageSize}
                total={archivedData.total}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
