"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Pencil, RefreshCw, X } from "lucide-react";
import type { SelectorCandidate, SelectorCandidateType } from "@/shared/guideTypes";

type HealingSuggestion = {
  id: string;
  workflow_id: string;
  workflow_title: string;
  step_id: string;
  step_order: number;
  proposed_selector_candidates: SelectorCandidate[];
  confidence_score: number | string;
  healing_source: "rule-based" | "ai-assisted";
  healing_reason: string;
  page_url: string;
  page_title?: string;
  status: "pending" | "approved" | "rejected";
  playback_attempt_count: number;
  last_playback_attempt_at: string;
};

type EditModalData = {
  suggestion: HealingSuggestion;
  editedCandidates: SelectorCandidate[];
};

export type HealingSuggestionReviewerPanelProps = {
  embedded?: boolean;
  workflowId?: string;
  stepId?: string;
};

export function HealingSuggestionReviewerPanel({ embedded = false, workflowId, stepId }: HealingSuggestionReviewerPanelProps) {
  const [suggestions, setSuggestions] = useState<HealingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<EditModalData | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ status: statusFilter });
      if (workflowId) params.set("workflowId", workflowId);
      if (stepId) params.set("stepId", stepId);
      const response = await fetch(`/api/guided-workflow-player/healing-suggestions?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to load suggestions: ${response.statusText}`);
      const body = await response.json();
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, workflowId, stepId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  async function handleApprove(suggestionId: string, editedCandidates?: SelectorCandidate[]) {
    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          editedSelectorCandidates: editedCandidates,
          versionNotes: editedCandidates ? "Trainer edited healing suggestion before approval" : undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Failed to approve suggestion");
      setEditModal(null);
      await loadSuggestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to approve suggestion");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(suggestionId: string) {
    if (!confirm("Reject this trainer review item?")) return;
    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Failed to reject suggestion");
      await loadSuggestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to reject suggestion");
    } finally {
      setProcessingId(null);
    }
  }

  const shellClass = embedded ? "grid gap-4" : "mx-auto max-w-6xl p-6";

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">{stepId ? "Step Self-Healing Review" : "Workflow Self-Healing Suggestions"}</h2>
          <p className="mt-1 text-sm text-slate-500">Pending items come from users during playback. Approved and rejected are trainer decisions.</p>
        </div>
        <button className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => void loadSuggestions()} type="button">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-200">
        {(["pending", "approved", "rejected"] as const).map((status) => (
          <button className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${statusFilter === status ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`} key={status} onClick={() => setStatusFilter(status)} type="button">
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">Loading healing suggestions...</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : suggestions.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-700">No {statusFilter} items</p>
          <p className="mt-1 text-xs text-slate-500">Auto-healing decisions will appear in Pending for trainer review.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              onApprove={() => void handleApprove(suggestion.id)}
              onEdit={() => setEditModal({ suggestion, editedCandidates: [...(suggestion.proposed_selector_candidates ?? [])] })}
              onReject={() => void handleReject(suggestion.id)}
              processing={processingId === suggestion.id}
              statusFilter={statusFilter}
              suggestion={suggestion}
            />
          ))}
        </div>
      )}

      {editModal ? (
        <EditModal
          data={editModal}
          onClose={() => setEditModal(null)}
          onSave={(edited) => void handleApprove(editModal.suggestion.id, edited)}
          processing={processingId === editModal.suggestion.id}
        />
      ) : null}
    </div>
  );
}

export default HealingSuggestionReviewerPanel;

function SuggestionCard({ onApprove, onEdit, onReject, processing, statusFilter, suggestion }: {
  onApprove(): void;
  onEdit(): void;
  onReject(): void;
  processing: boolean;
  statusFilter: HealingSuggestion["status"];
  suggestion: HealingSuggestion;
}) {
  const confidence = numericConfidence(suggestion.confidence_score);
  const decisionTone = suggestion.healing_reason.toLowerCase().includes("skipped") ? "amber" : suggestion.healing_reason.toLowerCase().includes("rejected") ? "red" : "emerald";

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{suggestion.workflow_title}</p>
          <p className="mt-1 text-xs text-slate-500">Step {suggestion.step_order} · {suggestion.step_id}</p>
        </div>
        {statusFilter === "pending" ? (
          <div className="flex gap-1">
            <IconButton disabled={processing} label="Edit selectors" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></IconButton>
            <IconButton disabled={processing} label="Approve" onClick={onApprove} tone="approve"><Check className="h-3.5 w-3.5" /></IconButton>
            <IconButton disabled={processing} label="Reject" onClick={onReject} tone="reject"><X className="h-3.5 w-3.5" /></IconButton>
          </div>
        ) : (
          <Badge tone={statusFilter === "approved" ? "emerald" : "red"}>{statusFilter}</Badge>
        )}
      </div>
      <div className="grid gap-3 p-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge tone={confidence >= 95 ? "emerald" : confidence >= 75 ? "amber" : "slate"}>{confidence.toFixed(1)}% confidence</Badge>
          <Badge tone="blue">{suggestion.healing_source === "ai-assisted" ? "AI assisted" : "Rule based"}</Badge>
          <Badge tone={decisionTone}>{userDecisionLabel(suggestion.healing_reason)}</Badge>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Reason</p>
          <p className="mt-1 text-slate-800">{suggestion.healing_reason}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Page</p>
          <p className="mt-1 truncate text-slate-700">{suggestion.page_title || suggestion.page_url}</p>
        </div>
        <SelectorList candidates={suggestion.proposed_selector_candidates ?? []} />
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>Attempts: {suggestion.playback_attempt_count}</span>
          <span>{new Date(suggestion.last_playback_attempt_at).toLocaleString()}</span>
        </div>
      </div>
    </article>
  );
}

function SelectorList({ candidates }: { candidates: SelectorCandidate[] }) {
  if (candidates.length === 0) {
    return <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">No replacement selectors were captured.</p>;
  }
  return (
    <div className="grid gap-1">
      <p className="text-xs font-semibold uppercase text-slate-500">Captured selectors</p>
      {candidates.map((candidate, index) => (
        <div className="grid grid-cols-[96px_minmax(0,1fr)_54px] items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-xs" key={`${candidate.type}-${index}`}>
          <span className="rounded bg-white px-2 py-1 font-mono text-slate-600">{candidate.type}</span>
          <span className="truncate text-slate-800">{candidate.value}</span>
          <span className="text-right text-slate-500">{candidate.confidence}%</span>
        </div>
      ))}
    </div>
  );
}

function EditModal({ data, onClose, onSave, processing }: {
  data: EditModalData;
  onClose(): void;
  onSave(edited: SelectorCandidate[]): void;
  processing: boolean;
}) {
  const [candidates, setCandidates] = useState(data.editedCandidates);
  const selectorTypes: SelectorCandidateType[] = ["data-adoption-id", "data-testid", "data-test", "data-cy", "id", "name", "aria-label", "role-text", "label-text", "placeholder", "text-context", "css", "xpath"];

  function updateCandidate(index: number, patch: Partial<SelectorCandidate>) {
    setCandidates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate));
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/35 p-4" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Edit Healing Suggestion</h3>
            <p className="mt-1 text-sm text-slate-500">{data.suggestion.workflow_title}</p>
          </div>
          <button className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">Close</button>
        </div>
        <div className="grid gap-3 p-4">
          {candidates.map((candidate, index) => (
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[160px_minmax(0,1fr)_100px]" key={`${candidate.type}-${index}`}>
              <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-900" disabled={processing} onChange={(event) => updateCandidate(index, { type: event.target.value as SelectorCandidateType })} value={candidate.type}>
                {selectorTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <input className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-900" disabled={processing} onChange={(event) => updateCandidate(index, { value: event.target.value })} value={candidate.value} />
              <input className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-900" disabled={processing} max={100} min={0} onChange={(event) => updateCandidate(index, { confidence: Number(event.target.value) })} type="number" value={candidate.confidence} />
              <input className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs outline-none focus:border-slate-900 md:col-span-3" disabled={processing} onChange={(event) => updateCandidate(index, { reason: event.target.value })} value={candidate.reason} />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={processing} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processing || candidates.length === 0} onClick={() => onSave(candidates)} type="button">{processing ? "Saving..." : "Save and approve"}</button>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, disabled, label, onClick, tone }: { children: React.ReactNode; disabled?: boolean; label: string; onClick(): void; tone?: "approve" | "reject" }) {
  const toneClass = tone === "approve" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : tone === "reject" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-50";
  return <button aria-label={label} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`} disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>;
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "emerald" | "amber" | "red" | "blue" | "slate" }) {
  const classes = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    blue: "bg-blue-100 text-blue-800",
    slate: "bg-slate-100 text-slate-700"
  };
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${classes[tone]}`}>{children}</span>;
}

function userDecisionLabel(reason: string) {
  const normalized = reason.toLowerCase();
  if (normalized.includes("skipped")) return "User skipped";
  if (normalized.includes("rejected")) return "User rejected";
  if (normalized.includes("accepted")) return "User accepted";
  return "Needs review";
}

function numericConfidence(value: HealingSuggestion["confidence_score"]) {
  const score = typeof value === "number" ? value : Number(value);
  return Number.isFinite(score) ? score : 0;
}
