"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Clipboard, Copy, Eye, Play, Plus, RefreshCw, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import type { Jodit as JoditInstance } from "jodit";
import type { GuideStatus, GuideStep, SelectorCandidate, SelectorCandidateType, TargetElement } from "@/shared/guideTypes";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowRow, GuidedWorkflowTargetAppRow, GuidedWorkflowTopicRow } from "@/lib/admin/guided-workflows";
import HealingSuggestionReviewer from "./healing-suggestion-reviewer-panel";

type GuidedWorkflowManagerProps = {
  guides: GuidedWorkflowRow[];
  selectedCompanyId: string;
  selectedCompanyName?: string;
  recordingSessions: GuidedWorkflowRecordingSessionRow[];
  targetApps: GuidedWorkflowTargetAppRow[];
};

type EditorState = {
  title: string;
  description: string;
  status: GuideStatus;
  preWorkflowConfirmationHtml: string;
  preWorkflowConfirmationEnabled: boolean;
  steps: GuideStep[];
};

type SessionDetailsState = {
  session: GuidedWorkflowRecordingSessionRow | null;
  actions: Array<{
    id: string;
    type: string;
    url: string;
    timestamp: number;
    labelText?: string | null;
    ariaLabel?: string | null;
    elementText?: string | null;
    nearbyText?: string | null;
    tagName?: string | null;
  }>;
};

type ConfirmDialog = {
  message: string;
  confirmLabel: string;
  confirmClassName: string;
  onConfirm: () => void;
} | null;

type HealingSuggestionSummary = {
  id: string;
  step_id: string;
};

function getScoutBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function GuidedWorkflowManager({ guides, selectedCompanyId, selectedCompanyName, recordingSessions, targetApps }: GuidedWorkflowManagerProps) {
  const [apps, setApps] = useState(targetApps);
  const [sessions, setSessions] = useState(recordingSessions);
  const [items, setItems] = useState(guides);
  const companyGuides = useMemo(() => items.filter((guide) => !selectedCompanyId || guide.companyId === selectedCompanyId), [items, selectedCompanyId]);
  const [selectedId, setSelectedId] = useState(companyGuides[0]?.id ?? "");
  const selected = useMemo(() => companyGuides.find((guide) => guide.id === selectedId) ?? companyGuides[0] ?? null, [companyGuides, selectedId]);
  const [editor, setEditor] = useState<EditorState>(() => editorFromGuide(selected));
  const [setupForm, setSetupForm] = useState({
    companyId: selectedCompanyId,
    targetAppMode: "new",
    targetAppId: "",
    appName: "",
    baseUrl: "",
    allowedOrigins: "",
    sessionTitle: "New training session"
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(recordingSessions[0]?.id ?? null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(recordingSessions[0]?.topics[0]?.id ?? null);
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set(recordingSessions.map((session) => session.id)));
  const [sessionDetails, setSessionDetails] = useState<SessionDetailsState>({ session: null, actions: [] });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>({ status: "idle", message: "" });
  const firstTargetAppId = apps.find((app) => app.companyId === selectedCompanyId)?.id ?? "";
  const [draftFilters, setDraftFilters] = useState({ targetAppId: firstTargetAppId, title: "" });
  const [filters, setFilters] = useState({ targetAppId: firstTargetAppId, title: "" });
  const filterApps = apps.filter((app) => app.companyId === selectedCompanyId);
  const filteredSessions = useMemo(() => sessions.filter((session) => {
    const matchesCompany = session.companyId === selectedCompanyId;
    const matchesTargetApp = session.targetAppId === filters.targetAppId;
    const filterTitle = filters.title.trim().toLowerCase();
    const matchesTitle = !filterTitle || session.title.toLowerCase().includes(filterTitle) || session.topics.some((topic) => topic.title.toLowerCase().includes(filterTitle));
    return matchesCompany && matchesTargetApp && matchesTitle;
  }), [filters.targetAppId, filters.title, selectedCompanyId, sessions]);
  const selectedSession = useMemo(() => sessions.find((session) => session.id === selectedSessionId) ?? null, [sessions, selectedSessionId]);
  const selectedTopic = useMemo(() => sessions.flatMap((session) => session.topics).find((topic) => topic.id === selectedTopicId) ?? null, [sessions, selectedTopicId]);
  const selectedRecorderConfig = selectedSession && selectedTopic ? recorderConfigForTopic(selectedTopic, selectedSession) : null;

  useEffect(() => {
    const nextApps = apps.filter((app) => app.companyId === selectedCompanyId);
    if (!nextApps.some((app) => app.id === draftFilters.targetAppId)) {
      setDraftFilters((current) => ({ ...current, targetAppId: nextApps[0]?.id ?? "" }));
    }
  }, [apps, draftFilters.targetAppId, selectedCompanyId]);

  useEffect(() => {
    const nextTargetAppId = apps.find((app) => app.companyId === selectedCompanyId)?.id ?? "";
    setSetupForm((current) => ({
      ...current,
      companyId: selectedCompanyId,
      targetAppId: current.targetAppMode === "existing" ? nextTargetAppId : current.targetAppId
    }));
    setDraftFilters({ targetAppId: nextTargetAppId, title: "" });
    setFilters({ targetAppId: nextTargetAppId, title: "" });
  }, [apps, selectedCompanyId]);

  useEffect(() => {
    const allTopicIds = new Set(filteredSessions.flatMap((session) => session.topics.map((topic) => topic.id)));
    const nextSession = filteredSessions[0] ?? null;
    const nextTopic = filteredSessions.flatMap((session) => session.topics)[0] ?? null;
    setSelectedTopicId((current) => (current && allTopicIds.has(current) ? current : nextTopic?.id ?? null));
    setSelectedSessionId((current) => (current && filteredSessions.some((session) => session.id === current) ? current : nextSession?.id ?? null));
  }, [filteredSessions]);

  useEffect(() => {
    if (!selectedTopic?.guideId) return;
    const guide = items.find((item) => item.id === selectedTopic.guideId);
    if (!guide || selectedId === guide.id) return;
    setSelectedId(guide.id);
    setEditor(editorFromGuide(guide));
  }, [items, selectedId, selectedTopic?.guideId]);

  useEffect(() => {
    if (!selectedTopicId) {
      setSessionDetails({ session: null, actions: [] });
      return;
    }

    let cancelled = false;

    async function refreshSessionDetails() {
      try {
        const response = await fetch(`/api/admin/guided-workflow-topics/${selectedTopicId}`);
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        setSessionDetails({
          session: selectedSession ?? null,
          actions: Array.isArray(body?.actions) ? body.actions : []
        });
        if (body?.topic) {
          setSessions((current) => current.map((session) => session.id === body.topic.recordingSessionId ? { ...session, topics: session.topics.map((topic) => topic.id === body.topic.id ? body.topic : topic) } : session));
        }

        if (body?.topic?.guideId) {
          const guideResponse = await fetch(`/api/admin/guided-workflows/${body.topic.guideId}`);
          const guideBody = await guideResponse.json().catch(() => null);
          if (!cancelled && guideBody?.guide) {
            setItems((current) => {
              const existing = current.find((guide) => guide.id === guideBody.guide.id);
              if (existing && JSON.stringify(existing) === JSON.stringify(guideBody.guide)) {
                return current;
              }
              return existing
                ? current.map((guide) => guide.id === guideBody.guide.id ? guideBody.guide : guide)
                : [guideBody.guide, ...current];
            });
            setSelectedId(guideBody.guide.id);
            setEditor((current) => {
              const displayedGuide = items.find((guide) => guide.id === selectedId);
              const hasLocalEdits = Boolean(displayedGuide && selectedId === guideBody.guide.id && editorHasChanges(current, displayedGuide));
              return hasLocalEdits ? current : editorFromGuide(guideBody.guide);
            });
          }
        }
      } catch {
        if (!cancelled) {
          setSessionDetails({ session: null, actions: [] });
        }
      }
    }

    void refreshSessionDetails();
    const intervalId = window.setInterval(() => void refreshSessionDetails(), 5000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [items, selectedId, selectedSession, selectedTopicId]);

  function selectGuide(guide: GuidedWorkflowRow) {
    setSelectedId(guide.id);
    setEditor(editorFromGuide(guide));
    setState({ status: "idle", message: "" });
  }

  function updateSetup(next: Partial<typeof setupForm>) {
    setSetupForm((current) => ({ ...current, ...next }));
  }

  function chooseExistingTargetApp(targetAppId: string) {
    const app = apps.find((item) => item.id === targetAppId);

    setSetupForm((current) => ({
      ...current,
      targetAppId,
      appName: app?.name ?? "",
      baseUrl: app?.baseUrl ?? "",
      allowedOrigins: app?.allowedOrigins.join("\n") ?? "",
    }));
  }

  async function createTargetAppFromSetup() {
    setState({ status: "submitting", message: "" });
    const response = await fetch("/api/admin/guided-workflow-target-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompanyId,
        name: setupForm.appName,
        baseUrl: setupForm.baseUrl,
        allowedOrigins: splitLines(setupForm.allowedOrigins),
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to create target app." });
      return;
    }

    setApps((current) => [...current, body.targetApp]);
    setSetupForm((current) => ({
      ...current,
      targetAppMode: "existing",
      companyId: body.targetApp.companyId,
      targetAppId: body.targetApp.id,
      appName: body.targetApp.name,
      baseUrl: body.targetApp.baseUrl,
      allowedOrigins: body.targetApp.allowedOrigins.join("\n"),
    }));
    return body.targetApp.id as string;
  }

  async function createRecordingSession() {
    setState({ status: "submitting", message: "" });
    let targetAppId: string | undefined = setupForm.targetAppMode === "existing" ? setupForm.targetAppId : "";

    if (setupForm.targetAppMode === "new") {
      targetAppId = await createTargetAppFromSetup();
    }

    if (!targetAppId) {
      setState({ status: "error", message: "Select or create a target app before creating a training session." });
      return;
    }

    const response = await fetch("/api/admin/guided-workflow-recording-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompanyId,
        targetAppId,
        title: setupForm.sessionTitle
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to create recording session." });
      return;
    }

    setSessions((current) => [body.session, ...current]);
    setState({ status: "success", message: "Recording session created. Copy the recorder config into the trainer extension." });
  }

  function updateSessionTitleLocally(sessionId: string, title: string) {
    const trimmedValue = title.trim();
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, title: trimmedValue || session.title } : session));
    if (selectedSessionId === sessionId) {
      setSessionDetails((current) => current.session && current.session.id === sessionId ? { ...current, session: { ...current.session, title: trimmedValue || current.session.title } } : current);
    }
  }

  async function saveSessionTitle(sessionId: string, title: string) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setState({ status: "error", message: "Session title cannot be empty." });
      return;
    }

    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: trimmedTitle })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to update session title." });
      return;
    }

    setSessions((current) => current.map((session) => session.id === body.session.id ? body.session : session));
    setSessionDetails((current) => current.session && current.session.id === sessionId ? { ...current, session: body.session } : current);
    setState({ status: "success", message: "Session title updated." });
  }

  async function deleteSession(sessionId: string) {
    if (!window.confirm("Delete this recording session?")) return;

    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to delete session." });
      return;
    }

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    if (selectedSessionId === sessionId) {
      const nextSelection = sessions.find((session) => session.id !== sessionId)?.id ?? null;
      setSelectedSessionId(nextSelection);
    }
    setState({ status: "success", message: "Recording session deleted." });
  }

  async function applyTopicRecording(topic: GuidedWorkflowTopicRow, action: "halt" | "restart") {
    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordingAction: action })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to change the training recording state." });
      return;
    }

    setSessions((current) => current.map((session) => session.id === body.topic.recordingSessionId
      ? { ...session, topics: session.topics.map((item) => item.id === body.topic.id ? body.topic : item) }
      : session));
    setState({ status: "success", message: action === "halt" ? "Training halted. The previous recorder config is now invalid." : "Training restarted with a new recorder token." });
  }

  function setTopicRecording(topic: GuidedWorkflowTopicRow, action: "halt" | "restart") {
    const message = action === "halt"
      ? "Halt training for this topic? The current recorder token will stop working immediately. Existing recorded steps will be kept."
      : "Restart training for this topic? A new recorder token will be generated and all previous recorder configs will remain invalid.";

    setConfirmDialog({
      message,
      confirmLabel: action === "halt" ? "Halt training" : "Restart training",
      confirmClassName: action === "halt"
        ? "rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
        : "rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800",
      onConfirm: () => {
        setConfirmDialog(null);
        void applyTopicRecording(topic, action);
      }
    });
  }

  async function convertTopic(topicId: string) {
    const topic = sessions.flatMap((session) => session.topics).find((item) => item.id === topicId);
    if (topic?.guideId && selected?.id === topic.guideId) {
      const guideDirty = editorHasChanges(editor, selected);
      const hasNewSyncedActions = topic.actionsCount > selected.recordedActions.length;

      if (guideDirty && !hasNewSyncedActions) {
        await saveGuide("draft");
        return;
      }

      if (guideDirty) {
        await saveGuide("draft", { silent: true });
      }
    }

    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${topic?.recordingSessionId ?? selectedSessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convert: true, topicId })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to generate guide from session." });
      return;
    }

    setItems((current) => [body.guide, ...current]);
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setSessions((current) => current.map((session) => session.id === topic?.recordingSessionId ? { ...session, topics: session.topics.map((item) => item.id === topicId ? { ...item, guideId: body.guide.id, status: body.guide.status } : item) } : session));
    setState({ status: "success", message: topic?.guideId ? "Topic draft updated." : "Topic draft generated from the synced actions." });
  }

  async function publishTopicGuide(topic: GuidedWorkflowTopicRow) {
    if (!topic.guideId) {
      setState({ status: "error", message: "Create a topic draft before publishing." });
      return;
    }

    if (selected?.id === topic.guideId) {
      await saveGuide("published");
      return;
    }

    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflows/${topic.guideId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to publish guide." });
      return;
    }

    setItems((current) => current.map((guide) => guide.id === body.guide.id ? body.guide : guide));
    if (body.guide.topicId) {
      setSessions((current) => current.map((session) => session.id === body.guide.recordingSessionId ? { ...session, topics: session.topics.map((topic) => topic.id === body.guide.topicId ? { ...topic, guideId: body.guide.id, status: body.guide.status } : topic) } : session));
    }
    setSessions((current) => current.map((session) => session.id === topic.recordingSessionId ? { ...session, topics: session.topics.map((item) => item.id === topic.id ? { ...item, status: body.guide.status } : item) } : session));
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setState({ status: "success", message: "Guide published. Refresh the target app to see it." });
  }

  async function saveGuide(nextStatus?: GuideStatus, options?: { silent?: boolean }) {
    if (!selected) return;
    if (!options?.silent) {
      setState({ status: "submitting", message: "" });
    }
    const response = await fetch(`/api/admin/guided-workflows/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editor.title,
        description: editor.description,
        status: nextStatus ?? editor.status,
        preWorkflowConfirmationHtml: editor.preWorkflowConfirmationHtml,
        preWorkflowConfirmationEnabled: editor.preWorkflowConfirmationEnabled,
        steps: editor.steps.map((step, index) => ({ ...step, enabled: step.enabled !== false, order: index + 1 }))
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      if (!options?.silent) {
        setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to save guide." });
      }
      return;
    }

    setItems((current) => current.map((guide) => guide.id === body.guide.id ? body.guide : guide));
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    if (!options?.silent) {
      setState({ status: "success", message: nextStatus === "published" ? "Guide saved and published. Refresh the target app to see it." : "Guide saved." });
    }
  }

  async function regenerateGuide() {
    if (!selected) return;
    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflows/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regenerate: true })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to regenerate guide." });
      return;
    }

    setItems((current) => current.map((guide) => guide.id === body.guide.id ? body.guide : guide));
    setEditor(editorFromGuide(body.guide));
    setState({ status: "success", message: "Guide draft regenerated from recorded actions." });
  }

  function updateStep(index: number, patch: Partial<GuideStep>) {
    setEditor((current) => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) }));
  }

  function updatePreWorkflowConfirmation(html: string, enabled: boolean) {
    setEditor((current) => ({
      ...current,
      status: "draft",
      preWorkflowConfirmationHtml: html,
      preWorkflowConfirmationEnabled: Boolean(enabled && html.trim())
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setEditor((current) => {
      const next = [...current.steps];
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= next.length) return current;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...current, steps: next.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 })) };
    });
  }

  async function hardDeleteStep(index: number) {
    if (!selected) return;
    const step = editor.steps[index];
    if (!step) return;

    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflows/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleteStepId: step.id })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to delete step." });
      return;
    }

    setItems((current) => current.map((guide) => guide.id === body.guide.id ? body.guide : guide));
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setSessionDetails((current) => ({
      ...current,
      actions: step.actionSourceId ? current.actions.filter((action) => action.id !== step.actionSourceId) : current.actions
    }));
    if (selectedTopicId) {
      setSessions((current) => current.map((session) => session.id === (body.guide.recordingSessionId ?? selectedSessionId)
        ? {
          ...session,
          topics: session.topics.map((topic) => topic.id === selectedTopicId
            ? {
              ...topic,
              actionsCount: step.actionSourceId ? Math.max(0, topic.actionsCount - 1) : topic.actionsCount,
              status: body.guide.status
            }
            : topic)
        }
        : session));
    }
    setState({ status: "success", message: "Step deleted." });
  }

  function exportGuide() {
    if (!selected) return;
    downloadJson(`${slug(editor.title) || "guide"}.json`, { ...selected, title: editor.title, description: editor.description, status: editor.status, steps: editor.steps });
  }

  return (
    <div className="grid gap-6">
      {state.message ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{state.message}</p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
          <Field label="Company">
            <div className="input flex h-10 items-center bg-slate-50 text-slate-600">{selectedCompanyName || "Selected company"}</div>
          </Field>
          <Field label="Target app">
            <select className="input" onChange={(event) => setDraftFilters((current) => ({ ...current, targetAppId: event.target.value, title: "" }))} required value={draftFilters.targetAppId}>
              {filterApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
            </select>
          </Field>
          <Field label="Training session title">
            <input className="input" onChange={(event) => setDraftFilters((current) => ({ ...current, title: event.target.value }))} placeholder="Filter by title" value={draftFilters.title} />
          </Field>
          <button
            className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!draftFilters.targetAppId}
            onClick={() => setFilters(draftFilters)}
            type="button"
          >
            <Search className="h-4 w-4" />Filter
          </button>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Training Sessions">
          {filteredSessions.length === 0 ? (
            <p className="text-sm text-slate-500">No training sessions yet.</p>
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
              {filteredSessions.map((session) => {
                const collapsed = collapsedSessionIds.has(session.id);
                return (
                  <div className="rounded-lg border border-slate-200 bg-white p-2" key={session.id}>
                    <button
                      className="flex w-full items-center gap-2 text-left"
                      onClick={() => setCollapsedSessionIds((current) => {
                        const next = new Set(current);
                        if (next.has(session.id)) next.delete(session.id);
                        else next.add(session.id);
                        return next;
                      })}
                      type="button"
                    >
                      <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${collapsed ? "-rotate-90" : ""}`} />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{session.title}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{session.topics.length}</span>
                    </button>
                    {!collapsed ? (
                      <div className="mt-2 grid gap-1 pl-6">
                        {session.topics.length === 0 ? (
                          <p className="text-xs text-slate-500">No topics yet.</p>
                        ) : session.topics.map((topic) => {
                          const active = selectedTopicId === topic.id;
                          return (
                            <button
                              className={`w-full rounded-md border px-2 py-2 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                              key={topic.id}
                              onClick={() => {
                                setSelectedSessionId(session.id);
                                setSelectedTopicId(topic.id);
                              }}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="min-w-0 truncate text-xs font-semibold">{topic.title}</span>
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${active ? "bg-white/15 text-white" : topic.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{topic.status}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <SessionDetailsPanel
          convertTopic={convertTopic}
          deleteSession={deleteSession}
          deleteStep={hardDeleteStep}
          editor={editor}
          guides={items}
          moveStep={moveStep}
          publishTopicGuide={publishTopicGuide}
          recorderConfig={selectedRecorderConfig}
          setTopicRecording={setTopicRecording}
          selectedSession={selectedSession}
          selectedTopic={selectedTopic}
          sessionDetails={sessionDetails}
          trainingSessions={filteredSessions}
          updatePreWorkflowConfirmation={updatePreWorkflowConfirmation}
          updateStep={updateStep}
        />
      </section>

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-200">
            <p className="mb-6 text-sm text-slate-900">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                onClick={() => setConfirmDialog(null)}
                type="button"
              >
                Cancel
              </button>
              <button
                className={confirmDialog.confirmClassName}
                onClick={confirmDialog.onConfirm}
                type="button"
              >
                {confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SessionDetailsPanel({ convertTopic, deleteSession, deleteStep, editor, guides, moveStep, publishTopicGuide, recorderConfig, selectedSession, selectedTopic, sessionDetails, setTopicRecording, trainingSessions, updatePreWorkflowConfirmation, updateStep }: {
  convertTopic(topicId: string): void;
  deleteSession(sessionId: string): void;
  deleteStep(index: number): void;
  editor: EditorState;
  guides: GuidedWorkflowRow[];
  moveStep(index: number, direction: -1 | 1): void;
  publishTopicGuide(topic: GuidedWorkflowTopicRow): void;
  recorderConfig: { scoutBaseUrl: string; recorderToken: string; sessionTitle: string; recordingSessionId: string; topicId: string; ingestPath: string } | null;
  setTopicRecording(topic: GuidedWorkflowTopicRow, action: "halt" | "restart"): void;
  selectedSession: GuidedWorkflowRecordingSessionRow | null;
  selectedTopic: GuidedWorkflowTopicRow | null;
  sessionDetails: SessionDetailsState;
  trainingSessions: GuidedWorkflowRecordingSessionRow[];
  updatePreWorkflowConfirmation(html: string, enabled: boolean): void;
  updateStep(index: number, patch: Partial<GuideStep>): void;
}) {
  const [copiedKey, setCopiedKey] = useState("");
  const [configTab, setConfigTab] = useState<"recorder" | "snippet">("recorder");
  const [openStepIds, setOpenStepIds] = useState<Set<string>>(() => new Set());
  const [introEditorOpen, setIntroEditorOpen] = useState(false);
  const [introDraft, setIntroDraft] = useState("");
  const [healingReviewStepId, setHealingReviewStepId] = useState<string | null>(null);
  const [pendingHealingCounts, setPendingHealingCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedTopic?.guideId) {
      setConfigTab("recorder");
    }
  }, [selectedTopic?.guideId]);

  useEffect(() => {
    setOpenStepIds((current) => {
      const validIds = new Set(editor.steps.map((step) => step.id));
      return new Set(Array.from(current).filter((id) => validIds.has(id)));
    });
  }, [editor.steps]);

  useEffect(() => {
    if (!selectedTopic?.guideId) {
      setPendingHealingCounts({});
      return;
    }

    let cancelled = false;

    async function loadPendingHealingCounts() {
      try {
        const params = new URLSearchParams({ status: "pending", workflowId: selectedTopic?.guideId ?? "" });
        const response = await fetch(`/api/guided-workflow-player/healing-suggestions?${params.toString()}`);
        const body = await response.json().catch(() => null);
        if (cancelled) return;
        const counts: Record<string, number> = {};
        (Array.isArray(body?.suggestions) ? body.suggestions : []).forEach((suggestion: HealingSuggestionSummary) => {
          counts[suggestion.step_id] = (counts[suggestion.step_id] ?? 0) + 1;
        });
        setPendingHealingCounts(counts);
      } catch {
        if (!cancelled) setPendingHealingCounts({});
      }
    }

    void loadPendingHealingCounts();
    const intervalId = window.setInterval(() => void loadPendingHealingCounts(), 15000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [selectedTopic?.guideId]);

  if (!selectedSession || !selectedTopic) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Select a topic from the list to inspect the recorded steps.
      </section>
    );
  }

  const sessionGuide = selectedTopic.guideId ? guides.find((guide) => guide.id === selectedTopic.guideId) ?? null : null;
  const guidePublished = sessionGuide?.status === "published";
  const guideSteps = sessionGuide ? editor.steps : [];
  const syncedActionCount = selectedTopic.actionsCount;
  const guideDirty = Boolean(sessionGuide && editorHasChanges(editor, sessionGuide));
  const hasNewSyncedActions = Boolean(sessionGuide && syncedActionCount > sessionGuide.recordedActions.length);
  const canUpdateDraft = Boolean(sessionGuide && (guideDirty || hasNewSyncedActions));
  const canPublish = Boolean(sessionGuide && sessionGuide.status === "draft" && guideSteps.length > 0 && !guideDirty && !hasNewSyncedActions);
  const workflowConfirmationHtml = editor.preWorkflowConfirmationHtml ?? "";
  const hasWorkflowConfirmation = Boolean(workflowConfirmationHtml.trim());
  const workflowConfirmationEnabled = Boolean(editor.preWorkflowConfirmationEnabled && hasWorkflowConfirmation);
  const canCreateWorkflowConfirmation = Boolean(sessionGuide);

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1200);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold text-slate-950">{selectedSession.title}</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{selectedTopic.title}</p>
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Synced actions:</span> {syncedActionCount} • <span className="font-medium text-slate-700">Created:</span> {formatDate(selectedSession.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canUpdateDraft}
              onClick={() => convertTopic(selectedTopic.id)}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />Save guide draft
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              disabled={!canPublish}
              onClick={() => publishTopicGuide(selectedTopic)}
              type="button"
            >
              <Play className="h-4 w-4" />Publish
            </button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700" onClick={() => deleteSession(selectedSession.id)} type="button">
              <Trash2 className="h-4 w-4" />Delete
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          {syncedActionCount === 0
              ? "Record and sync at least one action in this session to create a draft guide."
            : selectedTopic.guideId
              ? guideDirty ? "Save draft changes before publishing." : hasNewSyncedActions ? "New synced steps are waiting. Save the guide draft before publishing." : guidePublished ? "This session is published. Add or edit steps to enable another update." : "This draft is ready to publish."
              : "Synced steps are being converted into a draft guide."}
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold ${configTab === "recorder" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setConfigTab("recorder")} type="button"><Clipboard className="h-3.5 w-3.5" />Recorder config</button>
              <button className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold ${configTab === "snippet" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!guidePublished} onClick={() => setConfigTab("snippet")} type="button"><Copy className="h-3.5 w-3.5" />Install snippet</button>
            </div>
            {configTab === "recorder" && selectedTopic ? (
              <div className="flex flex-wrap gap-2">
                {recorderConfig ? <button className="button-secondary h-8 gap-2 px-3 text-xs" onClick={() => copyText("recorder-config", JSON.stringify(recorderConfig, null, 2))} type="button">
                  {copiedKey === "recorder-config" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedKey === "recorder-config" ? "Copied" : "Copy config"}
                </button> : null}
                {selectedTopic.recordingEnabled ? (
                  <button
                    className="button-secondary h-8 gap-2 px-3 text-xs !border-red-200 !text-red-700 hover:!bg-red-50"
                    onClick={() => setTopicRecording(selectedTopic, "halt")}
                    type="button"
                  >
                    Halt training
                  </button>
                ) : (
                  <button
                    className="h-8 rounded-lg px-3 text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800"
                    onClick={() => setTopicRecording(selectedTopic, "restart")}
                    type="button"
                  >
                    Restart training
                  </button>
                )}
              </div>
            ) : configTab === "snippet" && guidePublished ? (
              <button className="button-secondary h-8 gap-2 px-3 text-xs" onClick={() => copyText("install-snippet", installSnippet(selectedSession.targetAppId ?? ""))} type="button">
                {copiedKey === "install-snippet" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedKey === "install-snippet" ? "Copied" : "Copy snippet"}
              </button>
            ) : null}
          </div>
          {configTab === "recorder" ? (
            recorderConfig ? (
              <div>
                <p className="mt-3 text-xs text-slate-500">Copy this into the trainer extension for this training session.</p>
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{JSON.stringify(recorderConfig, null, 2)}</pre>
              </div>
            ) : (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">Training is not accepting new recordings.</p>
                <p className="mt-1 text-xs text-amber-800">The recorder config was removed and its token is invalid. Restart training to generate a new recorder config and token.</p>
              </div>
            )
          ) : guidePublished ? (
            <div>
              <p className="mt-3 text-xs text-slate-500">Paste this into the target app to show the guided navigation player.</p>
              <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{installSnippet(selectedSession.targetAppId ?? "")}</pre>
            </div>
          ) : null}
        </div>

        <div className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Guide steps</p>
              <p className="mt-1 text-xs text-slate-500">Edit descriptions, delete mistakes, and reorder steps before publishing.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className={`inline-flex items-center gap-2 text-xs font-semibold ${hasWorkflowConfirmation ? "text-slate-700" : "text-slate-400"}`}>
                <input
                  checked={workflowConfirmationEnabled}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950"
                  disabled={!hasWorkflowConfirmation}
                  onChange={(event) => updatePreWorkflowConfirmation(workflowConfirmationHtml, event.target.checked)}
                  type="checkbox"
                />
                Show before workflow
              </label>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canCreateWorkflowConfirmation}
                onClick={() => {
                  setIntroDraft(workflowConfirmationHtml);
                  setIntroEditorOpen(true);
                }}
                type="button"
              >
                <Plus className="h-3.5 w-3.5" />
                {hasWorkflowConfirmation ? "Edit start message" : "Create start message"}
              </button>
            </div>
          </div>

          {!sessionGuide ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              {sessionDetails.actions.length === 0 ? "No synced steps yet for this session." : "Create a guide draft to review and edit the synced steps."}
            </p>
          ) : guideSteps.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">This guide has no steps.</p>
          ) : guideSteps.map((step, index) => {
            const isOpen = openStepIds.has(step.id);
            const purpose = step.stepPurpose === "navigation" ? "navigation" : "main";
            const enabled = isStepEnabled(step);
            const activeNumber = enabled ? enabledStepNumber(guideSteps, index) : null;
            const pendingHealingCount = pendingHealingCounts[step.id] ?? 0;

            return (
              <div className={`overflow-hidden rounded-lg border bg-white ${enabled ? "border-slate-200" : "border-slate-200 opacity-60"}`} key={step.id}>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3">
                  <button
                    aria-label={enabled ? "Disable this step during playback" : "Enable this step during playback"}
                    aria-pressed={enabled}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition focus:outline-none focus:ring-2 focus:ring-slate-900 focus:ring-offset-2 ${enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                    onClick={() => updateStep(index, { enabled: !enabled })}
                    title="Enable or disable this step during playback without deleting it."
                    type="button"
                  >
                    <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${enabled ? "left-6" : "left-1"}`} />
                  </button>
                  <button
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => setOpenStepIds((current) => {
                      const next = new Set(current);
                      if (next.has(step.id)) next.delete(step.id);
                      else next.add(step.id);
                      return next;
                    })}
                    type="button"
                  >
                    <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${enabled ? "bg-slate-950 text-white" : "bg-slate-200 text-slate-500"}`}>{activeNumber ?? "-"}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{stepListPreview(step)}</span>
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${purpose === "navigation" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {purpose === "navigation" ? "Navigation Step" : "Main Training Step"}
                  </span>
                  {purpose === "navigation" ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                      {step.navigationMode === "autoClick" ? "Auto-click this control" : "Wait for user click"}
                    </span>
                  ) : null}
                  <div className="flex gap-1">
                    {pendingHealingCount > 0 ? (
                      <button
                        aria-label={`${pendingHealingCount} pending self-healing ${pendingHealingCount === 1 ? "review" : "reviews"}`}
                        className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 shadow-sm hover:bg-amber-100"
                        onClick={() => setHealingReviewStepId(step.id)}
                        title={`${pendingHealingCount} pending self-healing ${pendingHealingCount === 1 ? "review" : "reviews"}`}
                        type="button"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-600 px-1 text-[10px] font-bold text-white">{pendingHealingCount}</span>
                      </button>
                    ) : null}
                    <button aria-label="Move step up" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={index === 0} onClick={() => moveStep(index, -1)} title="Move step up" type="button"><ArrowUp className="h-4 w-4" /></button>
                    <button aria-label="Move step down" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={index === guideSteps.length - 1} onClick={() => moveStep(index, 1)} title="Move step down" type="button"><ArrowDown className="h-4 w-4" /></button>
                    <button aria-label="Delete step" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => deleteStep(index)} title="Delete step" type="button"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="grid gap-4 p-4">
                    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
                      <div className="grid content-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          Step purpose
                          <select
                            className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
                            onChange={(event) => updateStep(index, {
                              stepPurpose: event.target.value === "navigation" ? "navigation" : "main",
                              navigationMode: event.target.value === "navigation" ? step.navigationMode ?? "waitForUser" : undefined,
                              trigger: event.target.value === "navigation" ? "click" : step.trigger
                            })}
                            value={purpose}
                          >
                            <option value="main">Main Training Step</option>
                            <option value="navigation">Navigation Step</option>
                          </select>
                        </label>
                        <label className="grid gap-1 text-xs font-medium text-slate-600">
                          URL match
                          <input className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900" onChange={(event) => updateStep(index, { urlMatch: relativeUrl(event.target.value) })} value={relativeUrl(step.urlMatch)} />
                        </label>
                        {purpose === "navigation" ? (
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            Navigation behavior
                            <select className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900" onChange={(event) => updateStep(index, { navigationMode: event.target.value === "autoClick" ? "autoClick" : "waitForUser" })} value={step.navigationMode ?? "waitForUser"}>
                              <option value="waitForUser">Wait for user click</option>
                              <option value="autoClick">Auto-click this control</option>
                            </select>
                          </label>
                        ) : null}
                        {purpose === "main" ? (
                          <label className="grid gap-1 text-xs font-medium text-slate-600">
                            Trigger
                            <select
                              className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
                              onChange={(event) => updateStep(index, {
                                trigger: event.target.value === "change"
                                  ? "change"
                                  : event.target.value === "blur"
                                  ? "blur"
                                  : event.target.value === "focus"
                                  ? "focus"
                                  : event.target.value === "input"
                                  ? "input"
                                  : event.target.value === "manualNext"
                                  ? "manualNext"
                                  : "click"
                              })}
                              value={step.trigger}
                            >
                              <option value="click">Click</option>
                              <option value="change">Change</option>
                              <option value="blur">Blur</option>
                              <option value="focus">Focus</option>
                              {step.trigger === "input" ? <option value="input">Input</option> : null}
                              <option value="manualNext">Manual next</option>
                            </select>
                          </label>
                        ) : null}
                      </div>

                      <div className="grid gap-1 text-xs font-medium text-slate-600">
                        <RichTextEditor
                          label="Step description"
                          onChange={(value) => updateStep(index, { message: value, title: plainTextFromHtml(value) || "Untitled step" })}
                          trainingSessions={trainingSessions}
                          value={step.message}
                        />
                      </div>
                    </div>

                    <SelectorDetailsEditor
                      onChange={(target) => updateStep(index, { target })}
                      target={step.target}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      {introEditorOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 p-4" onClick={() => setIntroEditorOpen(false)}>
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-slate-950">Workflow start confirmation</p>
                <p className="mt-1 text-sm text-slate-500">This message appears once before the guided workflow starts. The user must click Next before any guided step begins.</p>
              </div>
              <button className="rounded-md px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100" onClick={() => setIntroEditorOpen(false)} type="button">Close</button>
            </div>
            <RichTextEditor
              label="Confirmation content"
              onChange={setIntroDraft}
              placeholder="Before you begin: Describe what the user should know before the guided workflow starts."
              trainingSessions={trainingSessions}
              value={introDraft}
            />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <button
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!hasWorkflowConfirmation}
                onClick={() => {
                  updatePreWorkflowConfirmation("", false);
                  setIntroDraft("");
                  setIntroEditorOpen(false);
                }}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Delete confirmation
              </button>
              <div className="flex justify-end gap-2">
                <button className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={() => setIntroEditorOpen(false)} type="button">
                  Cancel
                </button>
                <button
                  className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!introDraft.trim()}
                  onClick={() => {
                    updatePreWorkflowConfirmation(introDraft, true);
                    setIntroEditorOpen(false);
                  }}
                  type="button"
                >
                  Save confirmation
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {healingReviewStepId && sessionGuide ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 p-4" onClick={() => setHealingReviewStepId(null)}>
          <div className="max-h-[88vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <HealingSuggestionReviewer embedded onClose={() => setHealingReviewStepId(null)} stepId={healingReviewStepId} workflowId={sessionGuide.id} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function editorFromGuide(guide: GuidedWorkflowRow | null): EditorState {
  return {
    title: guide?.title ?? "",
    description: guide?.description ?? "",
    status: guide?.status ?? "draft",
    preWorkflowConfirmationHtml: guide?.preWorkflowConfirmationHtml ?? "",
    preWorkflowConfirmationEnabled: Boolean(guide?.preWorkflowConfirmationEnabled && guide?.preWorkflowConfirmationHtml?.trim()),
    steps: (guide?.steps ?? []).map((step) => ({ ...step, enabled: step.enabled !== false }))
  };
}

function isStepEnabled(step: GuideStep) {
  return step.enabled !== false;
}

function enabledStepNumber(steps: GuideStep[], index: number) {
  return steps.slice(0, index + 1).filter(isStepEnabled).length;
}

function controlIdentifierSummary(step: GuideStep) {
  const bestSelector = step.target.selectorCandidates?.[0];
  const parts = [
    bestSelector ? `${bestSelector.type}: ${bestSelector.value} (${Math.round(bestSelector.confidence * 100)}%)` : null,
    step.target.role ? `role: ${step.target.role}` : null,
    step.target.tagName ? `tag: ${step.target.tagName}` : null,
    step.target.fallbackText ? `text: ${step.target.fallbackText}` : null
  ].filter(Boolean);

  return parts.join(" | ") || "No control identifier captured.";
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

function relativeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return value || "/";
  }
}

function normalizeSteps(steps: GuideStep[]) {
  return steps.map((step, index) => ({
    ...step,
    enabled: step.enabled !== false,
    order: index + 1
  }));
}

function editorHasChanges(editor: EditorState, guide: GuidedWorkflowRow) {
  return editor.title !== guide.title
    || editor.description !== guide.description
    || editor.preWorkflowConfirmationHtml !== (guide.preWorkflowConfirmationHtml ?? "")
    || editor.preWorkflowConfirmationEnabled !== Boolean(guide.preWorkflowConfirmationEnabled && guide.preWorkflowConfirmationHtml?.trim())
    || JSON.stringify(normalizeSteps(editor.steps)) !== JSON.stringify(normalizeSteps(guide.steps));
}

function stepListPreview(step: GuideStep) {
  const text = plainTextFromHtml(step.message || step.title || "").split(/\r?\n/)[0]?.trim() ?? "";
  if (!text) return "Untitled step";
  const words = text.split(/\s+/).filter(Boolean);
  return words.length > 8 ? `${words.slice(0, 8).join(" ")} .....` : text;
}

function recorderConfigForTopic(topic: GuidedWorkflowTopicRow, session: GuidedWorkflowRecordingSessionRow) {
  const recorderToken = topic.recorderConfig?.recorderToken;
  if (!recorderToken) return null;

  return {
    scoutBaseUrl: getScoutBaseUrl(),
    recorderToken,
    sessionTitle: `${session.title} / ${topic.title}`,
    recordingSessionId: session.id,
    topicId: topic.id,
    ingestPath: "/api/guided-workflow-recorder/actions"
  };
}

function splitLines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function installSnippet(targetAppId: string) {
  const baseUrl = getScoutBaseUrl();
  const playerVersion = "20260701-tooltip-rect-guard";

  return `<script src="${baseUrl}/scout-smart-adoption-player.js?v=${playerVersion}"></script>
<script>
  ScoutAdoptionPlayer.init({
    scoutBaseUrl: "${baseUrl}",
    targetAppId: "${targetAppId}"
  });
</script>`;
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">{title}</h2>{children}</section>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}

function RichTextEditor({ label, onChange, placeholder = "Write the step description...", trainingSessions, value }: { label: string; onChange: (value: string) => void; placeholder?: string; trainingSessions: GuidedWorkflowRecordingSessionRow[]; value: string }) {
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const joditRef = useRef<JoditInstance | null>(null);
  const valueRef = useRef(value);
  const trainingSessionsRef = useRef(trainingSessions);
  const onChangeRef = useRef(onChange);
  const placeholderRef = useRef(placeholder);
  const applyingExternalValueRef = useRef(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    trainingSessionsRef.current = trainingSessions;
  }, [trainingSessions]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    placeholderRef.current = placeholder;
  }, [placeholder]);

  useEffect(() => {
    let cancelled = false;

    async function mountEditor() {
      const element = editorRef.current;
      if (!element || joditRef.current) return;

      const { Jodit } = await import("jodit");
      if (cancelled || !editorRef.current) return;

      const editor = Jodit.make(element, {
        height: 260,
        minHeight: 160,
        askBeforePasteHTML: false,
        askBeforePasteFromWord: false,
        defaultActionOnPaste: "insert_clear_html",
        placeholder: placeholderRef.current,
        toolbarAdaptive: false,
        buttons: [
          "bold", "italic", "underline", "strikethrough", "|",
          "ul", "ol", "|",
          "font", "fontsize", "brush", "paragraph", "|",
          "align", "outdent", "indent", "|",
          "link", "image", "table", "|",
          "undo", "redo", "eraser", "source", "fullsize"
        ],
        showCharsCounter: false,
        showWordsCounter: false,
        showXPathInStatusbar: false,
        extraButtons: [
          {
            name: "scoutTrainingSessionLink",
            icon: "link",
            text: "Training link",
            tooltip: "Insert training session link",
            popup(editor: JoditInstance, _current: Node | null, close: () => void) {
              const wrapper = document.createElement("div");
              wrapper.style.cssText = "display:grid;gap:6px;min-width:220px;max-width:320px;max-height:260px;overflow:auto;padding:6px";
              const selectedTextAtOpen = editor.s.sel?.toString() ?? "";
              (editor.s as { save?: () => void }).save?.();

              const sessionsWithTopics = trainingSessionsRef.current
                .map((session) => ({
                  ...session,
                  topics: session.topics.filter((topic) => topic.guideId && topic.status === "published")
                }))
                .filter((session) => session.topics.length > 0);

              if (sessionsWithTopics.length === 0) {
                const empty = document.createElement("div");
                empty.textContent = "No published topics available.";
                empty.style.cssText = "padding:8px;color:#64748b;font:12px system-ui,sans-serif";
                wrapper.appendChild(empty);
                return wrapper;
              }

              sessionsWithTopics.forEach((session) => {
                const group = document.createElement("div");
                const heading = document.createElement("div");
                heading.textContent = session.title || "Untitled session";
                heading.style.cssText = "padding:7px 8px 3px;color:#475569;font:700 11px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.03em";
                group.appendChild(heading);

                session.topics.forEach((topic) => {
                  const button = document.createElement("button");
                  button.type = "button";
                  button.textContent = topic.title || "Untitled topic";
                  button.style.cssText = "display:block;width:100%;border:0;border-radius:6px;background:#f8fafc;color:#0f172a;padding:7px 9px;text-align:left;font:12px system-ui,sans-serif;cursor:pointer";
                  button.addEventListener("click", () => {
                    const guideId = escapeAttribute(topic.guideId || "");
                    const href = `#scout-guide:${guideId}`;
                    (editor.s as { restore?: () => void }).restore?.();
                    const selectedText = editor.s.sel?.toString() || selectedTextAtOpen;
                    const label = escapeHtml(selectedText || topic.title || "Training topic");
                    editor.s.insertHTML(`<a href="${href}" data-scout-guide-id="${guideId}">${label}</a>`);
                    close();
                  });
                  group.appendChild(button);
                });

                wrapper.appendChild(group);
              });

              return wrapper;
            }
          }
        ],
        uploader: {
          insertImageAsBase64URI: true
        }
      });

      editor.value = valueRef.current || "";
      editor.events.on("change", () => {
        if (applyingExternalValueRef.current) return;
        const html = editor.value;
        valueRef.current = html;
        onChangeRef.current(html);
      });
      joditRef.current = editor;
      setReady(true);
    }

    void mountEditor();

    return () => {
      cancelled = true;
      joditRef.current?.destruct();
      joditRef.current = null;
    };
  }, []);

  useEffect(() => {
    const editor = joditRef.current;
    if (!editor) return;
    const nextValue = value || "";
    if (editor.value === nextValue) return;
    applyingExternalValueRef.current = true;
    editor.value = nextValue;
    applyingExternalValueRef.current = false;
  }, [value]);

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <button className="inline-flex h-7 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setPreviewOpen(true)} type="button">
          <Eye className="h-3.5 w-3.5" /> Preview
        </button>
      </div>
      <div className={`scout-editor-shell overflow-hidden rounded-lg border border-slate-300 bg-white ${ready ? "" : "opacity-70"}`}>
        <textarea ref={editorRef} />
      </div>
      {previewOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Step description preview</p>
              <button className="rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100" onClick={() => setPreviewOpen(false)} type="button">Close</button>
            </div>
            <div className="prose prose-sm max-w-none text-slate-700" dangerouslySetInnerHTML={{ __html: sanitizeGuideHtml(value) || "<p>No description.</p>" }} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character] ?? character));
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sanitizeGuideHtml(value: string) {
  if (typeof document === "undefined") return value;
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "CODE", "COL", "COLGROUP", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4", "H5", "H6", "I", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL"]);
  template.content.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const safeHref = element.tagName === "A" && attribute.name === "href" ? normalizeSafeHref(attribute.value) : "";
      const allowedHref = Boolean(safeHref);
      const allowedGuideId = element.tagName === "A" && attribute.name === "data-scout-guide-id" && /^[a-z0-9-]+$/i.test(attribute.value);
      const allowedImageSrc = element.tagName === "IMG" && attribute.name === "src" && /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(attribute.value);
      const allowedFont = element.tagName === "FONT" && ["color", "face"].includes(attribute.name);
      const allowedStyle = attribute.name === "style";
      const allowedClass = attribute.name === "class";
      const allowedTableAttribute = ["border", "cellpadding", "cellspacing", "colspan", "rowspan", "scope"].includes(attribute.name);
      const allowedMediaAttribute = element.tagName === "IMG" && ["alt", "height", "title", "width"].includes(attribute.name);
      if (allowedStyle) {
        const safeRules = attribute.value.split(";").map((rule) => rule.trim()).filter((rule) => /^(color|background-color|font-family|font-size|font-weight|font-style|text-align|text-decoration|width|height|border|border-collapse|vertical-align|padding|margin)\s*:/i.test(rule) && !/url|expression|javascript/i.test(rule));
        if (safeRules.length > 0) element.setAttribute("style", safeRules.join("; "));
        else element.removeAttribute("style");
      } else if (allowedClass) {
        const safeClasses = attribute.value.split(/\s+/).filter((className) => /^(ql-align-|ql-direction-rtl|ql-indent-|ql-size-|jodit-)/.test(className));
        if (safeClasses.length > 0) element.setAttribute("class", safeClasses.join(" "));
        else element.removeAttribute("class");
      } else if (allowedHref && safeHref) {
        element.setAttribute("href", safeHref);
      } else if (!allowedHref && !allowedGuideId && !allowedImageSrc && !allowedFont && !allowedTableAttribute && !allowedMediaAttribute) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!href.startsWith("#scout-guide:")) {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  return template.innerHTML.replace(/<div><br><\/div>/g, "<br>").trim();
}

function normalizeSafeHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  if (/^(https?:\/\/|\/|#scout-guide:)/i.test(href)) return href;
  if (/^(www\.|[a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:[/:?#].*)?$/i.test(href) && !/\s/.test(href)) {
    return `https://${href}`;
  }
  return "";
}

function decodeHtmlEntities(text: string) {
  return text.replace(/&(#?)(x?)([0-9A-Za-z]+);/g, (_, hash, hex, code) => {
    if (!hash) {
      const entities: Record<string, string> = {
        nbsp: " ",
        lt: "<",
        gt: ">",
        amp: "&",
        quot: '"',
        apos: "'",
      };
      return entities[code] ?? " ";
    }
    const num = hex ? parseInt(code, 16) : parseInt(code, 10);
    if (Number.isNaN(num)) return " ";
    return String.fromCodePoint(num);
  });
}

function plainTextFromHtml(value: string) {
  const text = value.replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(text).replace(/\s+/g, " ").trim();
}

function SelectorDetailsEditor({ onChange, target }: { onChange: (target: TargetElement) => void; target: TargetElement }) {
  const [open, setOpen] = useState(false);

  function patchTarget(patch: Partial<TargetElement>) {
    onChange({ ...target, ...patch });
  }

  function patchCandidate(index: number, patch: Partial<SelectorCandidate>) {
    const selectorCandidates = (target.selectorCandidates ?? []).map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, ...patch } : candidate);
    patchTarget({ selectorCandidates });
  }

  function addCandidate() {
    patchTarget({
      selectorCandidates: [
        ...(target.selectorCandidates ?? []),
        { type: "css", value: "", confidence: 0.5, reason: "Trainer-added selector" }
      ]
    });
  }

  function deleteCandidate(index: number) {
    patchTarget({ selectorCandidates: (target.selectorCandidates ?? []).filter((_, candidateIndex) => candidateIndex !== index) });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen((current) => !current)} type="button">
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${open ? "rotate-180" : ""}`} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-700">Control identification details</p>
            <p className="mt-1 truncate text-[11px] text-slate-500">{controlIdentifierText(target)}</p>
          </div>
        </button>
        {open ? (
          <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={addCandidate} type="button"><Plus className="h-3.5 w-3.5" /> Add selector</button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="mt-3 border-t border-slate-200 pt-3">
            <p className="text-[11px] text-slate-500">Fine tune how Scout finds this control during playback.</p>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <TargetTextField label="Fallback text" onChange={(value) => patchTarget({ fallbackText: value })} value={target.fallbackText} />
            <TargetTextField label="Tag name" onChange={(value) => patchTarget({ tagName: value })} value={target.tagName} />
            <TargetTextField label="Role" onChange={(value) => patchTarget({ role: value })} value={target.role} />
            <TargetTextField label="Accessible name" onChange={(value) => patchTarget({ accessibleName: value })} value={target.accessibleName} />
            <TargetTextField label="Label text" onChange={(value) => patchTarget({ labelText: value })} value={target.labelText} />
            <TargetTextField label="Visible text" onChange={(value) => patchTarget({ text: value })} value={target.text} />
            <TargetTextField label="ARIA label" onChange={(value) => patchTarget({ ariaLabel: value })} value={target.ariaLabel} />
            <TargetTextField label="Placeholder" onChange={(value) => patchTarget({ placeholder: value })} value={target.placeholder} />
            <TargetTextField label="Name" onChange={(value) => patchTarget({ name: value })} value={target.name} />
            <TargetTextField label="Input type" onChange={(value) => patchTarget({ inputType: value })} value={target.inputType} />
            <TargetTextField label="Selected option text" onChange={(value) => patchTarget({ selectedOptionText: value })} value={target.selectedOptionText} />
            <TargetTextField label="Nearby heading" onChange={(value) => patchTarget({ nearbyHeading: value })} value={target.nearbyHeading} />
            <TargetTextField label="Parent container text" onChange={(value) => patchTarget({ parentContainerText: value })} value={target.parentContainerText} />
            <TargetTextField label="Previous sibling text" onChange={(value) => patchTarget({ previousSiblingText: value })} value={target.previousSiblingText} />
            <TargetTextField label="Next sibling text" onChange={(value) => patchTarget({ nextSiblingText: value })} value={target.nextSiblingText} />
            <TargetTextField label="Parent tag name" onChange={(value) => patchTarget({ parentTagName: value })} value={target.parentTagName} />
            <TargetTextField label="Parent role" onChange={(value) => patchTarget({ parentRole: value })} value={target.parentRole} />
            <TargetTextField label="Parent accessible name" onChange={(value) => patchTarget({ parentAccessibleName: value })} value={target.parentAccessibleName} />
            <TargetTextField label="Parent text" onChange={(value) => patchTarget({ parentText: value })} value={target.parentText} />
            <TargetTextField label="Form title" onChange={(value) => patchTarget({ formTitle: value })} value={target.formTitle} />
            <TargetTextField label="Dialog title" onChange={(value) => patchTarget({ dialogTitle: value })} value={target.dialogTitle} />
            <TargetTextField label="Card title" onChange={(value) => patchTarget({ cardTitle: value })} value={target.cardTitle} />
            <TargetTextField label="CSS fallback" onChange={(value) => patchTarget({ cssFallback: value })} value={target.cssFallback} />
            <TargetTextField label="XPath fallback" onChange={(value) => patchTarget({ xpathFallback: value })} value={target.xpathFallback} />
          </div>

          <div className="mt-4 grid gap-2">
            <p className="text-xs font-semibold text-slate-700">Selector candidates</p>
            {(target.selectorCandidates ?? []).map((candidate, index) => (
              <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 lg:grid-cols-[150px_minmax(0,1fr)_110px_minmax(180px,.7fr)_32px]" key={`${candidate.type}-${index}`}>
                <select className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" onChange={(event) => patchCandidate(index, { type: event.target.value as SelectorCandidateType })} value={candidate.type}>
                  {selectorCandidateTypes.map((type) => <option key={type} value={type}>{humanizeKey(type)}</option>)}
                </select>
                <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" onChange={(event) => patchCandidate(index, { value: event.target.value })} placeholder="Selector value" value={candidate.value} />
                <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" max={1} min={0} onChange={(event) => patchCandidate(index, { confidence: Number(event.target.value) })} step={0.01} type="number" value={candidate.confidence} />
                <input className="h-9 rounded-md border border-slate-200 px-2 text-xs outline-none focus:border-slate-900" onChange={(event) => patchCandidate(index, { reason: event.target.value })} placeholder="Reason" value={candidate.reason} />
                <button aria-label="Delete selector" className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-red-100 text-red-700 hover:bg-red-50" onClick={() => deleteCandidate(index)} type="button"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function TargetTextField({ label, onChange, value }: { label: string; onChange: (value: string | undefined) => void; value?: string }) {
  return (
    <label className="grid gap-1 text-[11px] font-semibold text-slate-600">
      {label}
      <input className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-900 outline-none focus:border-slate-900" onChange={(event) => onChange(event.target.value || undefined)} value={value ?? ""} />
    </label>
  );
}

const selectorCandidateTypes: SelectorCandidateType[] = [
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

function humanizeKey(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function IconAction({ children, disabled, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40" disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>;
}
