"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Clipboard, Download, Edit3, Globe2, Info, Plus, Trash2, X } from "lucide-react";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowTargetAppRow, GuidedWorkflowTopicRow } from "@/lib/admin/guided-workflows";

type CompanyOption = { id: string; name: string };

function getScoutBaseUrl() {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}

export function GuidedWorkflowTrainingSetup({ companies, recordingSessions, targetApps }: {
  companies: CompanyOption[];
  recordingSessions: GuidedWorkflowRecordingSessionRow[];
  targetApps: GuidedWorkflowTargetAppRow[];
}) {
  const [apps, setApps] = useState(targetApps);
  const [sessions, setSessions] = useState(recordingSessions);
  const [pendingCompanyFilter, setPendingCompanyFilter] = useState(companies[0]?.id ?? "");
  const [pendingAppFilter, setPendingAppFilter] = useState(() => {
    const firstCompanyId = companies[0]?.id ?? "";
    return targetApps.find((app) => app.companyId === firstCompanyId)?.id ?? "";
  });
  const [pendingSessionFilter, setPendingSessionFilter] = useState("");
  const [pendingTopicFilter, setPendingTopicFilter] = useState("");
  const [appliedCompanyFilter, setAppliedCompanyFilter] = useState("");
  const [appliedAppFilter, setAppliedAppFilter] = useState("");
  const [appliedSessionFilter, setAppliedSessionFilter] = useState("");
  const [appliedTopicFilter, setAppliedTopicFilter] = useState("");
  const [collapsedSessionIds, setCollapsedSessionIds] = useState<Set<string>>(() => new Set(recordingSessions.map((session) => session.id)));
  const [topicDialog, setTopicDialog] = useState<{ mode: "create" | "edit"; sessionId: string; topic?: GuidedWorkflowTopicRow; title: string } | null>(null);
  const [pluginHelpOpen, setPluginHelpOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState("");
  const pluginHelpRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>({ status: "idle", message: "" });
  const [setupForm, setSetupForm] = useState({
    companyId: companies[0]?.id ?? "",
    targetAppMode: "new",
    targetAppId: "",
    appName: "",
    baseUrl: "",
    allowedOrigins: "",
    sessionTitle: ""
  });

  const companyApps = apps.filter((app) => app.companyId === setupForm.companyId);
  const selectedApp = apps.find((app) => app.id === setupForm.targetAppId) ?? null;
  const trimmedSessionTitle = setupForm.sessionTitle.trim();
  const duplicateAppName = setupForm.targetAppMode === "new" && setupForm.appName.trim().length > 0 && companyApps.some((app) => app.name.trim().toLowerCase() === setupForm.appName.trim().toLowerCase());
  const duplicateSessionTitle = setupForm.targetAppMode === "existing" && setupForm.targetAppId
    ? sessions.some((session) => session.targetAppId === setupForm.targetAppId && session.title.trim().toLowerCase() === trimmedSessionTitle.toLowerCase())
    : false;
  const filterCompanyApps = apps.filter((app) => app.companyId === pendingCompanyFilter);
  const filterCompanySessions = sessions.filter((session) =>
    (!pendingCompanyFilter || session.companyId === pendingCompanyFilter) &&
    (!pendingAppFilter || session.targetAppId === pendingAppFilter)
  );
  const filteredSessions = sessions
    .filter((session) => !appliedCompanyFilter || session.companyId === appliedCompanyFilter)
    .filter((session) => !appliedAppFilter || session.targetAppId === appliedAppFilter)
    .filter((session) => !appliedSessionFilter || session.id === appliedSessionFilter);
  const [configTopicId, setConfigTopicId] = useState<string | null>(null);
  const configTopic = configTopicId ? sessions.flatMap((session) => session.topics.map((topic) => ({ session, topic }))).find(({ topic }) => topic.id === configTopicId) : null;
  const recorderConfigTopic = configTopic ? recorderConfigForTopic(configTopic.topic, configTopic.session) : null;
  const duplicateTopicTitle = topicDialog
    ? sessions.find((session) => session.id === topicDialog.sessionId)
        ?.topics.some((topic) => topic.id !== topicDialog.topic?.id && topic.title.trim().toLowerCase() === topicDialog.title.trim().toLowerCase()) ?? false
    : false;

  useEffect(() => {
    if (appliedSessionFilter && !sessions.some((session) => session.id === appliedSessionFilter)) {
      setAppliedSessionFilter("");
      setPendingSessionFilter("");
    }
  }, [sessions, appliedSessionFilter]);

  function applyFilters() {
    setAppliedCompanyFilter(pendingCompanyFilter);
    setAppliedAppFilter(pendingAppFilter);
    setAppliedSessionFilter(pendingSessionFilter);
    setAppliedTopicFilter(pendingTopicFilter);
  }

  function clearFilters() {
    const firstCompanyId = companies[0]?.id ?? "";
    setPendingCompanyFilter(firstCompanyId);
    setPendingAppFilter(apps.find((app) => app.companyId === firstCompanyId)?.id ?? "");
    setPendingSessionFilter("");
    setPendingTopicFilter("");
    setAppliedCompanyFilter("");
    setAppliedAppFilter("");
    setAppliedSessionFilter("");
    setAppliedTopicFilter("");
  }

  useEffect(() => {
    if (!pluginHelpOpen) return;

    function closeOnOutsideClick(event: MouseEvent) {
      if (pluginHelpRef.current && !pluginHelpRef.current.contains(event.target as Node)) {
        setPluginHelpOpen(false);
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [pluginHelpOpen]);

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
    if (duplicateAppName) {
      setState({ status: "error", message: "A target app with this name already exists for the selected company." });
      return undefined;
    }

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

    if (!trimmedSessionTitle) {
      setState({ status: "error", message: "Training session title is required." });
      return;
    }

    if (sessions.some((session) => session.targetAppId === targetAppId && session.title.trim().toLowerCase() === trimmedSessionTitle.toLowerCase())) {
      setState({ status: "error", message: "A training session with this title already exists for the selected app." });
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
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to create training session." });
      return;
    }

    setSessions((current) => [body.session, ...current]);
    setCollapsedSessionIds((current) => {
      const next = new Set(current);
      next.add(body.session.id);
      return next;
    });
    setSetupForm({
      companyId: companies[0]?.id ?? "",
      targetAppMode: "new",
      targetAppId: "",
      appName: "",
      baseUrl: "",
      allowedOrigins: "",
      sessionTitle: ""
    });
    setState({ status: "success", message: "Training session created. Add a topic before recording." });
  }

  async function saveTopic() {
    if (!topicDialog) return;
    const trimmedTopicTitle = topicDialog.title.trim();
    if (!trimmedTopicTitle) {
      setState({ status: "error", message: "Topic title is required." });
      return;
    }
    const session = sessions.find((session) => session.id === topicDialog.sessionId);
    const isDuplicateTopic = session?.topics.some((topic) => topic.id !== topicDialog.topic?.id && topic.title.trim().toLowerCase() === trimmedTopicTitle.toLowerCase());
    if (isDuplicateTopic) {
      setState({ status: "error", message: "A topic with this name already exists in this training session." });
      return;
    }
    setState({ status: "submitting", message: "" });
    const isCreate = topicDialog.mode === "create";
    const response = await fetch(isCreate ? "/api/admin/guided-workflow-topics" : `/api/admin/guided-workflow-topics/${topicDialog.topic?.id}`, {
      method: isCreate ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordingSessionId: topicDialog.sessionId,
        title: topicDialog.title
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to save topic." });
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
    setState({ status: "success", message: isCreate ? "Topic created." : "Topic updated." });
  }

  async function deleteTopic(topic: GuidedWorkflowTopicRow) {
    if (!window.confirm("Delete this topic and its guide?")) return;
    const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to delete topic." });
      return;
    }

    setSessions((current) => current.map((session) => session.id === topic.recordingSessionId ? { ...session, topics: session.topics.filter((item) => item.id !== topic.id) } : session));
    setState({ status: "success", message: "Topic deleted." });
  }

  async function deleteRecordingSession(sessionId: string) {
    if (!window.confirm("Delete this recording session and all its topics?")) return;
    const response = await fetch(`/api/admin/guided-workflow-recording-sessions/${sessionId}`, { method: "DELETE" });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to delete session." });
      return;
    }

    setSessions((current) => current.filter((session) => session.id !== sessionId));
    if (appliedSessionFilter === sessionId) {
      setAppliedSessionFilter("");
      setPendingSessionFilter("");
    }
    setState({ status: "success", message: "Training session deleted." });
  }

  async function moveTopic(topic: GuidedWorkflowTopicRow, move: "up" | "down") {
    const response = await fetch(`/api/admin/guided-workflow-topics/${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ move })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to move topic." });
      return;
    }

    const topicsResponse = await fetch("/api/admin/guided-workflow-recording-sessions");
    const topicsBody = await topicsResponse.json().catch(() => null);
    if (Array.isArray(topicsBody?.sessions)) setSessions(topicsBody.sessions);
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
          <a className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" href="/api/admin/guided-workflow-recorder-plugin/download">
            <Download className="h-4 w-4" />Download plugin
          </a>
          <button
            aria-expanded={pluginHelpOpen}
            aria-label="Recorder plugin installation instructions"
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
              <button aria-label="Close instructions" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-950" onClick={() => setPluginHelpOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <ol className="relative mt-4 grid gap-3">
              {[
                "Click Download plugin and unzip the downloaded file.",
                "Open Chrome or Edge and go to chrome://extensions or edge://extensions.",
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

      {state.message ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{state.message}</p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Globe2 className="h-4 w-4" />Training setup</div>
            <p className="mt-1 text-sm text-slate-500">Create target app profiles, training sessions, and recorder config for trainers.</p>
          </div>
          {selectedApp ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedApp.name}</span> : null}
        </div>

        <div className="mt-4 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Company">
              <select className="input" onChange={(event) => updateSetup({ companyId: event.target.value, targetAppMode: "new", targetAppId: "", appName: "", baseUrl: "", allowedOrigins: "" })} value={setupForm.companyId}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Target app">
              <select
                className="input"
                onChange={(event) => {
                  if (event.target.value === "__new") {
                    updateSetup({ targetAppMode: "new", targetAppId: "", appName: "", baseUrl: "", allowedOrigins: "" });
                    return;
                  }
                  updateSetup({ targetAppMode: "existing" });
                  chooseExistingTargetApp(event.target.value);
                }}
                value={setupForm.targetAppMode === "new" ? "__new" : setupForm.targetAppId}
              >
                <option value="__new">Create new target app</option>
                {companyApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
              </select>
            </Field>
            <Field label="Training session title">
              <input className="input" placeholder="New training session" onChange={(event) => updateSetup({ sessionTitle: event.target.value })} value={setupForm.sessionTitle} />
              {duplicateSessionTitle ? <p className="mt-1 text-xs text-red-600">This session title already exists for the selected app.</p> : null}
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Target app name">
              <input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ appName: event.target.value })} placeholder="CRM Production" value={setupForm.appName} />
              {duplicateAppName ? <p className="mt-1 text-xs text-red-600">A target app with this name already exists for the selected company.</p> : null}
            </Field>
            <Field label="Target app URL"><input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ baseUrl: event.target.value })} placeholder="https://app.example.com" value={setupForm.baseUrl} /></Field>
            <Field label="Allowed origins"><input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ allowedOrigins: event.target.value })} placeholder="https://app.example.com" value={setupForm.allowedOrigins} /></Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-end">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={!setupForm.companyId || !trimmedSessionTitle || duplicateAppName || duplicateSessionTitle || (setupForm.targetAppMode === "new" && !setupForm.appName) || (setupForm.targetAppMode === "existing" && !setupForm.targetAppId) || state.status === "submitting"} onClick={createRecordingSession} type="button">
              <Plus className="h-4 w-4" />Create training session
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Company">
              <select className="input" value={pendingCompanyFilter} onChange={(event) => {
                const companyId = event.target.value;
                setPendingCompanyFilter(companyId);
                setPendingAppFilter(apps.find((app) => app.companyId === companyId)?.id ?? "");
              }}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Target app">
              <select className="input" value={pendingAppFilter} onChange={(event) => setPendingAppFilter(event.target.value)}>
                {filterCompanyApps.length === 0 ? <option value="">No apps available</option> : filterCompanyApps.map((app) => <option key={app.id} value={app.id}>{app.name}</option>)}
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
                          {companies.find((company) => company.id === session.companyId)?.name ?? "Unknown company"} · {apps.find((app) => app.id === session.targetAppId)?.name ?? "Unknown app"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">{sessionTopics.length === 0 ? "No topics" : "Topics available"}</td>
                    <td className="px-4 py-4 align-top text-sm text-slate-700">{sessionTopics.length}</td>
                    <td className="px-4 py-4 align-top text-right text-sm font-medium">
                      <button className="mr-2 inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setTopicDialog({ mode: "create", sessionId: session.id, title: "" })} type="button">Add topic</button>
                      <button aria-label="Delete session" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50" onClick={() => deleteRecordingSession(session.id)} type="button"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>

                  {!isCollapsed && sessionTopics.map((topic) => (
                    <tr className="border-t border-slate-100 bg-white" key={topic.id}>
                      <td className="px-4 py-3 text-sm text-slate-700"></td>
                      <td className="px-4 py-3 text-sm text-slate-700">{topic.title}</td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${topic.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{topic.status}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-medium">
                        <button aria-label="Recorder config" className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900" onClick={() => setConfigTopicId(topic.id)} type="button"><Clipboard className="h-4 w-4" /></button>
                      <button aria-label="Edit topic" className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:text-slate-900" onClick={() => setTopicDialog({ mode: "edit", sessionId: session.id, topic, title: topic.title })} type="button"><Edit3 className="h-4 w-4" /></button>
                        <button aria-label="Delete topic" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:text-red-800" onClick={() => deleteTopic(topic)} type="button"><Trash2 className="h-4 w-4" /></button>
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
            <div className="mt-4 flex justify-end gap-2">
              <button className="button-secondary" onClick={() => setTopicDialog(null)} type="button">Cancel</button>
              <button className="inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white" onClick={saveTopic} type="button" disabled={duplicateTopicTitle}>Save</button>
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

function splitLines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}
