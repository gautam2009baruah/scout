"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, ChevronRight, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import type { SelectorCandidate, SelectorCandidateType } from "@/shared/guideTypes";

type ElementIdentity = {
  tagName?: string;
  role?: string;
  accessibleName?: string;
  text?: string;
  ariaLabel?: string;
  labelText?: string;
  placeholder?: string;
  inputType?: string;
  selectedOptionText?: string;
  name?: string;
  id?: string;
  dataAttributes?: Record<string, string>;
  nearbyHeading?: string;
  parentContainerText?: string;
  previousSiblingText?: string;
  nextSiblingText?: string;
  parentTagName?: string;
  parentRole?: string;
  parentAccessibleName?: string;
  parentText?: string;
  formTitle?: string;
  dialogTitle?: string;
  cardTitle?: string;
  url?: string;
  path?: string;
  cssFallback?: string;
  xpathFallback?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
};

type HealingSuggestion = {
  id: string;
  workflow_id: string;
  workflow_title: string;
  step_id: string;
  step_order: number;
  proposed_selector_candidates: SelectorCandidate[];
  proposed_element_identity?: ElementIdentity;
  original_element_identity?: ElementIdentity;
  confidence_score: number | string;
  healing_source: "rule-based" | "ai-assisted";
  healing_reason: string;
  page_url: string;
  page_title?: string;
  status: "pending" | "approved" | "rejected";
  playback_attempt_count: number;
  last_playback_attempt_at: string;
  session_title?: string;
  topic_title?: string;
  reviewed_at?: string;
  reviewed_by_email?: string;
};

type EditModalData = {
  suggestion: HealingSuggestion;
  editedCandidates: SelectorCandidate[];
};

export type HealingSuggestionReviewerPanelProps = {
  embedded?: boolean;
  workflowId?: string;
  stepId?: string;
  onClose?: () => void;
};

export function HealingSuggestionReviewerPanel({ embedded = false, workflowId, stepId, onClose }: HealingSuggestionReviewerPanelProps) {
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

  async function handleDelete(suggestionId: string) {
    if (!confirm("Permanently delete this review item? This cannot be undone.")) return;
    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.message || body?.error || "Failed to delete suggestion");
      await loadSuggestions();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete suggestion");
    } finally {
      setProcessingId(null);
    }
  }

  const shellClass = embedded ? "grid gap-4" : "mx-auto max-w-6xl p-6";

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-slate-950">Self-Healing Review</h2>
          <p className="mt-1 text-sm text-slate-500">Review workflow self-healing suggestions from playback sessions.</p>
        </div>
        <div className="flex gap-2">
          <button aria-label="Refresh" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50" onClick={() => void loadSuggestions()} title="Refresh" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
          {onClose && (
            <button aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50" onClick={onClose} title="Close" type="button">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
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
          {suggestions.map((suggestion, index) => (
            <SuggestionCard
              key={suggestion.id}
              index={index + 1}
              onApprove={() => void handleApprove(suggestion.id)}
              onDelete={() => void handleDelete(suggestion.id)}
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

function SuggestionCard({ index, onApprove, onDelete, onEdit, onReject, processing, statusFilter, suggestion }: {
  index: number;
  onApprove(): void;
  onDelete(): void;
  onEdit(): void;
  onReject(): void;
  processing: boolean;
  statusFilter: HealingSuggestion["status"];
  suggestion: HealingSuggestion;
}) {
  const [expanded, setExpanded] = useState(false);
  const confidence = numericConfidence(suggestion.confidence_score);
  const identity = suggestion.proposed_element_identity || suggestion.original_element_identity;
  const userDecision = getUserDecisionFromReason(suggestion.healing_reason);

  return (
    <article className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-left hover:bg-slate-100"
        onClick={() => setExpanded((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setExpanded((current) => !current);
          }
        }}
        role="button"
        tabIndex={0}
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-white">{index}</span>
            <p className="truncate text-sm font-semibold text-slate-950">Step {suggestion.step_order}</p>
          </div>
          {(suggestion.session_title || suggestion.topic_title) && (
            <p className="mt-1 text-xs text-slate-500">
              {suggestion.session_title || ""}{suggestion.session_title && suggestion.topic_title ? " • " : ""}{suggestion.topic_title || ""}
            </p>
          )}
          {(statusFilter === "approved" || statusFilter === "rejected") && suggestion.reviewed_at && (
            <p className="mt-1 text-xs text-slate-500">
              {statusFilter === "approved" ? "Approved" : "Rejected"} by {suggestion.reviewed_by_email || "Unknown"} on {formatDateTimeUTC(suggestion.reviewed_at)}
            </p>
          )}
        </div>
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {userDecision && <Badge tone={userDecision === "accepted" ? "emerald" : userDecision === "rejected" ? "red" : "amber"}>{userDecision}</Badge>}
          <Badge tone={confidence >= 95 ? "emerald" : confidence >= 75 ? "amber" : "slate"}>{confidence.toFixed(0)}%</Badge>
          {statusFilter === "pending" ? (
            <>
              <IconButton disabled={processing} label="Edit" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></IconButton>
              <IconButton disabled={processing} label="Approve" onClick={onApprove} tone="approve"><Check className="h-3.5 w-3.5" /></IconButton>
              <IconButton disabled={processing} label="Reject" onClick={onReject} tone="reject"><X className="h-3.5 w-3.5" /></IconButton>
              <IconButton disabled={processing} label="Delete" onClick={onDelete} tone="delete"><Trash2 className="h-3.5 w-3.5" /></IconButton>
            </>
          ) : (
            <Badge tone={statusFilter === "approved" ? "emerald" : "red"}>{statusFilter}</Badge>
          )}
        </div>
      </div>
      {expanded && (
        <div className="grid gap-4 p-4 text-sm">
          {identity && <ControlIdentityDetails identity={identity} />}
          <SelectorList candidates={suggestion.proposed_selector_candidates ?? []} />
          <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>Attempts: {suggestion.playback_attempt_count}</span>
            <span>{formatDateTimeUTC(suggestion.last_playback_attempt_at)}</span>
          </div>
        </div>
      )}
    </article>
  );
}

function ControlIdentityDetails({ identity }: { identity: ElementIdentity }) {
  const [open, setOpen] = useState(true);
  
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(!open)} type="button">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Control identification details</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">{getControlSummary(identity)}</p>
          </div>
        </button>
      </div>

      {open && (
        <>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-[11px] text-slate-500">Properties captured from the control during playback.</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <ReadOnlyField label="Tag name" value={identity.tagName} />
            <ReadOnlyField label="Role" value={identity.role} />
            <ReadOnlyField label="Accessible name" value={identity.accessibleName} />
            <ReadOnlyField label="Label text" value={identity.labelText} />
            <ReadOnlyField label="Visible text" value={identity.text} />
            <ReadOnlyField label="ARIA label" value={identity.ariaLabel} />
            <ReadOnlyField label="Placeholder" value={identity.placeholder} />
            <ReadOnlyField label="Name" value={identity.name} />
            <ReadOnlyField label="Input type" value={identity.inputType} />
            <ReadOnlyField label="Selected option text" value={identity.selectedOptionText} />
            <ReadOnlyField label="Nearby heading" value={identity.nearbyHeading} />
            <ReadOnlyField label="Parent container text" value={identity.parentContainerText} />
            <ReadOnlyField label="Previous sibling text" value={identity.previousSiblingText} />
            <ReadOnlyField label="Next sibling text" value={identity.nextSiblingText} />
            <ReadOnlyField label="Parent tag name" value={identity.parentTagName} />
            <ReadOnlyField label="Parent role" value={identity.parentRole} />
            <ReadOnlyField label="Parent accessible name" value={identity.parentAccessibleName} />
            <ReadOnlyField label="Parent text" value={identity.parentText} />
            <ReadOnlyField label="Form title" value={identity.formTitle} />
            <ReadOnlyField label="Dialog title" value={identity.dialogTitle} />
            <ReadOnlyField label="Card title" value={identity.cardTitle} />
            <ReadOnlyField label="CSS fallback" value={identity.cssFallback} />
            <ReadOnlyField label="XPath fallback" value={identity.xpathFallback} />
            {identity.dataAttributes && Object.keys(identity.dataAttributes).length > 0 && (
              <div className="xl:col-span-3 md:col-span-2">
                <ReadOnlyField label="Data attributes" value={JSON.stringify(identity.dataAttributes)} />
              </div>
            )}
            {identity.boundingBox && (
              <ReadOnlyField label="Bounding box" value={`x:${identity.boundingBox.x} y:${identity.boundingBox.y} w:${identity.boundingBox.width} h:${identity.boundingBox.height}`} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
      {label}
      <div className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-900 flex items-center overflow-hidden">
        <span className="truncate">{value}</span>
      </div>
    </label>
  );
}

function getControlSummary(identity: ElementIdentity): string {
  const parts: string[] = [];
  if (identity.tagName) parts.push(identity.tagName);
  if (identity.role) parts.push(`role=${identity.role}`);
  if (identity.text) parts.push(`"${identity.text.slice(0, 30)}"`);
  if (identity.ariaLabel) parts.push(`aria-label="${identity.ariaLabel.slice(0, 30)}"`);
  return parts.join(" · ") || "No identification data";
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
  const identity = data.suggestion.proposed_element_identity || data.suggestion.original_element_identity;

  function updateCandidate(index: number, patch: Partial<SelectorCandidate>) {
    setCandidates((current) => current.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate));
  }

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/35 p-4" onClick={onClose}>
      <div className="max-h-[86vh] w-full max-w-4xl overflow-auto rounded-lg border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">Edit Healing Suggestion</h3>
            <p className="mt-1 text-sm text-slate-500">{data.suggestion.workflow_title} - Step {data.suggestion.step_order}</p>
          </div>
          <button className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">Close</button>
        </div>
        <div className="grid gap-4 p-4">
          {identity && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold uppercase text-slate-600">Control Identification Details</p>
              <ControlIdentityDetails identity={identity} />
            </div>
          )}
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Selector candidates</p>
            <div className="grid gap-2">
              {candidates.map((candidate, index) => (
                <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[150px_minmax(0,1fr)_110px_minmax(180px,.7fr)]" key={`${candidate.type}-${index}`}>
                  <select className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={processing} onChange={(event) => updateCandidate(index, { type: event.target.value as SelectorCandidateType })} value={candidate.type}>
                    {selectorTypes.map((type) => <option key={type} value={type}>{humanizeKey(type)}</option>)}
                  </select>
                  <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={processing} onChange={(event) => updateCandidate(index, { value: event.target.value })} placeholder="Selector value" value={candidate.value} />
                  <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={processing} max={1} min={0} onChange={(event) => updateCandidate(index, { confidence: Number(event.target.value) })} step={0.01} type="number" value={candidate.confidence} />
                  <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={processing} onChange={(event) => updateCandidate(index, { reason: event.target.value })} placeholder="Reason" value={candidate.reason} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={processing} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processing || candidates.length === 0} onClick={() => onSave(candidates)} type="button">{processing ? "Saving..." : "Save and approve"}</button>
        </div>
      </div>
    </div>
  );
}

function IconButton({ children, disabled, label, onClick, tone }: { children: React.ReactNode; disabled?: boolean; label: string; onClick(): void; tone?: "approve" | "reject" | "delete" }) {
  const toneClass = tone === "approve" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : tone === "reject" ? "border-red-200 text-red-700 hover:bg-red-50" : tone === "delete" ? "border-red-300 text-red-800 hover:bg-red-100" : "border-slate-300 text-slate-700 hover:bg-slate-50";
  return (
    <button
      aria-label={label}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border bg-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
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

function formatDateTimeUTC(dateString: string): string {
  const date = new Date(dateString);
  const formatted = date.toUTCString().replace('GMT', '').trim();
  return `${formatted} (UTC)`;
}

function getUserDecisionFromReason(reason: string): "accepted" | "rejected" | "skipped" | null {
  const normalized = reason.toLowerCase();
  if (normalized.includes("accepted")) return "accepted";
  if (normalized.includes("rejected")) return "rejected";
  if (normalized.includes("skipped")) return "skipped";
  return null;
}

function humanizeKey(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
