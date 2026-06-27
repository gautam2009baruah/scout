"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Copy, Download, Globe2, Info, Plus, X } from "lucide-react";
import type { GuidedWorkflowRecordingSessionRow, GuidedWorkflowTargetAppRow } from "@/lib/admin/guided-workflows";

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
  const [selectedSessionId, setSelectedSessionId] = useState(recordingSessions[0]?.id ?? "");
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
    sessionTitle: "New training session"
  });

  const companyApps = apps.filter((app) => app.companyId === setupForm.companyId);
  const selectedApp = apps.find((app) => app.id === setupForm.targetAppId) ?? null;
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0] ?? null;
  const recorderConfig = selectedSession ? recorderConfigForSession(selectedSession) : null;

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
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to create training session." });
      return;
    }

    setSessions((current) => [body.session, ...current]);
    setSelectedSessionId(body.session.id);
    setState({ status: "success", message: "Training session created. Copy the recorder config into the trainer extension." });
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

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
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
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Target app name"><input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ appName: event.target.value })} placeholder="CRM Production" value={setupForm.appName} /></Field>
              <Field label="Target app URL"><input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ baseUrl: event.target.value })} placeholder="https://app.example.com" value={setupForm.baseUrl} /></Field>
            </div>

            <Field label="Allowed origins"><textarea className="input min-h-20 py-2" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ allowedOrigins: event.target.value })} placeholder="https://app.example.com" value={setupForm.allowedOrigins} /></Field>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Field label="Training session title"><input className="input" onChange={(event) => updateSetup({ sessionTitle: event.target.value })} value={setupForm.sessionTitle} /></Field>
              <button className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={!setupForm.companyId || !setupForm.sessionTitle || (setupForm.targetAppMode === "new" && !setupForm.appName) || (setupForm.targetAppMode === "existing" && !setupForm.targetAppId) || state.status === "submitting"} onClick={createRecordingSession} type="button">
                <Plus className="h-4 w-4" />Create training session
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Clipboard className="h-4 w-4" />Recorder extension config</div>
            {sessions.length > 0 ? (
              <div className="mt-3 grid gap-3">
                <Field label="Training session">
                  <select className="input" onChange={(event) => setSelectedSessionId(event.target.value)} value={selectedSessionId}>
                    {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
                  </select>
                </Field>
                {recorderConfig ? (
                  <>
                    <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{JSON.stringify(recorderConfig, null, 2)}</pre>
                    <button className="button-secondary justify-center gap-2 bg-white" onClick={() => copyText("recorder-config", JSON.stringify(recorderConfig, null, 2))} type="button">
                      {copiedKey === "recorder-config" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copiedKey === "recorder-config" ? "Copied" : "Copy config"}
                    </button>
                  </>
                ) : <p className="text-sm text-slate-500">This older session does not have a saved recorder token.</p>}
              </div>
            ) : <p className="mt-4 text-sm text-slate-500">Create a training session to generate recorder config.</p>}
          </div>
        </div>
      </section>

    </div>
  );
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

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}
