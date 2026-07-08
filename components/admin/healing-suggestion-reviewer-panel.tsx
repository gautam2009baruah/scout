"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, ListFilter, Pencil, Trash2, X } from "lucide-react";
import type { SelectorCandidate, SelectorCandidateType, TargetElement } from "@/shared/guideTypes";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowTargetAppRow } from "@/lib/admin/guided-workflows";

type CompanyOption = { id: string; name: string };

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
  company_id: string;
  company_name?: string;
  workflow_id: string;
  workflow_title: string;
  target_app_id?: string;
  target_app_name?: string;
  recording_session_id?: string;
  topic_id?: string;
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
  editedTarget: TargetElement;
};

export type HealingSuggestionReviewerPanelProps = {
  embedded?: boolean;
  displayMode?: "cards" | "table";
  companies?: CompanyOption[];
  targetApps?: GuidedWorkflowTargetAppRow[];
  recordingSessions?: GuidedWorkflowRecordingSessionRow[];
  workflowId?: string;
  stepId?: string;
  onClose?: () => void;
};

export function HealingSuggestionReviewerPanel({ companies = [], displayMode = "cards", embedded = false, recordingSessions = [], targetApps = [], workflowId, stepId, onClose }: HealingSuggestionReviewerPanelProps) {
  const [suggestions, setSuggestions] = useState<HealingSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<EditModalData | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [filters, setFilters] = useState({
    companyId: companies[0]?.id ?? "",
    targetAppId: "",
    recordingSessionId: "",
    topicId: "all"
  });
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalRows, setTotalRows] = useState(0);

  const showFilters = displayMode === "table";
  const filteredTargetApps = useMemo(
    () => targetApps.filter((app) => !filters.companyId || app.companyId === filters.companyId),
    [filters.companyId, targetApps]
  );
  const filteredRecordingSessions = useMemo(
    () => recordingSessions.filter((session) => {
      const matchesCompany = !filters.companyId || session.companyId === filters.companyId;
      const matchesTargetApp = !filters.targetAppId || session.targetAppId === filters.targetAppId;
      return matchesCompany && matchesTargetApp;
    }),
    [filters.companyId, filters.targetAppId, recordingSessions]
  );
  const filteredTopics = useMemo(
    () => filteredRecordingSessions
      .filter((session) => !filters.recordingSessionId || session.id === filters.recordingSessionId)
      .flatMap((session) => session.topics.map((topic) => ({ ...topic, sessionId: session.id }))),
    [filteredRecordingSessions, filters.recordingSessionId]
  );

  useEffect(() => {
    if (!showFilters) return;
    setFilters((current) => {
      const nextTargetAppId = current.targetAppId && filteredTargetApps.some((app) => app.id === current.targetAppId) ? current.targetAppId : "";
      const nextSessionId = current.recordingSessionId && filteredRecordingSessions.some((session) => session.id === current.recordingSessionId) ? current.recordingSessionId : "";
      const nextTopicId = current.topicId === "all" || filteredTopics.some((topic) => topic.id === current.topicId) ? current.topicId : "all";
      if (nextTargetAppId === current.targetAppId && nextSessionId === current.recordingSessionId && nextTopicId === current.topicId) return current;
      return { ...current, targetAppId: nextTargetAppId, recordingSessionId: nextSessionId, topicId: nextTopicId };
    });
  }, [filteredRecordingSessions, filteredTargetApps, filteredTopics, showFilters]);

  const loadSuggestions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ status: statusFilter });
      if (workflowId) params.set("workflowId", workflowId);
      if (stepId) params.set("stepId", stepId);
      if (showFilters) {
        if (appliedFilters.companyId) params.set("companyId", appliedFilters.companyId);
        if (appliedFilters.targetAppId) params.set("targetAppId", appliedFilters.targetAppId);
        if (appliedFilters.recordingSessionId) params.set("recordingSessionId", appliedFilters.recordingSessionId);
        if (appliedFilters.topicId && appliedFilters.topicId !== "all") params.set("topicId", appliedFilters.topicId);
      }
      if (showFilters) {
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
      }
      const response = await fetch(`/api/guided-workflow-player/healing-suggestions?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to load suggestions: ${response.statusText}`);
      const body = await response.json();
      setSuggestions(Array.isArray(body.suggestions) ? body.suggestions : []);
      setTotalRows(Number(body.pagination?.total ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [appliedFilters.companyId, appliedFilters.recordingSessionId, appliedFilters.targetAppId, appliedFilters.topicId, page, pageSize, showFilters, statusFilter, workflowId, stepId]);

  useEffect(() => {
    void loadSuggestions();
  }, [loadSuggestions]);

  async function handleApprove(suggestionId: string, editedTarget?: TargetElement) {
    try {
      setProcessingId(suggestionId);
      const response = await fetch("/api/guided-workflow-player/healing-suggestions/review?action=approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestionId,
          editedTarget,
          editedSelectorCandidates: editedTarget?.selectorCandidates,
          versionNotes: editedTarget ? "Trainer edited healing suggestion before approval" : undefined,
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

  const shellClass = embedded ? "grid gap-4" : "mx-auto grid max-w-6xl gap-5";

  return (
    <div className={shellClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {displayMode === "table" ? null : <h2 className="text-lg font-semibold tracking-normal text-slate-950">Self-Healing Review</h2>}
          <p className={`${displayMode === "table" ? "mt-0" : "mt-1"} text-sm text-slate-500`}>Review workflow self-healing suggestions from playback sessions.</p>
        </div>
        <div className="flex gap-2">
          {onClose && (
            <button aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50" onClick={onClose} title="Close" type="button">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {showFilters ? (
        <HealingFilters
          companies={companies}
          filters={filters}
          onApply={() => {
            setAppliedFilters(filters);
            setPage(1);
          }}
          onChange={(patch) => setFilters((current) => ({ ...current, ...patch }))}
          recordingSessions={filteredRecordingSessions}
          targetApps={filteredTargetApps}
          topics={filteredTopics}
        />
      ) : null}

      <div className="flex gap-1 border-b border-slate-200">
        {(["pending", "approved", "rejected"] as const).map((status) => (
          <button className={`border-b-2 px-3 py-2 text-sm font-semibold capitalize ${statusFilter === status ? "border-slate-950 text-slate-950" : "border-transparent text-slate-500 hover:text-slate-900"}`} key={status} onClick={() => { setStatusFilter(status); setPage(1); }} type="button">
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
        displayMode === "table" ? (
          <SuggestionTable
            onApprove={(suggestion) => void handleApprove(suggestion.id)}
            onDelete={(suggestion) => void handleDelete(suggestion.id)}
            onEdit={(suggestion) => setEditModal({ suggestion, editedTarget: targetFromSuggestion(suggestion) })}
            onReject={(suggestion) => void handleReject(suggestion.id)}
            page={page}
            pageSize={pageSize}
            processingId={processingId}
            setPage={setPage}
            statusFilter={statusFilter}
            suggestions={suggestions}
            totalRows={totalRows}
          />
        ) : (
          <div className="grid gap-3">
            {suggestions.map((suggestion, index) => (
              <SuggestionCard
                key={suggestion.id}
                index={index + 1}
                onApprove={() => void handleApprove(suggestion.id)}
                onDelete={() => void handleDelete(suggestion.id)}
                onEdit={() => setEditModal({ suggestion, editedTarget: targetFromSuggestion(suggestion) })}
                onReject={() => void handleReject(suggestion.id)}
                processing={processingId === suggestion.id}
                statusFilter={statusFilter}
                suggestion={suggestion}
              />
            ))}
          </div>
        )
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

function HealingFilters({
  companies,
  filters,
  onApply,
  onChange,
  recordingSessions,
  targetApps,
  topics
}: {
  companies: CompanyOption[];
  filters: { companyId: string; targetAppId: string; recordingSessionId: string; topicId: string };
  onApply(): void;
  onChange(patch: Partial<{ companyId: string; targetAppId: string; recordingSessionId: string; topicId: string }>): void;
  recordingSessions: GuidedWorkflowRecordingSessionRow[];
  targetApps: GuidedWorkflowTargetAppRow[];
  topics: Array<GuidedWorkflowRecordingSessionRow["topics"][number] & { sessionId: string }>;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
      <FilterSelect
        label="Company"
        onChange={(companyId) => onChange({ companyId, targetAppId: "", recordingSessionId: "", topicId: "all" })}
        value={filters.companyId}
      >
        {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </FilterSelect>
      <FilterSelect
        label="Target app"
        onChange={(targetAppId) => onChange({ targetAppId, recordingSessionId: "", topicId: "all" })}
        value={filters.targetAppId}
      >
        <option value="">All target apps</option>
        {targetApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
      </FilterSelect>
      <FilterSelect
        label="Training session"
        onChange={(recordingSessionId) => onChange({ recordingSessionId, topicId: "all" })}
        value={filters.recordingSessionId}
      >
        <option value="">All training sessions</option>
        {recordingSessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
      </FilterSelect>
      <FilterSelect
        label="Topic"
        onChange={(topicId) => onChange({ topicId })}
        value={filters.topicId}
      >
        <option value="all">All topics</option>
        {topics.map((topic) => <option key={topic.id} value={topic.id}>{topic.title}</option>)}
      </FilterSelect>
      <div className="flex items-end">
        <button
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
          onClick={onApply}
          type="button"
        >
          <ListFilter className="h-4 w-4" />
          Filter
        </button>
      </div>
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

function SuggestionTable({ onApprove, onDelete, onEdit, onReject, page, pageSize, processingId, setPage, statusFilter, suggestions, totalRows }: {
  onApprove(suggestion: HealingSuggestion): void;
  onDelete(suggestion: HealingSuggestion): void;
  onEdit(suggestion: HealingSuggestion): void;
  onReject(suggestion: HealingSuggestion): void;
  page: number;
  pageSize: number;
  processingId: string | null;
  setPage(page: number): void;
  statusFilter: HealingSuggestion["status"];
  suggestions: HealingSuggestion[];
  totalRows: number;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const firstRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = Math.min(totalRows, page * pageSize);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="w-14 px-3 py-3">Sno</th>
              <th className="px-3 py-3">Decision</th>
              <th className="px-3 py-3">Training session</th>
              <th className="px-3 py-3">Topic</th>
              <th className="px-3 py-3">Step</th>
              <th className="px-3 py-3">Confidence</th>
              <th className="px-3 py-3">Attempts</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suggestions.map((suggestion, index) => {
              const confidence = numericConfidence(suggestion.confidence_score);
              const decision = userDecisionLabel(suggestion.healing_reason);
              const processing = processingId === suggestion.id;
              return (
                <tr className="h-12 whitespace-nowrap hover:bg-slate-50" key={suggestion.id}>
                  <td className="px-3 py-2 text-xs font-semibold text-slate-500">{(page - 1) * pageSize + index + 1}</td>
                  <td className="px-3 py-2">
                    <Badge tone={decision.includes("accepted") ? "emerald" : decision.includes("rejected") ? "red" : decision.includes("skipped") ? "amber" : "slate"}>{decision}</Badge>
                  </td>
                  <td className="max-w-[260px] px-3 py-2">
                    <p className="truncate text-slate-900">{suggestion.session_title || "No training session"}</p>
                  </td>
                  <td className="max-w-[220px] px-3 py-2">
                    <p className="truncate text-slate-900">{suggestion.topic_title || "No topic"}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-700">Step {suggestion.step_order}</td>
                  <td className="px-3 py-2 text-slate-700">{confidence.toFixed(0)}%</td>
                  <td className="px-3 py-2 text-slate-700">{suggestion.playback_attempt_count}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      {statusFilter === "pending" ? (
                        <>
                          <IconButton disabled={processing} label="Edit" onClick={() => onEdit(suggestion)}><Pencil className="h-3.5 w-3.5" /></IconButton>
                          <IconButton disabled={processing} label="Approve" onClick={() => onApprove(suggestion)} tone="approve"><Check className="h-3.5 w-3.5" /></IconButton>
                          <IconButton disabled={processing} label="Reject" onClick={() => onReject(suggestion)} tone="reject"><X className="h-3.5 w-3.5" /></IconButton>
                        </>
                      ) : null}
                      <IconButton disabled={processing} label="Delete" onClick={() => onDelete(suggestion)} tone="delete"><Trash2 className="h-3.5 w-3.5" /></IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-3 py-3 text-sm text-slate-600">
        <span>Showing {firstRow}-{lastRow} of {totalRows}</span>
        <div className="flex items-center gap-2">
          <button
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage(Math.max(1, page - 1))}
            type="button"
          >
            Previous
          </button>
          <span className="text-xs font-semibold text-slate-500">Page {page} of {totalPages}</span>
          <button
            className="h-8 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            type="button"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

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
          {userDecision && <Badge tone={userDecision === "accepted" ? "emerald" : userDecision === "rejected" ? "red" : "amber"}>{userDecisionLabel(suggestion.healing_reason)}</Badge>}
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

function SelectorList({ candidates, compact = false }: { candidates: SelectorCandidate[]; compact?: boolean }) {
  if (candidates.length === 0) {
    return compact ? null : <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">No replacement selectors were captured.</p>;
  }
  return (
    <div className={`grid gap-1 ${compact ? "mt-2" : ""}`}>
      {compact ? null : <p className="text-xs font-semibold uppercase text-slate-500">Captured selectors</p>}
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
  onSave(edited: TargetElement): void;
  processing: boolean;
}) {
  const [target, setTarget] = useState<TargetElement>(data.editedTarget);

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
          <EditableControlDetails disabled={processing} onChange={setTarget} target={target} />
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
          <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50" disabled={processing} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={processing || (target.selectorCandidates ?? []).length === 0} onClick={() => onSave(target)} type="button">{processing ? "Saving..." : "Save and approve"}</button>
        </div>
      </div>
    </div>
  );
}

function EditableControlDetails({ disabled, onChange, target }: { disabled?: boolean; onChange(target: TargetElement): void; target: TargetElement }) {
  function patchTarget(patch: Partial<TargetElement>) {
    onChange({ ...target, ...patch });
  }

  function patchCandidate(index: number, patch: Partial<SelectorCandidate>) {
    patchTarget({ selectorCandidates: (target.selectorCandidates ?? []).map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate) });
  }

  function addCandidate() {
    patchTarget({ selectorCandidates: [...(target.selectorCandidates ?? []), { type: "css", value: "", confidence: 0.5, reason: "Trainer-added selector" }] });
  }

  function deleteCandidate(index: number) {
    patchTarget({ selectorCandidates: (target.selectorCandidates ?? []).filter((_, candidateIndex) => candidateIndex !== index) });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-700">Control identification details</p>
          <p className="mt-1 truncate text-[11px] text-slate-500">{controlIdentifierText(target)}</p>
        </div>
        <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" disabled={disabled} onClick={addCandidate} type="button">Add selector</button>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-3">
        <p className="text-[11px] text-slate-500">Fine tune how Scout finds this control during playback.</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <TargetTextField disabled={disabled} label="Fallback text" onChange={(value) => patchTarget({ fallbackText: value })} value={target.fallbackText} />
        <TargetTextField disabled={disabled} label="Tag name" onChange={(value) => patchTarget({ tagName: value })} value={target.tagName} />
        <TargetTextField disabled={disabled} label="Role" onChange={(value) => patchTarget({ role: value })} value={target.role} />
        <TargetTextField disabled={disabled} label="Accessible name" onChange={(value) => patchTarget({ accessibleName: value })} value={target.accessibleName} />
        <TargetTextField disabled={disabled} label="Label text" onChange={(value) => patchTarget({ labelText: value })} value={target.labelText} />
        <TargetTextField disabled={disabled} label="Visible text" onChange={(value) => patchTarget({ text: value })} value={target.text} />
        <TargetTextField disabled={disabled} label="ARIA label" onChange={(value) => patchTarget({ ariaLabel: value })} value={target.ariaLabel} />
        <TargetTextField disabled={disabled} label="Placeholder" onChange={(value) => patchTarget({ placeholder: value })} value={target.placeholder} />
        <TargetTextField disabled={disabled} label="Name" onChange={(value) => patchTarget({ name: value })} value={target.name} />
        <TargetTextField disabled={disabled} label="Input type" onChange={(value) => patchTarget({ inputType: value })} value={target.inputType} />
        <TargetTextField disabled={disabled} label="Selected option text" onChange={(value) => patchTarget({ selectedOptionText: value })} value={target.selectedOptionText} />
        <TargetTextField disabled={disabled} label="Nearby heading" onChange={(value) => patchTarget({ nearbyHeading: value })} value={target.nearbyHeading} />
        <TargetTextField disabled={disabled} label="Parent container text" onChange={(value) => patchTarget({ parentContainerText: value })} value={target.parentContainerText} />
        <TargetTextField disabled={disabled} label="Previous sibling text" onChange={(value) => patchTarget({ previousSiblingText: value })} value={target.previousSiblingText} />
        <TargetTextField disabled={disabled} label="Next sibling text" onChange={(value) => patchTarget({ nextSiblingText: value })} value={target.nextSiblingText} />
        <TargetTextField disabled={disabled} label="Parent tag name" onChange={(value) => patchTarget({ parentTagName: value })} value={target.parentTagName} />
        <TargetTextField disabled={disabled} label="Parent role" onChange={(value) => patchTarget({ parentRole: value })} value={target.parentRole} />
        <TargetTextField disabled={disabled} label="Parent accessible name" onChange={(value) => patchTarget({ parentAccessibleName: value })} value={target.parentAccessibleName} />
        <TargetTextField disabled={disabled} label="Parent text" onChange={(value) => patchTarget({ parentText: value })} value={target.parentText} />
        <TargetTextField disabled={disabled} label="Form title" onChange={(value) => patchTarget({ formTitle: value })} value={target.formTitle} />
        <TargetTextField disabled={disabled} label="Dialog title" onChange={(value) => patchTarget({ dialogTitle: value })} value={target.dialogTitle} />
        <TargetTextField disabled={disabled} label="Card title" onChange={(value) => patchTarget({ cardTitle: value })} value={target.cardTitle} />
        <TargetTextField disabled={disabled} label="CSS fallback" onChange={(value) => patchTarget({ cssFallback: value })} value={target.cssFallback} />
        <TargetTextField disabled={disabled} label="XPath fallback" onChange={(value) => patchTarget({ xpathFallback: value })} value={target.xpathFallback} />
      </div>

      <div className="mt-4 grid gap-2">
        <p className="text-xs font-semibold text-slate-700">Selector candidates</p>
        {(target.selectorCandidates ?? []).map((candidate, index) => (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[150px_minmax(0,1fr)_110px_minmax(180px,.7fr)_32px]" key={`${candidate.type}-${index}`}>
            <select className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={disabled} onChange={(event) => patchCandidate(index, { type: event.target.value as SelectorCandidateType })} value={candidate.type}>
              {selectorTypes.map((type) => <option key={type} value={type}>{humanizeKey(type)}</option>)}
            </select>
            <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={disabled} onChange={(event) => patchCandidate(index, { value: event.target.value })} placeholder="Selector value" value={candidate.value} />
            <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={disabled} max={1} min={0} onChange={(event) => patchCandidate(index, { confidence: Number(event.target.value) })} step={0.01} type="number" value={candidate.confidence} />
            <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" disabled={disabled} onChange={(event) => patchCandidate(index, { reason: event.target.value })} placeholder="Reason" value={candidate.reason} />
            <button aria-label="Delete selector" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 text-red-700 hover:bg-red-50 disabled:opacity-40" disabled={disabled} onClick={() => deleteCandidate(index)} title="Delete selector" type="button"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TargetTextField({ disabled, label, onChange, value }: { disabled?: boolean; label: string; onChange: (value: string | undefined) => void; value?: string }) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
      {label}
      <input className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-900 outline-none focus:border-slate-900" disabled={disabled} onChange={(event) => onChange(event.target.value || undefined)} value={value ?? ""} />
    </label>
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

function targetFromSuggestion(suggestion: HealingSuggestion): TargetElement {
  const proposed = suggestion.proposed_element_identity as (ElementIdentity & Partial<TargetElement>) | undefined;
  const identity = proposed?.elementIdentity ?? proposed ?? suggestion.original_element_identity;
  const selectorCandidates = proposed?.selectorCandidates ?? suggestion.proposed_selector_candidates ?? [];

  return {
    elementIdentity: identity as TargetElement["elementIdentity"],
    selectorCandidates,
    fallbackText: proposed?.fallbackText || identity?.text || identity?.accessibleName || identity?.labelText || identity?.ariaLabel || identity?.placeholder,
    role: proposed?.role ?? identity?.role,
    tagName: proposed?.tagName ?? identity?.tagName,
    accessibleName: proposed?.accessibleName ?? identity?.accessibleName,
    text: proposed?.text ?? identity?.text,
    ariaLabel: proposed?.ariaLabel ?? identity?.ariaLabel,
    labelText: proposed?.labelText ?? identity?.labelText,
    placeholder: proposed?.placeholder ?? identity?.placeholder,
    inputType: proposed?.inputType ?? identity?.inputType,
    selectedOptionText: proposed?.selectedOptionText ?? identity?.selectedOptionText,
    name: proposed?.name ?? identity?.name,
    id: proposed?.id ?? identity?.id,
    dataAttributes: proposed?.dataAttributes ?? identity?.dataAttributes,
    nearbyHeading: proposed?.nearbyHeading ?? identity?.nearbyHeading,
    parentContainerText: proposed?.parentContainerText ?? identity?.parentContainerText,
    previousSiblingText: proposed?.previousSiblingText ?? identity?.previousSiblingText,
    nextSiblingText: proposed?.nextSiblingText ?? identity?.nextSiblingText,
    parentTagName: proposed?.parentTagName ?? identity?.parentTagName,
    parentRole: proposed?.parentRole ?? identity?.parentRole,
    parentAccessibleName: proposed?.parentAccessibleName ?? identity?.parentAccessibleName,
    parentText: proposed?.parentText ?? identity?.parentText,
    formTitle: proposed?.formTitle ?? identity?.formTitle,
    dialogTitle: proposed?.dialogTitle ?? identity?.dialogTitle,
    cardTitle: proposed?.cardTitle ?? identity?.cardTitle,
    cssFallback: proposed?.cssFallback ?? identity?.cssFallback,
    xpathFallback: proposed?.xpathFallback ?? identity?.xpathFallback,
    boundingBox: proposed?.boundingBox ?? identity?.boundingBox,
  };
}

function controlIdentifierText(target: TargetElement) {
  const bestSelector = target.selectorCandidates?.[0];
  const parts = [
    target.labelText ? `Label: ${target.labelText}` : null,
    target.accessibleName ? `Name: ${target.accessibleName}` : null,
    target.tagName ? `Tag: ${target.tagName}` : null,
    target.role ? `Role: ${target.role}` : null,
    bestSelector ? `Best selector: ${bestSelector.type}` : null
  ].filter(Boolean);

  return parts.join(" | ") || "No control identity details captured.";
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

const selectorTypes: SelectorCandidateType[] = [
  "data-adoption-id",
  "data-testid",
  "data-test",
  "data-cy",
  "id",
  "name",
  "aria-label",
  "role-text",
  "label-text",
  "placeholder",
  "text-context",
  "css",
  "xpath"
];

function humanizeKey(value: string): string {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
