/**
 * Orchestration List Component
 * Shows all orchestrations with load and delete actions
 */

"use client";

import { useState, useEffect } from "react";
import { Edit, Trash2, RefreshCw, Clock, X, Search, Filter } from "lucide-react";
import type { Orchestration } from "@/shared/orchestrationTypes";

interface OrchestrationListProps {
  onLoad: (orchestration: Orchestration) => void;
  onClose: () => void;
  currentOrchestrationId?: string;
  selectedCompanyId: string;
  targetApps: Array<{ id: string; name: string; companyId: string }>;
}

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-red-100 text-red-700",
};

export function OrchestrationList({ onLoad, onClose, currentOrchestrationId, selectedCompanyId, targetApps }: OrchestrationListProps) {
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [targetAppId, setTargetAppId] = useState("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const fetchOrchestrations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedCompanyId) params.set("companyId", selectedCompanyId);
      if (status !== "all") params.set("status", status);
      if (targetAppId !== "all") params.set("targetAppId", targetAppId);
      if (appliedSearch) params.set("search", appliedSearch);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      
      const response = await fetch(`/api/admin/orchestrations?${params}`);
      if (response.ok) {
        const data = await response.json();
        setOrchestrations(data.orchestrations || []);
        setPage(data.page || 1);
        setPageCount(data.pageCount || 1);
        setPageSize(data.pageSize || pageSize);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error("Error fetching orchestrations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrchestrations();
  }, [status, targetAppId, appliedSearch, page, pageSize, selectedCompanyId]);

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/orchestrations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setDeleteTarget(null);
        fetchOrchestrations();
      } else {
        const error = await response.json();
        alert(error.message || "Failed to delete orchestration");
      }
    } catch (error) {
      console.error("Error deleting orchestration:", error);
      alert("Failed to delete orchestration");
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredOrchestrations = orchestrations;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Orchestrations</h2>
              <p className="text-sm text-slate-600 mt-1">
                Load, edit, or manage your orchestrations
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchOrchestrations}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh"
              >
                <RefreshCw className="h-5 w-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
                title="Close"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Filters */}
          <form className="rounded-lg border border-slate-200 bg-slate-50 p-3" onSubmit={(event) => { event.preventDefault(); setPage(1); setAppliedSearch(search.trim()); }}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><Filter className="h-4 w-4" />Filters</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[160px_1fr_1.5fr_auto]">
              <select aria-label="Orchestration status" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}>
                <option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
              </select>
              <select aria-label="Target application" className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" value={targetAppId} onChange={(event) => { setTargetAppId(event.target.value); setPage(1); }}>
                <option value="all">All target apps</option>
                {targetApps.filter((app) => !selectedCompanyId || app.companyId === selectedCompanyId).map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
              </select>
              <input className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm" placeholder="Search orchestration name" type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" type="submit"><Search className="h-4 w-4" />Search</button>
            </div>
          </form>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 text-blue-500 animate-spin" />
            </div>
          ) : filteredOrchestrations.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-16 w-16 mx-auto text-slate-300 mb-4" />
              <p className="text-slate-600 font-semibold">No orchestrations found</p>
              <p className="text-sm text-slate-500 mt-1">
                Create your first orchestration to get started
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrchestrations.map((orch) => (
                <div
                  key={orch.id}
                  className={`border rounded-lg p-4 transition-all hover:shadow-md ${
                    orch.id === currentOrchestrationId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-base font-bold text-slate-900">{orch.name}</h3>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            STATUS_COLORS[orch.status]
                          }`}
                        >
                          {orch.status.toUpperCase()}
                        </span>
                        {orch.id === currentOrchestrationId && (
                          <span className="text-xs font-semibold px-2 py-1 rounded bg-blue-100 text-blue-700">
                            LOADED
                          </span>
                        )}
                      </div>
                      {orch.description && (
                        <p className="text-sm text-slate-600 mb-2">{orch.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-slate-500">
                        <span>Created: {formatDate(orch.createdAt)}</span>
                        <span>Updated: {formatDate(orch.updatedAt)}</span>
                        <span>Version: {orch.version}</span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          onLoad(orch);
                          onClose();
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Load & Edit"
                      >
                        <Edit className="h-5 w-5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget({ id: orch.id, name: orch.name })}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
              <span>Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{pageCount}</strong></span>
              <span>Total: <strong className="text-slate-900">{total}</strong> orchestrations</span>
              <label className="inline-flex items-center gap-2"><span>Page size</span><select aria-label="Orchestrations per page" className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={page <= 1} onClick={() => setPage(page - 1)} type="button">Previous</button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).filter((pageNumber) => pageNumber === 1 || pageNumber === pageCount || Math.abs(pageNumber - page) <= 1).map((pageNumber, index, pages) => <span className="contents" key={pageNumber}>{index > 0 && pageNumber - pages[index - 1] > 1 ? <span className="px-1 text-slate-400">…</span> : null}<button className={`h-9 min-w-9 rounded-lg border px-2 text-sm font-semibold ${pageNumber === page ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700"}`} onClick={() => setPage(pageNumber)} type="button">{pageNumber}</button></span>)}
              <button className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold disabled:opacity-40" disabled={page >= pageCount} onClick={() => setPage(page + 1)} type="button">Next</button>
              <button onClick={onClose} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white" type="button">Close</button>
            </div>
          </div>
        </div>
      </div>
      {deleteTarget ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-950">Delete orchestration</h3>
            <p className="mt-2 text-sm text-slate-600">Delete “{deleteTarget.name}”? This action cannot be undone.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setDeleteTarget(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700" onClick={() => void handleDelete(deleteTarget.id)} type="button">Delete</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
