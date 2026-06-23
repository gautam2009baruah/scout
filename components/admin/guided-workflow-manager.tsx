"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileJson, Play, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import type { GuideStatus, GuideStep, RecordedAction } from "@/shared/guideTypes";
import type { GuidedWorkflowRow } from "@/lib/admin/guided-workflows";

type CompanyOption = {
  id: string;
  name: string;
};

type GuidedWorkflowManagerProps = {
  companies: CompanyOption[];
  guides: GuidedWorkflowRow[];
};

type EditorState = {
  title: string;
  description: string;
  status: GuideStatus;
  steps: GuideStep[];
};

export function GuidedWorkflowManager({ companies, guides }: GuidedWorkflowManagerProps) {
  const [items, setItems] = useState(guides);
  const [selectedId, setSelectedId] = useState(guides[0]?.id ?? "");
  const selected = useMemo(() => items.find((guide) => guide.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const [editor, setEditor] = useState<EditorState>(() => editorFromGuide(selected));
  const [newGuide, setNewGuide] = useState({
    companyId: companies[0]?.id ?? "",
    title: "New guided workflow",
    description: "",
    recordingJson: "[]"
  });
  const [state, setState] = useState<{ status: "idle" | "submitting" | "error" | "success"; message: string }>({ status: "idle", message: "" });

  function selectGuide(guide: GuidedWorkflowRow) {
    setSelectedId(guide.id);
    setEditor(editorFromGuide(guide));
    setState({ status: "idle", message: "" });
  }

  async function createGuide() {
    setState({ status: "submitting", message: "" });

    let recordedActions: RecordedAction[];

    try {
      recordedActions = JSON.parse(newGuide.recordingJson);
    } catch {
      setState({ status: "error", message: "Recording JSON is invalid." });
      return;
    }

    if (!Array.isArray(recordedActions)) {
      setState({ status: "error", message: "Recording JSON must be an array of recorded actions." });
      return;
    }

    const response = await fetch("/api/admin/guided-workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: newGuide.companyId,
        title: newGuide.title,
        description: newGuide.description,
        recordedActions
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ status: "error", message: typeof body?.message === "string" ? body.message : "Unable to create guide." });
      return;
    }

    setItems((current) => [body.guide, ...current]);
    setSelectedId(body.guide.id);
    setEditor(editorFromGuide(body.guide));
    setState({ status: "success", message: "Guide draft created." });
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
    setEditor((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step)
    }));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setEditor((current) => {
      const next = [...current.steps];
      const targetIndex = index + direction;

      if (targetIndex < 0 || targetIndex >= next.length) {
        return current;
      }

      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return { ...current, steps: next.map((step, stepIndex) => ({ ...step, order: stepIndex + 1 })) };
    });
  }

  function deleteStep(index: number) {
    setEditor((current) => ({
      ...current,
      steps: current.steps.filter((_, stepIndex) => stepIndex !== index).map((step, stepIndex) => ({ ...step, order: stepIndex + 1 }))
    }));
  }

  function exportGuide() {
    if (!selected) return;
    const payload = {
      id: selected.id,
      title: editor.title,
      description: editor.description,
      status: editor.status,
      createdAt: selected.createdAt,
      updatedAt: new Date().toISOString(),
      steps: editor.steps
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${editor.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "guide"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="grid gap-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Plus className="h-4 w-4" />
            New guide from recording
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="Company">
              <select className="input" onChange={(event) => setNewGuide({ ...newGuide, companyId: event.target.value })} value={newGuide.companyId}>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Field>
            <Field label="Title">
              <input className="input" onChange={(event) => setNewGuide({ ...newGuide, title: event.target.value })} value={newGuide.title} />
            </Field>
            <Field label="Recording JSON">
              <textarea className="input min-h-32 py-2 font-mono" onChange={(event) => setNewGuide({ ...newGuide, recordingJson: event.target.value })} value={newGuide.recordingJson} />
            </Field>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={!newGuide.companyId || state.status === "submitting"} onClick={createGuide} type="button">
              <FileJson className="h-4 w-4" />
              Generate draft
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-2 shadow-sm">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">No guided workflows yet.</p>
          ) : items.map((guide) => (
            <button
              className={`block w-full rounded-md px-3 py-3 text-left text-sm transition ${selected?.id === guide.id ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-50"}`}
              key={guide.id}
              onClick={() => selectGuide(guide)}
              type="button"
            >
              <span className="block font-semibold">{guide.title}</span>
              <span className={`mt-1 block text-xs ${selected?.id === guide.id ? "text-slate-300" : "text-slate-500"}`}>
                {guide.companyName} · {guide.status} · {guide.steps.length} steps
              </span>
            </button>
          ))}
        </section>
      </aside>

      <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
        {selected ? (
          <div className="grid gap-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.companyName}</p>
                <h2 className="mt-1 text-xl font-semibold tracking-normal text-slate-950">Guide editor</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <button className="button-secondary" onClick={regenerateGuide} type="button"><RefreshCw className="h-4 w-4" />Regenerate</button>
                <button className="button-secondary" onClick={exportGuide} type="button"><Download className="h-4 w-4" />Export JSON</button>
                <button className="button-secondary" onClick={() => saveGuide("draft")} type="button"><Save className="h-4 w-4" />Save</button>
                <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white" onClick={() => saveGuide("published")} type="button"><Play className="h-4 w-4" />Publish</button>
              </div>
            </div>

            {state.message ? (
              <p className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{state.message}</p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Guide title">
                <input className="input" onChange={(event) => setEditor({ ...editor, title: event.target.value })} value={editor.title} />
              </Field>
              <Field label="Description">
                <input className="input" onChange={(event) => setEditor({ ...editor, description: event.target.value })} value={editor.description} />
              </Field>
            </div>

            <div className="grid gap-3">
              {editor.steps.length === 0 ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No steps generated yet. Paste recorder JSON and generate a draft.</p>
              ) : editor.steps.map((step, index) => (
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
                    <Field label="Step title">
                      <input className="input" onChange={(event) => updateStep(index, { title: event.target.value })} value={step.title} />
                    </Field>
                    <Field label="Trigger">
                      <select className="input" onChange={(event) => updateStep(index, { trigger: event.target.value as GuideStep["trigger"] })} value={step.trigger}>
                        <option value="click">Click</option>
                        <option value="input">Input</option>
                        <option value="manualNext">Manual next</option>
                      </select>
                    </Field>
                    <Field label="URL match">
                      <input className="input" onChange={(event) => updateStep(index, { urlMatch: event.target.value })} value={step.urlMatch} />
                    </Field>
                    <Field label="Tooltip message">
                      <input className="input" onChange={(event) => updateStep(index, { message: event.target.value })} value={step.message} />
                    </Field>
                  </div>
                  <p className="mt-3 truncate rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Target: {step.target.selectorCandidates[0]?.type ?? "none"} {step.target.selectorCandidates[0]?.value ?? ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="p-5 text-sm text-slate-500">Create a guide draft to start editing.</p>
        )}
      </section>
    </div>
  );
}

function editorFromGuide(guide: GuidedWorkflowRow | null): EditorState {
  return {
    title: guide?.title ?? "",
    description: guide?.description ?? "",
    status: guide?.status ?? "draft",
    steps: guide?.steps ?? []
  };
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-2 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900 [&_input.input]:h-10 [&_select.input]:h-10">
        {children}
      </div>
    </label>
  );
}

function IconAction({ children, disabled, label, onClick }: { children: React.ReactNode; disabled?: boolean; label: string; onClick: () => void }) {
  return (
    <button aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 disabled:opacity-40" disabled={disabled} onClick={onClick} title={label} type="button">
      {children}
    </button>
  );
}
