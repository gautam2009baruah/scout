"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, Clipboard, Copy, Play, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import type { ContinueWhen, GuideStatus, GuideStep } from "@/shared/guideTypes";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowRow, GuidedWorkflowTargetAppRow } from "@/lib/admin/guided-workflows";

type CompanyOption = { id: string; name: string };

type GuidedWorkflowManagerProps = {
  companies: CompanyOption[];
  guides: GuidedWorkflowRow[];
  recordingSessions: GuidedWorkflowRecordingSessionRow[];
  targetApps: GuidedWorkflowTargetAppRow[];
};

type EditorState = {
  title: string;
  description: string;
  status: GuideStatus;
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

function getScoutBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function GuidedWorkflowManager({ companies, guides, recordingSessions, targetApps }: GuidedWorkflowManagerProps) {
  const [apps, setApps] = useState(targetApps);
  const [sessions, setSessions] = useState(recordingSessions);
  const [items, setItems] = useState(guides);
  const [selectedId, setSelectedId] = useState(guides[0]?.id ?? "");
  const selected = useMemo(() => items.find((guide) => guide.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const [editor, setEditor] = useState<EditorState>(() => editorFromGuide(selected));
  const [setupForm, setSetupForm] = useState({
    companyId: companies[0]?.id ?? "",
    targetAppMode: "new",
    targetAppId: "",
    appName: "",
    baseUrl: "",
    allowedOrigins: "",
    sessionTitle: "New training session"
  });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(recordingSessions[0]?.id ?? null);
  const [sessionDetails, setSessionDetails] = useState<SessionDetailsState>({ session: null, actions: [] });
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>({ status: "idle", message: "" });
  const firstCompanyId = companies[0]?.id ?? "";
  const firstTargetAppId = apps.find((app) => app.companyId === firstCompanyId)?.id ?? "";
  const [draftFilters, setDraftFilters] = useState({ companyId: firstCompanyId, targetAppId: firstTargetAppId, title: "" });
  const [filters, setFilters] = useState({ companyId: firstCompanyId, targetAppId: firstTargetAppId, title: "" });
  const filterApps = apps.filter((app) => app.companyId === draftFilters.companyId);
  const filteredSessions = useMemo(() => sessions.filter((session) => {
    const matchesCompany = session.companyId === filters.companyId;
    const matchesTargetApp = session.targetAppId === filters.targetAppId;
    const matchesTitle = !filters.title.trim() || session.title.toLowerCase().includes(filters.title.trim().toLowerCase());
    return matchesCompany && matchesTargetApp && matchesTitle;
  }), [filters.companyId, filters.targetAppId, filters.title, sessions]);
  const selectedSession = useMemo(() => sessions.find((session) => session.id === selectedSessionId) ?? null, [sessions, selectedSessionId]);
  const selectedRecorderConfig = selectedSession ? recorderConfigForSession(selectedSession) : null;

  useEffect(() => {
    const nextApps = apps.filter((app) => app.companyId === draftFilters.companyId);
    if (!nextApps.some((app) => app.id === draftFilters.targetAppId)) {
      setDraftFilters((current) => ({ ...current, targetAppId: nextApps[0]?.id ?? "" }));
    }
  }, [apps, draftFilters.companyId, draftFilters.targetAppId]);

  useEffect(() => {
    setSelectedSessionId((current) => (current && filteredSessions.some((session) => session.id === current) ? current : filteredSessions[0]?.id ?? null));
  }, [filteredSessions]);

  useEffect(() => {
    if (!selectedSession?.guideId) return;
    const guide = items.find((item) => item.id === selectedSession.guideId);
    if (!guide || selectedId === guide.id) return;
    setSelectedId(guide.id);
    setEditor(editorFromGuide(guide));
  }, [items, selectedId, selectedSession?.guideId]);

  useEffect(() => {
    if (!selectedSessionId) {
      setSessionDetails({ session: null, actions: [] });
      return;
    }

    let cancelled = false;

    async function refreshSessionDetails() {
      try {
        const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${selectedSessionId}`);
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        setSessionDetails({
          session: body?.session ?? null,
          actions: Array.isArray(body?.actions) ? body.actions : []
        });
        if (body?.session) {
          setSessions((current) => current.map((session) => session.id === body.session.id ? body.session : session));
        }

        if (body?.session?.guideId) {
          const guideResponse = await fetch(`/api/admin/guided-workflows/${body.session.guideId}`);
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
  }, [items, selectedId, selectedSessionId]);

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
      allowedOrigins: app?.allowedOrigins.join("\n") ?? ""
    }));
  }

  async function createTargetAppFromSetup() {
    setState({ status: "submitting", message: "" });
    const response = await fetch("/api/admin/guided-workflow-target-apps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: setupForm.companyId,
        name: setupForm.appName,
        baseUrl: setupForm.baseUrl,
        allowedOrigins: splitLines(setupForm.allowedOrigins)
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
      allowedOrigins: body.targetApp.allowedOrigins.join("\n")
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
        companyId: setupForm.companyId,
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

  async function updateSession(sessionId: string, status: GuidedWorkflowRecordingSessionRow["status"]) {
    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to update session." });
      return;
    }

    setSessions((current) => current.map((session) => session.id === body.session.id ? body.session : session));
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

  async function convertSession(sessionId: string) {
    const session = sessions.find((item) => item.id === sessionId);
    if (session?.guideId && selected?.id === session.guideId) {
      await saveGuide(undefined, { silent: true });
    }

    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convert: true })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to generate guide from session." });
      return;
    }

    setItems((current) => [body.guide, ...current]);
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setSessions((current) => current.map((session) => session.id === sessionId ? { ...session, status: "converted", guideId: body.guide.id } : session));
    setState({ status: "success", message: session?.guideId ? "Guide draft updated." : "Guide draft generated from the recording session." });
  }

  async function publishSessionGuide(session: GuidedWorkflowRecordingSessionRow) {
    if (!session.guideId) {
      setState({ status: "error", message: "Create a guide draft before publishing." });
      return;
    }

    if (selected?.id === session.guideId) {
      await saveGuide("published");
      return;
    }

    setState({ status: "submitting", message: "" });
    const response = await fetch(`/api/admin/guided-workflows/${session.guideId}`, {
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
        steps: editor.steps.map((step, index) => ({ ...step, order: index + 1 }))
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
    setSessions((current) => current.map((session) => session.id === selectedSessionId ? { ...session, actionsCount: Math.max(0, session.actionsCount - 1) } : session));
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
            <select className="input" onChange={(event) => setDraftFilters({ companyId: event.target.value, targetAppId: apps.find((app) => app.companyId === event.target.value)?.id ?? "", title: "" })} required value={draftFilters.companyId}>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
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
            disabled={!draftFilters.companyId || !draftFilters.targetAppId}
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
                const active = selectedSessionId === session.id;
                const displayStatus = workflowStatusForSession(session, items);
                return (
                  <button
                    className={`w-full rounded-lg border p-3 text-left transition ${active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold">{session.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600"}`}>{displayStatus}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </Panel>

        <SessionDetailsPanel
          convertSession={convertSession}
          deleteSession={deleteSession}
          deleteStep={hardDeleteStep}
          editor={editor}
          guides={items}
          moveStep={moveStep}
          publishSessionGuide={publishSessionGuide}
          recorderConfig={selectedRecorderConfig}
          selectedSession={selectedSession}
          sessionDetails={sessionDetails}
          updateStep={updateStep}
        />
      </section>
    </div>
  );
}

function SessionDetailsPanel({ convertSession, deleteSession, deleteStep, editor, guides, moveStep, publishSessionGuide, recorderConfig, selectedSession, sessionDetails, updateStep }: {
  convertSession(sessionId: string): void;
  deleteSession(sessionId: string): void;
  deleteStep(index: number): void;
  editor: EditorState;
  guides: GuidedWorkflowRow[];
  moveStep(index: number, direction: -1 | 1): void;
  publishSessionGuide(session: GuidedWorkflowRecordingSessionRow): void;
  recorderConfig: { scoutBaseUrl: string; recorderToken: string; sessionTitle: string; recordingSessionId: string; ingestPath: string } | null;
  selectedSession: GuidedWorkflowRecordingSessionRow | null;
  sessionDetails: SessionDetailsState;
  updateStep(index: number, patch: Partial<GuideStep>): void;
}) {
  const [copiedKey, setCopiedKey] = useState("");
  const [configTab, setConfigTab] = useState<"recorder" | "snippet">("recorder");
  const [openStepIds, setOpenStepIds] = useState<Set<string>>(() => new Set());
  const stepIdsKey = editor.steps.map((step) => step.id).join("|");

  useEffect(() => {
    if (!selectedSession?.guideId) {
      setConfigTab("recorder");
    }
  }, [selectedSession?.guideId]);

  useEffect(() => {
    setOpenStepIds((current) => {
      const validIds = new Set(editor.steps.map((step) => step.id));
      return new Set(Array.from(current).filter((id) => validIds.has(id)));
    });
  }, [stepIdsKey]);

  if (!selectedSession) {
    return (
      <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">
        Select a training session from the list to inspect the recorded steps.
      </section>
    );
  }

  const sessionGuide = selectedSession.guideId ? guides.find((guide) => guide.id === selectedSession.guideId) ?? null : null;
  const guidePublished = sessionGuide?.status === "published";
  const guideSteps = sessionGuide ? editor.steps : [];
  const syncedActionCount = sessionDetails.session?.id === selectedSession.id ? sessionDetails.actions.length : selectedSession.actionsCount;
  const guideDirty = Boolean(sessionGuide && editorHasChanges(editor, sessionGuide));
  const hasNewSyncedActions = Boolean(sessionGuide && syncedActionCount > sessionGuide.recordedActions.length);
  const canUpdateDraft = Boolean(sessionGuide && (guideDirty || hasNewSyncedActions));
  const canPublish = Boolean(sessionGuide && sessionGuide.status === "draft" && guideSteps.length > 0 && !guideDirty && !hasNewSyncedActions);

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
            <p className="mt-2 text-sm text-slate-500">
              <span className="font-medium text-slate-700">Synced actions:</span> {syncedActionCount} • <span className="font-medium text-slate-700">Created:</span> {formatDate(selectedSession.createdAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!canUpdateDraft}
              onClick={() => convertSession(selectedSession.id)}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />Save guide draft
            </button>
            <button
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
              disabled={!canPublish}
              onClick={() => publishSessionGuide(selectedSession)}
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
            : selectedSession.guideId
              ? guideDirty ? "Save draft changes before publishing." : hasNewSyncedActions ? "New synced steps are waiting. Save the guide draft before publishing." : guidePublished ? "This session is published. Add or edit steps to enable another update." : "This draft is ready to publish."
              : "Synced steps are being converted into a draft guide."}
        </p>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold ${configTab === "recorder" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`} onClick={() => setConfigTab("recorder")} type="button"><Clipboard className="h-3.5 w-3.5" />Recorder config</button>
              <button className={`inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold ${configTab === "snippet" ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"} disabled:cursor-not-allowed disabled:opacity-40`} disabled={!guidePublished} onClick={() => setConfigTab("snippet")} type="button"><Copy className="h-3.5 w-3.5" />Install snippet</button>
            </div>
            {configTab === "recorder" && recorderConfig ? (
              <button className="button-secondary h-8 gap-2 px-3 text-xs" onClick={() => copyText("recorder-config", JSON.stringify(recorderConfig, null, 2))} type="button">
                {copiedKey === "recorder-config" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copiedKey === "recorder-config" ? "Copied" : "Copy config"}
              </button>
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
              <p className="mt-3 text-sm text-slate-500">Create a new training session to generate a fresh recorder token.</p>
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
            const continueWhenType = step.continueWhen?.type ?? "manualNext";
            const continueWhenValue = step.continueWhen?.type === "urlContains"
              ? step.continueWhen.value
              : step.continueWhen?.type === "elementVisible"
              ? step.continueWhen.selector
              : "";

            return (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" key={step.id}>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-3">
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
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition ${isOpen ? "rotate-180" : ""}`} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-950">{step.message || step.title || "Untitled step"}</span>
                  </button>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${purpose === "navigation" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {purpose === "navigation" ? "Navigation Step" : "Main Training Step"}
                  </span>
                  {purpose === "navigation" ? (
                    <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold text-blue-800">
                      {step.navigationMode === "autoClick" ? "Auto-click this control" : "Wait for user click"}
                    </span>
                  ) : null}
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${step.isMainStep === false ? "bg-slate-100 text-slate-700" : "bg-slate-950 text-white"}`}>
                    {step.isMainStep === false ? "Entry step" : "Main step"}
                  </span>
                  <div className="flex gap-1">
                    <button aria-label="Move step up" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={index === 0} onClick={() => moveStep(index, -1)} title="Move step up" type="button"><ArrowUp className="h-4 w-4" /></button>
                    <button aria-label="Move step down" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={index === guideSteps.length - 1} onClick={() => moveStep(index, 1)} title="Move step down" type="button"><ArrowDown className="h-4 w-4" /></button>
                    <button aria-label="Delete step" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => deleteStep(index)} title="Delete step" type="button"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="grid gap-4 p-4">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Step description
                        <input
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
                          onChange={(event) => updateStep(index, { message: event.target.value, title: event.target.value })}
                          value={step.message}
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Step purpose
                        <select
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
                          onChange={(event) => updateStep(index, {
                            stepPurpose: event.target.value === "navigation" ? "navigation" : "main",
                            navigationMode: event.target.value === "navigation" ? step.navigationMode ?? "waitForUser" : undefined,
                          })}
                          value={purpose}
                        >
                          <option value="main">Main Training Step</option>
                          <option value="navigation">Navigation Step</option>
                        </select>
                      </label>
                    </div>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <span>
                        <span className="block text-sm font-semibold text-slate-950">Is main step</span>
                        <span className="block text-xs text-slate-500">Uncheck for entry steps before the main guide flow.</span>
                      </span>
                      <input
                        checked={step.isMainStep !== false}
                        className="h-5 w-5 accent-slate-950"
                        onChange={(event) => updateStep(index, { isMainStep: event.target.checked })}
                        type="checkbox"
                      />
                    </label>

                    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-3">
                      {purpose === "navigation" ? (
                        <label className="grid gap-1 text-xs font-medium text-amber-900">
                          Navigation behavior
                          <select className="h-10 rounded-lg border border-amber-200 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-amber-700" onChange={(event) => updateStep(index, { navigationMode: event.target.value === "autoClick" ? "autoClick" : "waitForUser" })} value={step.navigationMode ?? "waitForUser"}>
                            <option value="waitForUser">Wait for user click</option>
                            <option value="autoClick">Auto-click this control</option>
                          </select>
                        </label>
                      ) : null}
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Continue when
                        <select
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900"
                          onChange={(event) => updateStep(index, {
                            continueWhen: event.target.value === "urlContains"
                              ? { type: "urlContains", value: continueWhenValue }
                              : event.target.value === "elementVisible"
                              ? { type: "elementVisible", selector: continueWhenValue }
                              : { type: "manualNext" }
                          })}
                          value={continueWhenType}
                        >
                          <option value="manualNext">Manual next</option>
                          <option value="urlContains">URL contains</option>
                          <option value="elementVisible">Element visible</option>
                        </select>
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        Condition value
                        <input
                          className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900 disabled:bg-slate-100 disabled:text-slate-400"
                          disabled={continueWhenType === "manualNext"}
                          onChange={(event) => updateStep(index, {
                            continueWhen: continueWhenType === "urlContains"
                              ? { type: "urlContains", value: event.target.value }
                              : continueWhenType === "elementVisible"
                              ? { type: "elementVisible", selector: event.target.value }
                              : { type: "manualNext" }
                          })}
                          placeholder={continueWhenType === "urlContains" ? "/target-page" : continueWhenType === "elementVisible" ? "[data-adoption-id='target']" : ""}
                          value={continueWhenValue}
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-slate-600">
                        URL match
                        <input className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-normal text-slate-900 outline-none transition focus:border-slate-900" onChange={(event) => updateStep(index, { urlMatch: relativeUrl(event.target.value) })} value={relativeUrl(step.urlMatch)} />
                      </label>
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
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-medium text-slate-600">Selector summary</p>
                      <p className="mt-1 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600">{controlIdentifierSummary(step)}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function editorFromGuide(guide: GuidedWorkflowRow | null): EditorState {
  return {
    title: guide?.title ?? "",
    description: guide?.description ?? "",
    status: guide?.status ?? "draft",
    steps: (guide?.steps ?? []).map((step) => ({
      ...step,
      isMainStep: step.isMainStep !== false,
      continueWhen: normalizeContinueWhen(step.continueWhen)
    }))
  };
}

function normalizeContinueWhen(value: unknown): ContinueWhen {
  if (value && typeof value === "object") {
    const candidate = value as { type?: unknown; value?: unknown; selector?: unknown };
    if (candidate.type === "urlContains") {
      return { type: "urlContains", value: typeof candidate.value === "string" ? candidate.value : "" };
    }
    if (candidate.type === "elementVisible") {
      return { type: "elementVisible", selector: typeof candidate.selector === "string" ? candidate.selector : "" };
    }
  }

  return { type: "manualNext" };
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
    order: index + 1
  }));
}

function editorHasChanges(editor: EditorState, guide: GuidedWorkflowRow) {
  return editor.title !== guide.title
    || editor.description !== guide.description
    || JSON.stringify(normalizeSteps(editor.steps)) !== JSON.stringify(normalizeSteps(guide.steps));
}

function workflowStatusForSession(session: GuidedWorkflowRecordingSessionRow, guides: GuidedWorkflowRow[]) {
  const guide = session.guideId ? guides.find((item) => item.id === session.guideId) : null;
  if (guide) return guide.status;
  return "draft";
}

function recorderConfigForSession(session: GuidedWorkflowRecordingSessionRow) {
  const recorderToken = session.recorderConfig?.recorderToken;
  if (!recorderToken) return null;

  return {
    scoutBaseUrl: getScoutBaseUrl(),
    recorderToken,
    sessionTitle: session.title,
    recordingSessionId: session.id,
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

  return `<script src="${baseUrl}/scout-adoption-player.js"></script>
<script>
  ScoutAdoptionPlayer.init({
    scoutBaseUrl: "${baseUrl}",
    targetAppId: "${targetAppId}"
  });
</script>`;
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold text-slate-950">{title}</h2>{children}</section>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}

function IconAction({ children, disabled, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40" disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>;
}
