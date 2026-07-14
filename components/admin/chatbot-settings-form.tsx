"use client";

import { FormEvent, useMemo, useState } from "react";
import { RefreshCw, Save, Settings2 } from "lucide-react";
import type { ChatbotLifecycleSettings, ChatbotLifecycleSettingsRecord } from "@/lib/chat/lifecycle-settings";

type TargetAppOption = {
  id: string;
  name: string;
  companyId: string;
};

type Props = {
  companyName: string;
  defaults: ChatbotLifecycleSettings;
  initialSettings: ChatbotLifecycleSettingsRecord[];
  targetApps: TargetAppOption[];
};

type ScopeValue = "global" | string;

type Draft = {
  scope: ScopeValue;
  maxContextMessages: string;
  maxContextTokens: string;
  inactivityTimeoutSeconds: string;
  resetOnLogoutEvent: boolean;
  resetOnUserChange: boolean;
  resetOnTargetAppChange: boolean;
};

function toDraft(scope: ScopeValue, settings: ChatbotLifecycleSettings) {
  return {
    scope,
    maxContextMessages: String(settings.maxContextMessages),
    maxContextTokens: String(settings.maxContextTokens),
    inactivityTimeoutSeconds: String(settings.inactivityTimeoutSeconds),
    resetOnLogoutEvent: settings.resetOnLogoutEvent,
    resetOnUserChange: settings.resetOnUserChange,
    resetOnTargetAppChange: settings.resetOnTargetAppChange
  };
}

export function ChatbotSettingsForm({ companyName, defaults, initialSettings, targetApps }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [scope, setScope] = useState<ScopeValue>("global");
  const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });

  const byScope = useMemo(() => {
    const map = new Map<ScopeValue, ChatbotLifecycleSettingsRecord>();
    for (const item of settings) {
      map.set(item.targetAppId ?? "global", item);
    }
    return map;
  }, [settings]);

  const activeSettings = byScope.get(scope) ?? {
    id: "",
    companyId: "",
    targetAppId: scope === "global" ? null : scope,
    ...defaults
  };

  const [draft, setDraft] = useState<Draft>(toDraft(scope, activeSettings));

  function updateScope(nextScope: ScopeValue) {
    setScope(nextScope);
    const nextSettings = byScope.get(nextScope) ?? {
      id: "",
      companyId: "",
      targetAppId: nextScope === "global" ? null : nextScope,
      ...defaults
    };
    setDraft(toDraft(nextScope, nextSettings));
    setStatus({ type: "idle", message: "" });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ type: "saving", message: "Saving settings..." });

    const response = await fetch("/api/admin/chatbot-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetAppId: draft.scope === "global" ? null : draft.scope,
        maxContextMessages: Number(draft.maxContextMessages),
        maxContextTokens: Number(draft.maxContextTokens),
        inactivityTimeoutSeconds: Number(draft.inactivityTimeoutSeconds),
        resetOnLogoutEvent: draft.resetOnLogoutEvent,
        resetOnUserChange: draft.resetOnUserChange,
        resetOnTargetAppChange: draft.resetOnTargetAppChange
      })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to save settings." });
      return;
    }

    setSettings(Array.isArray(body?.settings) ? body.settings : []);
    setStatus({ type: "success", message: "Chatbot settings saved." });
  }

  async function resetScope() {
    setStatus({ type: "saving", message: "Resetting settings..." });

    const response = await fetch("/api/admin/chatbot-settings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetAppId: draft.scope === "global" ? null : draft.scope })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to reset settings." });
      return;
    }

    const nextSettings = Array.isArray(body?.settings) ? body.settings : [];
    setSettings(nextSettings);
    const fallback = defaults;
    setDraft(toDraft(scope, fallback));
    setStatus({ type: "success", message: "Scope reset to defaults." });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Chatbot Conversation Settings</h1>
            <p className="mt-1 text-sm text-slate-600">Manage rolling context, inactivity resets, and lifecycle rules for {companyName} globally or per target application.</p>
          </div>
        </div>
      </div>

      <form className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm" onSubmit={save}>
        <div className="grid gap-6 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Scope
            <select
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              value={scope}
              onChange={(event) => updateScope(event.target.value)}
            >
              <option value="global">Global default</option>
              {targetApps.map((app) => (
                <option key={app.id} value={app.id}>{app.name}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Max context messages
            <input className="h-11 rounded-xl border border-slate-200 px-3 text-sm" min={10} max={30} type="number" value={draft.maxContextMessages} onChange={(event) => setDraft((current) => ({ ...current, maxContextMessages: event.target.value }))} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Max context tokens
            <input className="h-11 rounded-xl border border-slate-200 px-3 text-sm" min={3000} max={8000} step={100} type="number" value={draft.maxContextTokens} onChange={(event) => setDraft((current) => ({ ...current, maxContextTokens: event.target.value }))} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Inactivity timeout (seconds)
            <input className="h-11 rounded-xl border border-slate-200 px-3 text-sm" min={60} max={604800} type="number" value={draft.inactivityTimeoutSeconds} onChange={(event) => setDraft((current) => ({ ...current, inactivityTimeoutSeconds: event.target.value }))} />
          </label>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnLogoutEvent} onChange={(event) => setDraft((current) => ({ ...current, resetOnLogoutEvent: event.target.checked }))} type="checkbox" />
            Reset on logout/session expiry event
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnUserChange} onChange={(event) => setDraft((current) => ({ ...current, resetOnUserChange: event.target.checked }))} type="checkbox" />
            Reset on user or tenant change
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnTargetAppChange} onChange={(event) => setDraft((current) => ({ ...current, resetOnTargetAppChange: event.target.checked }))} type="checkbox" />
            Reset on target app/business context change
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white" type="submit">
            <Save className="h-4 w-4" />
            Save settings
          </button>
          <button className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700" onClick={resetScope} type="button">
            <RefreshCw className="h-4 w-4" />
            Reset scope to defaults
          </button>
          {status.message ? <span className={`text-sm ${status.type === "error" ? "text-red-600" : "text-slate-600"}`}>{status.message}</span> : null}
        </div>
      </form>
    </div>
  );
}
