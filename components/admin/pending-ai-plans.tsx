"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Clock, ExternalLink } from "lucide-react";

type PendingPlanRequest = {
  id: string;
  externalUserId: string;
  requestText: string;
  planSummary: string;
  createdAt: string;
  draftOrchestrationId: string | null;
};

function formatTimestamp(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export function PendingAiPlans() {
  const router = useRouter();
  const [requests, setRequests] = useState<PendingPlanRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/admin/orchestrations/planner/pending");
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(typeof body?.message === "string" ? body.message : "Failed to load pending requests.");
        }
        const data = await response.json();
        if (!cancelled) {
          setRequests(Array.isArray(data.requests) ? data.requests : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load pending requests.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

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
      setError(err instanceof Error ? err.message : "Failed to open this request.");
      setOpeningId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Bot className="h-6 w-6 text-violet-700" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Pending AI Plans</h1>
          <p className="text-sm text-slate-500">Draft plans submitted by AI Planner, awaiting your review.</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Loading pending requests...</p>
      ) : requests.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          No requests are waiting for review right now.
        </p>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={request.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Requester: {request.externalUserId}
                  </p>
                  <p className="mt-1 text-sm font-medium text-slate-900">{request.requestText}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3.5 w-3.5" />
                  {formatTimestamp(request.createdAt)}
                </div>
              </div>

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
          ))}
        </div>
      )}
    </div>
  );
}
