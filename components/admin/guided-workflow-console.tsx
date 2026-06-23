"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Clipboard, Download, Globe2, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { GuideStatus, GuideStep } from "@/shared/guideTypes";
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
  const [latestToken, setLatestToken] = useState("");
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>({ status: "idle", message: "" });
  const companyApps = apps.filter((app) => app.companyId === setupForm.companyId);
  const selectedApp = apps.find((app) => app.id === setupForm.targetAppId) ?? null;

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
    setLatestToken(body.recorderToken);
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

  async function convertSession(sessionId: string) {
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
    setState({ status: "success", message: "Guide draft generated from the recording session." });
  }

  async function saveGuide(nextStatus?: GuideStatus) {
    if (!selected) return;
    setState({ status: "submitting", message: "" });
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
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to save guide." });
      return;
    }

    setItems((current) => current.map((guide) => guide.id === body.guide.id ? body.guide : guide));
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setState({ status: "success", message: nextStatus === "published" ? "Guide published." : "Guide saved." });
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

  function deleteStep(index: number) {
    setEditor((current) => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index).map((step, stepIndex) => ({ ...step, order: stepIndex + 1 })) }));
  }

  function exportGuide() {
    if (!selected) return;
    downloadJson(`${slug(editor.title) || "guide"}.json`, { ...selected, title: editor.title, description: editor.description, status: editor.status, steps: editor.steps });
  }

  const recorderConfig = latestToken ? {
    scoutBaseUrl: typeof window === "undefined" ? "" : window.location.origin,
    recorderToken: latestToken,
    ingestPath: "/api/guided-workflow-recorder/actions"
  } : null;

  return (
    <div className="grid gap-6">
      {state.message ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{state.message}</p>
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Globe2 className="h-4 w-4" />Training setup</div>
            <p className="mt-1 text-sm text-slate-500">Reuse a target app for repeat training sessions, or create a new app profile the first time.</p>
          </div>
          {selectedApp ? <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{selectedApp.name}</span> : null}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Company">
                <select
                  className="input"
                  onChange={(event) => updateSetup({ companyId: event.target.value, targetAppMode: "new", targetAppId: "", appName: "", baseUrl: "", allowedOrigins: "" })}
                  value={setupForm.companyId}
                >
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
              <Field label="Target app name">
                <input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ appName: event.target.value })} placeholder="CRM Production" value={setupForm.appName} />
              </Field>
              <Field label="Target app URL">
                <input className="input" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ baseUrl: event.target.value })} placeholder="https://app.example.com" value={setupForm.baseUrl} />
              </Field>
            </div>

            <Field label="Allowed origins">
              <textarea className="input min-h-20 py-2" disabled={setupForm.targetAppMode === "existing"} onChange={(event) => updateSetup({ allowedOrigins: event.target.value })} placeholder="https://app.example.com" value={setupForm.allowedOrigins} />
            </Field>

            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <Field label="Training session title">
                <input className="input" onChange={(event) => updateSetup({ sessionTitle: event.target.value })} value={setupForm.sessionTitle} />
              </Field>
              <button
                className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!setupForm.companyId || !setupForm.sessionTitle || (setupForm.targetAppMode === "new" && !setupForm.appName) || (setupForm.targetAppMode === "existing" && !setupForm.targetAppId) || state.status === "submitting"}
                onClick={createRecordingSession}
                type="button"
              >
                <Plus className="h-4 w-4" />Create training session
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950"><Clipboard className="h-4 w-4" />Recorder extension config</div>
            {recorderConfig ? (
              <div className="mt-3 grid gap-3">
                <pre className="max-h-52 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{JSON.stringify(recorderConfig, null, 2)}</pre>
                <button className="button-secondary justify-center bg-white" onClick={() => navigator.clipboard.writeText(JSON.stringify(recorderConfig, null, 2))} type="button">Copy config</button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Create a training session to generate the token for the trainer extension.</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="grid gap-4">
          <Panel title="Recording sessions">
            {sessions.length === 0 ? <p className="text-sm text-slate-500">No training sessions yet.</p> : sessions.map((session) => (
              <div className="rounded-lg border border-slate-200 p-3" key={session.id}>
                <p className="text-sm font-semibold text-slate-950">{session.title}</p>
                <p className="mt-1 text-xs text-slate-500">{session.targetAppName ?? session.companyName} | {session.status} | {session.actionsCount} actions</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="button-secondary h-8 px-3 text-xs" onClick={() => updateSession(session.id, "paused")} type="button">Pause</button>
                  <button className="button-secondary h-8 px-3 text-xs" onClick={() => updateSession(session.id, "stopped")} type="button">Stop</button>
                  <button className="inline-flex h-8 items-center rounded-lg bg-slate-950 px-3 text-xs font-semibold text-white disabled:opacity-40" disabled={session.actionsCount === 0 || session.status === "converted"} onClick={() => convertSession(session.id)} type="button">Generate guide</button>
                </div>
              </div>
            ))}
          </Panel>

          <Panel title="Player install snippets">
            {apps.length === 0 ? <p className="text-sm text-slate-500">Add a target app to get its install snippet.</p> : apps.map((app) => (
              <div className="rounded-lg border border-slate-200 p-3" key={app.id}>
                <p className="text-sm font-semibold text-slate-950">{app.name}</p>
                <p className="mt-1 text-xs text-slate-500">{app.baseUrl || app.companyName}</p>
                <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-white">{installSnippet(app.id)}</pre>
                <button className="button-secondary mt-3 h-8 px-3 text-xs" onClick={() => navigator.clipboard.writeText(installSnippet(app.id))} type="button">Copy snippet</button>
              </div>
            ))}
          </Panel>

          <Panel title="Published and draft guides">
            {items.length === 0 ? <p className="text-sm text-slate-500">No guided workflows yet.</p> : items.map((guide) => (
              <button className={`block w-full rounded-md px-3 py-3 text-left text-sm transition ${selected?.id === guide.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"}`} key={guide.id} onClick={() => selectGuide(guide)} type="button">
                <span className="block font-semibold">{guide.title}</span>
                <span className={`mt-1 block text-xs ${selected?.id === guide.id ? "text-slate-300" : "text-slate-500"}`}>{guide.targetAppName ?? guide.companyName} | {guide.status} | {guide.steps.length} steps</span>
              </button>
            ))}
          </Panel>
        </aside>

        <GuideEditor deleteStep={deleteStep} editor={editor} exportGuide={exportGuide} moveStep={moveStep} regenerateGuide={regenerateGuide} saveGuide={saveGuide} selected={selected} setEditor={setEditor} updateStep={updateStep} />
      </section>
    </div>
  );
}

function GuideEditor({ deleteStep, editor, exportGuide, moveStep, regenerateGuide, saveGuide, selected, setEditor, updateStep }: {
  deleteStep(index: number): void;
  editor: EditorState;
  exportGuide(): void;
  moveStep(index: number, direction: -1 | 1): void;
  regenerateGuide(): void;
  saveGuide(nextStatus?: GuideStatus): void;
  selected: GuidedWorkflowRow | null;
  setEditor(next: EditorState): void;
  updateStep(index: number, patch: Partial<GuideStep>): void;
}) {
  if (!selected) return <section className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Create or convert a training session to start editing a guide.</section>;

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.targetAppName ?? selected.companyName}</p>
            <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">Guide editor</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="button-secondary" onClick={regenerateGuide} type="button"><RefreshCw className="h-4 w-4" />Regenerate</button>
            <button className="button-secondary" onClick={exportGuide} type="button"><Download className="h-4 w-4" />Export JSON</button>
            <button className="button-secondary" onClick={() => saveGuide("draft")} type="button"><Save className="h-4 w-4" />Save</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white" onClick={() => saveGuide("published")} type="button"><Play className="h-4 w-4" />Publish</button>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Guide title"><input className="input" onChange={(event) => setEditor({ ...editor, title: event.target.value })} value={editor.title} /></Field>
          <Field label="Description"><input className="input" onChange={(event) => setEditor({ ...editor, description: event.target.value })} value={editor.description} /></Field>
        </div>
        <div className="grid gap-3">
          {editor.steps.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No steps generated yet.</p> : editor.steps.map((step, index) => (
            <div className="rounded-lg border border-slate-200 p-4" key={step.id}>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-950">Step {index + 1}</span>
                <div className="flex gap-1">
                  <IconAction disabled={index === 0} label="Move up" onClick={() => moveStep(index, -1)}><ArrowUp className="h-4 w-4" /></IconAction>
                  <IconAction disabled={index === editor.steps.length - 1} label="Move down" onClick={() => moveStep(index, 1)}><ArrowDown className="h-4 w-4" /></IconAction>
                  <IconAction label="Delete step" onClick={() => deleteStep(index)}><Trash2 className="h-4 w-4" /></IconAction>
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Step title"><input className="input" onChange={(event) => updateStep(index, { title: event.target.value })} value={step.title} /></Field>
                <Field label="Trigger"><select className="input" onChange={(event) => updateStep(index, { trigger: event.target.value as GuideStep["trigger"] })} value={step.trigger}><option value="click">Click</option><option value="input">Input</option><option value="manualNext">Manual next</option></select></Field>
                <Field label="URL match"><input className="input" onChange={(event) => updateStep(index, { urlMatch: event.target.value })} value={step.urlMatch} /></Field>
                <Field label="Tooltip message"><input className="input" onChange={(event) => updateStep(index, { message: event.target.value })} value={step.message} /></Field>
              </div>
              <p className="mt-3 truncate rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">Target: {step.target.selectorCandidates[0]?.type ?? "none"} {step.target.selectorCandidates[0]?.value ?? ""}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function editorFromGuide(guide: GuidedWorkflowRow | null): EditorState {
  return { title: guide?.title ?? "", description: guide?.description ?? "", status: guide?.status ?? "draft", steps: guide?.steps ?? [] };
}

function splitLines(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
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
  const baseUrl = typeof window === "undefined" ? "http://localhost:3001" : window.location.origin;

  return `<script src="${baseUrl}/scout-adoption-player.js"></script>
<script>
  ScoutAdoptionPlayer.init({
    scoutBaseUrl: "${baseUrl}",
    targetAppId: "${targetAppId}"
  });
</script>`;
}

function Panel({ children, title }: { children: ReactNode; title: string }) {
  return <section className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><h2 className="text-sm font-semibold text-slate-950">{title}</h2>{children}</section>;
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return <label className="block"><span className="text-sm font-medium text-slate-700">{label}</span><div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">{children}</div></label>;
}

function IconAction({ children, disabled, label, onClick }: { children: ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return <button aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40" disabled={disabled} onClick={onClick} title={label} type="button">{children}</button>;
}
