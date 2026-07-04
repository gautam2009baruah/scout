/**
 * Orchestration List Component
 * Shows all orchestrations with load, delete, and execute actions
 */

"use client";

import { useState, useEffect } from "react";
import { Play, Edit, Trash2, RefreshCw, Clock, CheckCircle, X } from "lucide-react";
import type { Orchestration } from "@/shared/orchestrationTypes";

interface OrchestrationListProps {
  onLoad: (orchestration: Orchestration) => void;
  onClose: () => void;
  onExecute: (orchestration: Orchestration) => void;
  currentOrchestrationId?: string;
}

const STATUS_COLORS = {
  draft: "bg-slate-100 text-slate-700",
  published: "bg-green-100 text-green-700",
  archived: "bg-red-100 text-red-700",
};

export function OrchestrationList({ onLoad, onClose, onExecute, currentOrchestrationId }: OrchestrationListProps) {
  const [orchestrations, setOrchestrations] = useState<Orchestration[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");

  const fetchOrchestrations = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filter !== "all") params.append("status", filter);
      
      const response = await fetch(`/api/admin/orchestrations?${params}`);
      if (response.ok) {
        const data = await response.json();
        setOrchestrations(data.orchestrations || []);
      }
    } catch (error) {
      console.error("Error fetching orchestrations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrchestrations();
  }, [filter]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete orchestration "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/orchestrations/${id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        alert("Orchestration deleted successfully");
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
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filter === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("draft")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filter === "draft"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Drafts
            </button>
            <button
              onClick={() => setFilter("published")}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                filter === "published"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              Published
            </button>
            <button
              onClick={fetchOrchestrations}
              className="ml-auto p-2 text-slate-600 hover:text-slate-900 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
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
                      {orch.status === "published" && (
                        <button
                          onClick={() => {
                            onExecute(orch);
                            onClose();
                          }}
                          className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Execute"
                        >
                          <Play className="h-5 w-5" />
                        </button>
                      )}
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
                        onClick={() => handleDelete(orch.id, orch.name)}
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
        <div className="border-t border-slate-200 p-4 bg-slate-50">
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{filteredOrchestrations.length} orchestration(s)</span>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
