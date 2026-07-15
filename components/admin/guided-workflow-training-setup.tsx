"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clipboard, Download, Edit3, Globe2, Info, Plus, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";
import type { CompanyTargetApplication } from "@/lib/admin/administration";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowTopicRow } from "@/lib/admin/guided-workflows";

type CompanyOption = { id: string; name: string };
const initialState = { status: "idle", message: "" } as const;
const pluginBrowsers = ["Brave", "Chrome", "Edge", "Firefox", "Opera", "Safari"];

function getScoutBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function GuidedWorkflowTrainingSetup({ companies, recordingSessions, selectedCompanyId, targetApps }: {
  companies: CompanyOption[];
  recordingSessions: GuidedWorkflowRecordingSessionRow[];
  selectedCompanyId: string;
  targetApps: CompanyTargetApplication[];
}) {
  const [sessions, setSessions] = useState(recordingSessions);
  const [pendingTargetAppFilter, setPendingTargetAppFilter] = useState("");
  const [pendingSessionFilter, setPendingSessionFilter] = useState("");
  const [pendingTopicFilter, setPendingTopicFilter] = useState("");
  const [appliedTargetAppFilter, setAppliedTargetAppFilter] = useState("");
  const [appliedSessionFilter, setAppliedSessionFilter] = useState("");
  const [appliedTopicFilter, setAppliedTopicFilter] = useState("");
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set(recordingSessions.map((session) => session.id)));
  const [topicDialog, setTopicDialog] = useState<{ mode: "create" | "edit"; sessionId: string; topic?: GuidedWorkflowTopicRow; title: string; description: string } | null>(null);
  const [sessionDialog, setSessionDialog] = useState<{ id: string; title: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [pluginHelpOpen, setPluginHelpOpen] = useState(false);
  const [pluginMenuOpen, setPluginMenuOpen] = useState(false);
  const [downloadingBrowser, setDownloadingBrowser] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const pluginHelpRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>(initialState);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toastTimeout, setToastTimeout] = useState<NodeJS.Timeout | null>(null);
  const [setupForm, setSetupForm] = useState({
    targetAppId: "",
    sessionTitle: ""
  });

  const companyApps = targetApps.filter((app) => app.companyId === selectedCompanyId);
  const selectedApp = companyApps.find((app) => app.id === setupForm.targetAppId) ?? null;
  const trimmedSessionTitle = setupForm.sessionTitle.trim();
  const duplicateSessionTitle = setupForm.targetAppId
    ? sessions.some((session) => session.companyTargetApplicationId === setupForm.targetAppId && session.title.trim().toLowerCase() === trimmedSessionTitle.toLowerCase())
    : false;
  const filterCompanyApps = targetApps.filter((app) => app.companyId === selectedCompanyId);
  const filterCompanySessions = sessions.filter((session) =>
    session.companyId === selectedCompanyId &&
    (!pendingTargetAppFilter || session.companyTargetApplicationId === pendingTargetAppFilter)
  );
  const filteredSessions = sessions
    .filter((session) => session.companyId === selectedCompanyId)
    .filter((session) => !appliedTargetAppFilter || session.companyTargetApplicationId === appliedTargetAppFilter)
    .filter((session) => !appliedSessionFilter || session.id === appliedSessionFilter);
  const [configTopicId, setConfigTopicId] = useState<string | null>(null);
  const configTopic = configTopicId ? sessions.flatMap((session) => session.topics.map((topic) => ({ session, topic }))).find(({ topic }) => topic.id === configTopicId) : null;
  const recorderConfigTopic = configTopic ? recorderConfigForTopic(configTopic.topic, configTopic.session) : null;
  const duplicateTopicTitle = topicDialog
    ? sessions.find((session) => session.id === topicDialog.sessionId)
        ?.topics.some((topic) => topic.id !== topicDialog.topic?.id && topic.title.trim().toLowerCase() === topicDialog.title.trim().toLowerCase()) ?? false
    : false;
  const duplicateSessionDialogTitle = sessionDialog
    ? sessions.some((session) => session.id !== sessionDialog.id && session.title.trim().toLowerCase() === sessionDialog.title.trim().toLowerCase())
    : false;

  useEffect(() => {
    setSetupForm((current) => {
      if (current.targetAppId && companyApps.some((app) => app.id === current.targetAppId)) {
        return current;
      }

      return {
        ...current,
        targetAppId: companyApps[0]?.id ?? ""
      };
    });
  }, [companyApps]);

  useEffect(() => {
    if (pendingTargetAppFilter && !filterCompanyApps.some((app) => app.id === pendingTargetAppFilter)) {
      setPendingTargetAppFilter("");
    }
    if (appliedTargetAppFilter && !filterCompanyApps.some((app) => app.id === appliedTargetAppFilter)) {
      setAppliedTargetAppFilter("");
    }
  }, [filterCompanyApps, pendingTargetAppFilter, appliedTargetAppFilter]);

  useEffect(() => {
    if (appliedSessionFilter && !sessions.some((session) => session.id === appliedSessionFilter)) {
      setAppliedSessionFilter("");
      setPendingSessionFilter("");
    }
  }, [sessions, appliedSessionFilter]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    const timeout = setTimeout(() => setToast(null), 3000);
    setToastTimeout(timeout);
  }

  function applyFilters() {
    setAppliedTargetAppFilter(pendingTargetAppFilter);
    setAppliedSessionFilter(pendingSessionFilter);
    setAppliedTopicFilter(pendingTopicFilter);
  }

  function clearFilters() {
    setPendingTargetAppFilter("");
    setPendingSessionFilter("");
    setPendingTopicFilter("");
    setAppliedTargetAppFilter("");
    setAppliedSessionFilter("");
    setAppliedTopicFilter("");
  }

  useEffect(() => {
    if (!pluginHelpOpen && !pluginMenuOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (pluginHelpRef.current && !pluginHelpRef.current.contains(event.target as Node)) {
        setPluginHelpOpen(false);
        setPluginMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [pluginHelpOpen, pluginMenuOpen]);

  async function downloadPlugin(browser: string) {
    setPluginMenuOpen(false);
    setDownloadingBrowser(browser);

    try {
      const response = await fetch(`/api/admin/guided-workflow-recorder-plugin/download?browser=${encodeURIComponent(browser.toLowerCase())}`);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        showToast(typeof body?.message === "string" ? body.message : `Unable to download ${browser} plugin.`, "error");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename=\"([^\"]+)\"/i);
      const filename = filenameMatch?.[1] || `scout-recorder-plugin-${browser.toLowerCase()}.zip`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast(`${browser} plugin download started.`, "success");
    } catch {
      showToast(`Unable to download ${browser} plugin right now.`, "error");
    } finally {
      setDownloadingBrowser(null);
    }
  }

  function updateSetup(next: Partial<typeof setupForm>) {
    setSetupForm((current) => ({ ...current, ...next }));
  }

  async function createRecordingSession() {
    setState({ status: "submitting", message: "" });

    if (!setupForm.targetAppId) {
      setState(initialState);
      showToast("Select a target app before creating a training session.", "error");
      return;
    }

    if (!trimmedSessionTitle) {
      setState(initialState);
      showToast("Training session title is required.", "error");
      return;
    }

    if (sessions.some((session) => session.companyTargetApplicationId === setupForm.targetAppId && session.title.trim().toLowerCase() === trimmedSessionTitle.toLowerCase())) {
      setState(initialState);
      showToast("A training session with this title already exists for the selected app.", "error");
      return;
    }

    const response = await fetch("/api/admin/guided-workflow-recording-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: selectedCompanyId,
        companyTargetApplicationId: setupForm.targetAppId,
        title: setupForm.sessionTitle
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState(initialState);
      showToast(typeof body?.message === "string" ? body.message : "Unable to create training session.", "error");
      return;
    }

    setSessions((current) => [body.session, ...current]);
    setCollapsedSessionIds((current) => {
      const next = new Set(current);
      next.add(body.session.id);
      return next;
    });
    setSetupForm({
      targetAppId: setupForm.targetAppId,
      sessionTitle: ""
    });
    setState(initialState);
    showToast("Training session created. Add a topic before recording.", "success");
  }

  async function saveTopic() {
    if (!topicDialog) return;
    const trimmedTopicTitle = topicDialog.title.trim();
    if (!trimmedTopicTitle) {
      showToast("Topic title is required.", "error");
      return;
    }
    const session = sessions.find((session) => session.id === topicDialog.sessionId);
    const isDuplicateTopic = session?.topics.some((topic) => topic.id !== topicDialog.topic?.id && topic.title.trim().toLowerCase() === trimmedTopicTitle.toLowerCase());
    if (isDuplicateTopic) {
      showToast("A topic with this name already exists in this training session.", "error");
      return;
    }
    setState({ status: "submitting", message: "" });
    const isCreate = topicDialog.mode === "create";
    const response = await fetch(isCreate ? "/api/admin/guided-workflow-topics" : `/api/admin/guided-workflow-topics/${topicDialog.topic?.id}`, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingSessionId: topicDialog.sessionId,
        title: topicDialog.title,
        description: topicDialog.description
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState(initialState);
      showToast(typeof body?.message === "string" ? body.message : "Unable to save topic.", "error");
      return;
    }

    setSessions((current) => current.map((session) => session.id !== body.topic.recordingSessionId
      ? session
      : {
        ...session,
        topics: isCreate
          ? [...session.topics, body.topic]
          : session.topics.map((topic) => topic.id === body.topic.id ? body.topic : topic)
      }));
    setCollapsedSessionIds((current) => {
      const next = new Set(current);
      next.delete(body.topic.recordingSessionId);
      return next;
    });
    setTopicDialog(null);
    setState(initialState);
    showToast(isCreate ? "Topic created." : "Topic updated.", "success");
  }

  async function saveSessionTitle() {
    if (!sessionDialog) return;
    const trimmedTitle = sessionDialog.title.trim();
    if (!trimmedTitle) {
      showToast("Training session title is required.", "error");
      return;
    }
    if (duplicateSessionDialogTitle) {
      showToast("A training session with this title already exists.", "error");
      return;
    }

    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionDialog.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: sessionDialog.title })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to update training session.", "error");
      return;
    }

    setSessions((current) => current.map((session) => session.id === body.session.id ? body.session : session));
    setSessionDialog(null);
    showToast("Training session updated.", "success");
  }

  function requestDeleteTopic(topic: GuidedWorkflowTopicRow) {
    setConfirmDialog({
      message: "Delete this topic and its guide?",
      onConfirm: async () => {
        setConfirmDialog(null);
        const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, { method: "DELETE" });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          showToast(typeof body?.message === "string" ? body.message : "Unable to delete topic.", "error");
          return;
        }

        setSessions((current) => current.map((session) => session.id === topic.recordingSessionId ? { ...session, topics: session.topics.filter((item) => item.id !== topic.id) } : session));
        showToast("Topic deleted.", "success");
      }
    });
  }

  function requestDeleteRecordingSession(sessionId: string) {
    setConfirmDialog({
      message: "Delete this recording session and all its topics?",
      onConfirm: async () => {
        setConfirmDialog(null);
        const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, { method: "DELETE" });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          showToast(typeof body?.message === "string" ? body.message : "Unable to delete session.", "error");
          return;
        }

        setSessions((current) => current.filter((session) => session.id !== sessionId));
        if (appliedSessionFilter === sessionId) {
          setAppliedSessionFilter("");
          setPendingSessionFilter("");
        }
        showToast("Training session deleted.", "success");
      }
    });
  }

  async function moveTopic(topic: GuidedWorkflowTopicRow, move: "up" | "down") {
    const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to move topic.", "error");
      return;
    }

    const topicsResponse = await fetch("/api/admin/guided-workflow-recording-sessions");
    const topicsBody = await topicsResponse.json().catch(() => null);
    if (Array.isArray(topicsBody?.sessions)) setSessions(topicsBody.sessions);
  }

  async function toggleTopicAnalytics(topic: GuidedWorkflowTopicRow) {
    const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyticsLoggingEnabled: !topic.analyticsLoggingEnabled })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to update logging.", "error");
      return;
    }

    setSessions((current) => current.map((session) => session.id === body.topic.recordingSessionId
      ? { ...session, topics: session.topics.map((item) => item.id === body.topic.id ? body.topic : item) }
      : session));
    showToast(body.topic.analyticsLoggingEnabled ? "Playback logging enabled." : "Playback logging disabled.", "success");
  }

  async function copyText(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey((current) => current === key ? "" : current), 1200);
  }

  return (
    <div className="grid gap-6">
      <div className="relative flex justify-end" ref={pluginHelpRef}>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              aria-expanded={pluginMenuOpen}
              aria-haspopup="menu"
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
              disabled={downloadingBrowser !== null}
              onClick={() => {
                setPluginHelpOpen(false);
                setPluginMenuOpen((open) => !open);
              }}
              type="button"
            >
              <Download className="h-4 w-4" />
              {downloadingBrowser ? `Downloading ${downloadingBrowser}...` : "Download plugin"}
              <ChevronDown className={`h-4 w-4 transition ${pluginMenuOpen ? "rotate-180" : ""}`} />
            </button>

            {pluginMenuOpen ? (
              <div className="absolute right-0 top-12 z-30 min-w-[210px] rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl" role="menu">
                {pluginBrowsers.map((browser) => (
                  <button
                    className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
                    disabled={downloadingBrowser !== null}
                    key={browser}
                    onClick={() => void downloadPlugin(browser)}
                    role="menuitem"
                    type="button"
                  >
                    <span>{browser}</span>
                    <Download className="h-3.5 w-3.5 text-slate-500" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button
            aria-expanded={pluginHelpOpen}
            aria-label="Recorder plugin installation instructions"
            title="Recorder plugin installation instructions"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950"
            onClick={() => setPluginHelpOpen((open) => !open)}
            type="button"
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        {pluginHelpOpen ? (
          <div className="absolute right-0 top-12 z-20 w-[min(380px,calc(100vw-32px))] origin-top-right rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-sm text-slate-700 shadow-[0_24px_70px_rgba(15,23,42,.18)] backdrop-blur">
            <div className="absolute -top-2 right-4 h-4 w-4 rotate-45 border-l border-t border-slate-200/80 bg-white/95" />
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Install recorder extension</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Download, unzip, then load the folder as an unpacked browser extension.</p>
              </div>
              <button aria-label="Close instructions" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950" onClick={() => setPluginHelpOpen(false)} title="Close instructions" type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="relative mt-4 grid gap-3">
              {[
                "Click Download plugin, choose your browser, and unzip the downloaded file.",
                "Open your browser extensions page.",
                "Turn on Developer mode.",
                "Click Load unpacked.",
                "Select the unzipped plugin folder.",
                "Open your target app, then use Config to paste the recorder config."
              ].map((step, index) => (
                <li className="flex gap-3" key={step}>
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-semibold text-white">{index + 1}</span>
                  <span className="leading-6">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Globe2 className="h-4 w-4" />Training setup</div>
            <p className="mt-1 text-sm text-slate-500">Create training sessions and recorder config for trainers.</p>
          </div>
          {selectedApp ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedApp.name}</span> : null}
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <Field label="Target app">
              <select className="input" onChange={(event) => updateSetup({ targetAppId: event.target.value })} value={setupForm.targetAppId}>
                <option value="">Select target app</option>
                {companyApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
              </select>
            </Field>
            <Field label="Training session title">
              <input className="input" placeholder="New training session" onChange={(event) => updateSetup({ sessionTitle: event.target.value })} value={setupForm.sessionTitle} />
              {duplicateSessionTitle ? <p className="mt-1 text-xs text-red-600">This session title already exists for the selected app.</p> : null}
            </Field>
            <div className="md:w-auto md:min-w-[210px]">
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={!setupForm.targetAppId || !trimmedSessionTitle || duplicateSessionTitle || state.status === "submitting"} onClick={createRecordingSession} type="button">
                <Plus className="h-4 w-4" />Create training session
              </button>
            </div>
          </div>
          {selectedApp?.baseUrl ? <p className="text-xs text-slate-500">Target app URL: {selectedApp.baseUrl}</p> : null}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Target app">
              <select className="input" value={pendingTargetAppFilter} onChange={(event) => setPendingTargetAppFilter(event.target.value)}>
                <option value="">All target apps</option>
                {filterCompanyApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
              </select>
            </Field>
            <Field label="Training session">
              <select className="input" value={pendingSessionFilter} onChange={(event) => setPendingSessionFilter(event.target.value)}>
                <option value="">All sessions</option>
                {filterCompanySessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
              </select>
            </Field>
            <Field label="Filter topics">
              <input className="input" placeholder="Type topic title..." value={pendingTopicFilter} onChange={(event) => setPendingTopicFilter(event.target.value)} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={applyFilters} type="button">Filter</button>
            <button className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700" onClick={clearFilters} type="button">Clear</button>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0">
          <thead className="bg-slate-100 text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Session</th>
              <th className="px-4 py-3">Topics</th>
              <th className="px-4 py-3">Count</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSessions.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">No sessions match the filter.</td></tr>
            ) : filteredSessions.map((session, index) => {
              const isCollapsed = collapsedSessionIds.has(session.id);
              const sessionTopics = session.topics.filter((topic) => topic.title.toLowerCase().includes(appliedTopicFilter.trim().toLowerCase()));
              const sessionRowBg = index % 2 === 0 ? "bg-slate-50" : "bg-slate-100";

              return (
                <Fragment key={session.id}>
                  <tr className={`border-t border-slate-200 ${sessionRowBg}`}>
                    <td className="px-4 py-4 align-top text-sm text-slate-900">
                      <div className="space-y-1">
                        <button className="inline-flex items-center gap-2 text-left font-semibold text-slate-900" onClick={() => setCollapsedSessionIds((current) => {
                        const next = new Set(current);
                        if (next.has(session.id)) next.delete(session.id);
                        else next.add(session.id);
                        return next;
                      })} type="button">
                        <ChevronDown className={`h-4 w-4 transition ${isCollapsed ? "-rotate-90" : ""}`} />
                        {session.title}
                      </button>
                        <p className="text-xs text-slate-500">
                          {companies.find((company) => company.id === session.companyId)?.name ?? "Unknown company"} · {session.companyTargetApplicationName ?? session.targetAppName ?? "Unknown app"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">{sessionTopics.length === 0 ? "No topics" : "Topics available"}</td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">{sessionTopics.length}</td>
                    <td className="px-4 py-4 align-top text-right text-sm font-medium">
                      <button className="mr-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setTopicDialog({ mode: "create", sessionId: session.id, title: "", description: "" })} title="Add topic" type="button">Add topic</button>
                      <button aria-label="Edit session" className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50" onClick={() => setSessionDialog({ id: session.id, title: session.title })} title="Edit session" type="button"><Edit3 className="h-4 w-4" /></button>
                      <button aria-label="Delete session" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => requestDeleteRecordingSession(session.id)} title="Delete session" type="button"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>

                  {!isCollapsed && sessionTopics.map((topic) => (
                    <tr className="border-t border-slate-100 bg-white" key={topic.id}>
                      <td className="px-4 py-3 text-sm text-slate-700"></td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">{topic.title}</p>
                        {topic.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{topic.description}</p> : null}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${topic.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{topic.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        <button
                          aria-label={topic.analyticsLoggingEnabled ? "Disable playback logging" : "Enable playback logging"}
                          aria-pressed={topic.analyticsLoggingEnabled}
                          className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900"
                          onClick={() => toggleTopicAnalytics(topic)}
                          title={topic.analyticsLoggingEnabled ? "Disable playback logging" : "Enable playback logging"}
                          type="button"
                        >
                          {topic.analyticsLoggingEnabled ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
                        </button>
                        <button aria-label="Recorder config" className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900" onClick={() => setConfigTopicId(topic.id)} title="Recorder config" type="button"><Clipboard className="h-4 w-4" /></button>
                      <button aria-label="Edit topic" className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900" onClick={() => setTopicDialog({ mode: "edit", sessionId: session.id, topic, title: topic.title, description: topic.description })} title="Edit topic" type="button"><Edit3 className="h-4 w-4" /></button>
                        <button aria-label="Delete topic" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:text-red-800" onClick={() => requestDeleteTopic(topic)} title="Delete topic" type="button"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </section>

      {topicDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setTopicDialog(null)}>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">{topicDialog.mode === "create" ? "Add topic" : "Edit topic"}</p>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setTopicDialog(null)} type="button"><X className="h-4 w-4" /></button>
            </div>
            <Field label="Topic title">
              <input className="input" onChange={(event) => setTopicDialog((current) => current ? { ...current, title: event.target.value } : current)} value={topicDialog.title} />
              {duplicateTopicTitle ? <p className="mt-1 text-xs text-red-600">A topic with this name already exists in this training session.</p> : null}
            </Field>
            <Field label="Description">
              <textarea className="input min-h-[3.5rem] py-2" rows={2} onChange={(event) => setTopicDialog((current) => current ? { ...current, description: event.target.value } : current)} value={topicDialog.description} placeholder="Short description to help chatbot users understand this topic." />
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setTopicDialog(null)} type="button">Cancel</button>
              <button className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={saveTopic} type="button" disabled={duplicateTopicTitle}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {sessionDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setSessionDialog(null)}>
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-950">Edit training session</p>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setSessionDialog(null)} type="button"><X className="h-4 w-4" /></button>
            </div>
            <Field label="Training session title">
              <input className="input" onChange={(event) => setSessionDialog((current) => current ? { ...current, title: event.target.value } : current)} value={sessionDialog.title} />
              {duplicateSessionDialogTitle ? <p className="mt-1 text-xs text-red-600">A training session with this title already exists.</p> : null}
            </Field>
            <div className="mt-4 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setSessionDialog(null)} type="button">Cancel</button>
              <button className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={saveSessionTitle} type="button" disabled={duplicateSessionDialogTitle}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {configTopic ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" onClick={() => setConfigTopicId(null)}>
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-950">Recorder extension config</p>
                <p className="text-xs text-slate-500">{configTopic.topic.title}</p>
              </div>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setConfigTopicId(null)} type="button"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs text-white">
              <pre className="whitespace-pre-wrap break-words text-[11px]">{recorderConfigTopic ? JSON.stringify(recorderConfigTopic, null, 2) : "No recorder config available for this topic."}</pre>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700" onClick={() => setConfigTopicId(null)} type="button">Close</button>
              <button className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={() => recorderConfigTopic && copyText("recorder-config", JSON.stringify(recorderConfigTopic, null, 2))} type="button">
                {copiedKey === "recorder-config" ? <Check className="mr-2 h-4 w-4" /> : <Clipboard className="mr-2 h-4 w-4" />}
                {copiedKey === "recorder-config" ? "Copied" : "Copy config"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                onClick={confirmDialog.onConfirm}
                type="button"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 pointer-events-none">
          <div
            className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 shadow-lg ${
              toast.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              className="rounded p-0.5 transition-colors hover:bg-black/5"
              onClick={() => setToast(null)}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

    </div>
  );
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

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_textarea.input]:w-full [&_textarea.input]:rounded-lg [&_textarea.input]:border [&_textarea.input]:border-slate-200 [&_textarea.input]:bg-white [&_textarea.input]:px-3 [&_textarea.input]:text-sm [&_textarea.input]:outline-none [&_textarea.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}
