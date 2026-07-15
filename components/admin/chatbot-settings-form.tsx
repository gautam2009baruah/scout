"use client";

import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { Ban, CircleHelp, Download, KeyRound, Pause, Pencil, RefreshCw, RotateCw, Save, Settings2, ShieldCheck } from "lucide-react";
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

type ChatbotApiKeyStatus = "active" | "suspended" | "revoked";

type ChatbotApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  environment: string;
  status: ChatbotApiKeyStatus;
  isActive: boolean;
  allowedOrigins: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type EmbedPackageResponse = {
  configSnippet: string;
  installSnippet: string;
  htmlSample: string;
  reactSample: string;
  obfuscatedCompanyId: string;
  obfuscatedTargetAppId: string;
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

type TabId = "conversation" | "keys" | "package";

function HelpHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center align-middle group">
      <CircleHelp className="h-3.5 w-3.5 text-slate-400" />
      <span className="pointer-events-none absolute left-0 top-6 z-30 hidden w-72 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-100 shadow-lg group-hover:block">
        {text}
      </span>
    </span>
  );
}

function IconActionButton({
  label,
  onClick,
  disabled,
  tone = "default",
  children
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-200 text-emerald-700"
      : tone === "warning"
      ? "border-amber-200 text-amber-700"
      : tone === "danger"
      ? "border-red-200 text-red-700"
      : "border-slate-200 text-slate-700";

  return (
    <div className="relative group">
      <button
        className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white ${toneClass} disabled:opacity-50`}
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {children}
      </button>
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 hidden w-56 -translate-x-1/2 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-100 shadow-lg whitespace-normal break-words group-hover:block">
        {label}
      </span>
    </div>
  );
}

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
  const [activeTab, setActiveTab] = useState<TabId>("conversation");
  const [settings, setSettings] = useState(initialSettings);
  const [scope, setScope] = useState<ScopeValue>("global");
  const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [apiKeys, setApiKeys] = useState<ChatbotApiKeyRecord[]>([]);
  const [strictEnvironmentEnforcement, setStrictEnvironmentEnforcement] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [policyStatus, setPolicyStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [revealedApiKey, setRevealedApiKey] = useState<string>("");
  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const [editAllowedOrigins, setEditAllowedOrigins] = useState<string>("");
  const [editExpiresAt, setEditExpiresAt] = useState<string>("");
  const [apiKeyForm, setApiKeyForm] = useState({
    name: "",
    environment: "test",
    allowedOrigins: "",
    expiresAt: ""
  });
  const [embedStatus, setEmbedStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });
  const [embedForm, setEmbedForm] = useState({
    targetAppId: targetApps[0]?.id ?? "",
    userId: "scout-client-user",
    apiKey: "",
    scoutUrl: typeof window === "undefined" ? "http://localhost:3000" : window.location.origin,
    apiUrl: "http://localhost:4200",
    assistantName: "Scout Assistant",
    brandColor: "#111827",
    accentColor: "#0ea5e9"
  });
  const [embedResult, setEmbedResult] = useState<EmbedPackageResponse | null>(null);

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

  async function loadApiKeys() {
    const response = await fetch("/api/admin/chatbot-settings/api-keys", { method: "GET" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to load API keys.");
    }

    setApiKeys(Array.isArray(body?.keys) ? body.keys : []);
    setStrictEnvironmentEnforcement(body?.strictEnvironmentEnforcement === true);
  }

  useEffect(() => {
    loadApiKeys().catch((error) => {
      setApiKeyStatus({ type: "error", message: error instanceof Error ? error.message : "Unable to load API keys." });
    });
  }, []);

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

  function parseAllowedOrigins(input: string) {
    return Array.from(new Set(input.split(/\r?\n|,/g).map((value) => value.trim()).filter(Boolean)));
  }

  async function createApiKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApiKeyStatus({ type: "saving", message: "Creating API key..." });
    setRevealedApiKey("");

    const response = await fetch("/api/admin/chatbot-settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: apiKeyForm.name,
        environment: apiKeyForm.environment,
        allowedOrigins: parseAllowedOrigins(apiKeyForm.allowedOrigins),
        expiresAt: apiKeyForm.expiresAt || null
      })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setApiKeyStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to create API key." });
      return;
    }

    setRevealedApiKey(typeof body?.apiKey === "string" ? body.apiKey : "");
    setApiKeyForm((current) => ({ ...current, name: "" }));
    await loadApiKeys();
    setApiKeyStatus({ type: "success", message: "API key created. Copy it now, it is shown only once." });
  }

  async function updateApiKey(id: string, next: Partial<{ status: ChatbotApiKeyStatus; allowedOrigins: string[]; expiresAt: string | null }>) {
    setApiKeyStatus({ type: "saving", message: "Updating API key..." });

    const response = await fetch(`/api/admin/chatbot-settings/api-keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next)
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setApiKeyStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to update API key." });
      return false;
    }

    await loadApiKeys();
    setApiKeyStatus({ type: "success", message: "API key updated." });
    return true;
  }

  async function saveStrictEnvironmentEnforcement() {
    setPolicyStatus({ type: "saving", message: "Saving security policy..." });

    const response = await fetch("/api/admin/chatbot-settings/api-keys", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strictEnvironmentEnforcement })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setPolicyStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to update strict environment enforcement." });
      return;
    }

    setStrictEnvironmentEnforcement(body?.strictEnvironmentEnforcement === true);
    setPolicyStatus({ type: "success", message: "Security policy updated." });
  }

  function beginEditKey(key: ChatbotApiKeyRecord) {
    setEditingKeyId(key.id);
    setEditAllowedOrigins(key.allowedOrigins.join("\n"));
    setEditExpiresAt(key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 16) : "");
  }

  async function saveKeyPolicy(keyId: string) {
    const ok = await updateApiKey(keyId, {
      allowedOrigins: parseAllowedOrigins(editAllowedOrigins),
      expiresAt: editExpiresAt ? new Date(editExpiresAt).toISOString() : null
    });
    if (!ok) {
      return;
    }
    setEditingKeyId(null);
    setEditAllowedOrigins("");
    setEditExpiresAt("");
  }

  async function rotateApiKey(id: string) {
    setApiKeyStatus({ type: "saving", message: "Rotating API key..." });
    setRevealedApiKey("");

    const response = await fetch(`/api/admin/chatbot-settings/api-keys/${id}/rotate`, {
      method: "POST"
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setApiKeyStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to rotate API key." });
      return;
    }

    setRevealedApiKey(typeof body?.apiKey === "string" ? body.apiKey : "");
    await loadApiKeys();
    setApiKeyStatus({ type: "success", message: "API key rotated. Copy the new key now." });
  }

  function downloadTextFile(fileName: string, content: string) {
    const blob = new Blob([content], { type: "text/javascript;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function generateEmbedPackage() {
    setEmbedStatus({ type: "saving", message: "Generating package snippets..." });
    setEmbedResult(null);

    const response = await fetch("/api/admin/chatbot-settings/embed-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(embedForm)
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      setEmbedStatus({ type: "error", message: typeof body?.message === "string" ? body.message : "Unable to generate snippets." });
      return;
    }

    setEmbedResult(body as EmbedPackageResponse);
    setEmbedStatus({ type: "success", message: "Embed package ready. Download both files and include them in your client app." });
  }

  function formatDate(value: string | null) {
    if (!value) return "-";
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
  }

  return (
    <section className="grid gap-0">
      <div className="rounded-t-lg border border-slate-200 border-b-0 bg-white px-4 pt-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
            <Settings2 className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-950">Chatbot Settings</h1>
            <p className="mt-1 text-xs text-slate-500">Company scope: {companyName}</p>
          </div>
        </div>

        <div className="mt-3 border-b border-slate-200">
          <div aria-label="Chatbot settings sections" className="flex items-end gap-2" role="tablist">
            <button
              aria-controls="chatbot-conversation-panel"
              aria-selected={activeTab === "conversation"}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                activeTab === "conversation"
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="chatbot-conversation-tab"
              onClick={() => setActiveTab("conversation")}
              role="tab"
              type="button"
            >
              Chatbot Conversation Settings
            </button>
            <button
              aria-controls="chatbot-keys-panel"
              aria-selected={activeTab === "keys"}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                activeTab === "keys"
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="chatbot-keys-tab"
              onClick={() => setActiveTab("keys")}
              role="tab"
              type="button"
            >
              Chatbot API Keys
            </button>
            <button
              aria-controls="chatbot-package-panel"
              aria-selected={activeTab === "package"}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                activeTab === "package"
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="chatbot-package-tab"
              onClick={() => setActiveTab("package")}
              role="tab"
              type="button"
            >
              Chatbot Settings Package
            </button>
          </div>
        </div>
      </div>

      <div
        aria-labelledby={
          activeTab === "conversation"
            ? "chatbot-conversation-tab"
            : activeTab === "keys"
            ? "chatbot-keys-tab"
            : "chatbot-package-tab"
        }
        className="rounded-b-lg border border-slate-200 border-t-0 bg-white shadow-sm"
        id={
          activeTab === "conversation"
            ? "chatbot-conversation-panel"
            : activeTab === "keys"
            ? "chatbot-keys-panel"
            : "chatbot-package-panel"
        }
        role="tabpanel"
      >
        <div className="space-y-6 p-5">
          {activeTab === "conversation" ? (
            <form className="space-y-6" onSubmit={save}>
              <p className="text-sm text-slate-600">Manage rolling context, inactivity resets, and lifecycle rules globally or per target application.</p>

        <div className="grid gap-6 lg:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium text-slate-700">
            Scope
            <select
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
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
            <span className="inline-flex items-center gap-1.5">Max context messages <HelpHint text="Number of recent user-assistant messages retained in prompt context. Higher values improve continuity but increase token usage and latency." /></span>
            <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" min={10} max={30} type="number" value={draft.maxContextMessages} onChange={(event) => setDraft((current) => ({ ...current, maxContextMessages: event.target.value }))} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">Max context tokens <HelpHint text="Token budget allocated for conversation history/context. Keep this aligned with your model limits and response size expectations." /></span>
            <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" min={3000} max={8000} step={100} type="number" value={draft.maxContextTokens} onChange={(event) => setDraft((current) => ({ ...current, maxContextTokens: event.target.value }))} />
          </label>

          <label className="grid gap-2 text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-1.5">Inactivity timeout (seconds) <HelpHint text="When no activity happens for this duration, conversation context is reset automatically to avoid stale context carryover." /></span>
            <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" min={60} max={604800} type="number" value={draft.inactivityTimeoutSeconds} onChange={(event) => setDraft((current) => ({ ...current, inactivityTimeoutSeconds: event.target.value }))} />
          </label>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnLogoutEvent} onChange={(event) => setDraft((current) => ({ ...current, resetOnLogoutEvent: event.target.checked }))} type="checkbox" />
            Reset on logout/session expiry event
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnUserChange} onChange={(event) => setDraft((current) => ({ ...current, resetOnUserChange: event.target.checked }))} type="checkbox" />
            Reset on user or tenant change
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm text-slate-700">
            <input checked={draft.resetOnTargetAppChange} onChange={(event) => setDraft((current) => ({ ...current, resetOnTargetAppChange: event.target.checked }))} type="checkbox" />
            Reset on target app/business context change
          </label>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white" type="submit">
            <Save className="h-4 w-4" />
            Save settings
          </button>
          <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-200 px-5 text-sm font-semibold text-slate-700" onClick={resetScope} type="button">
            <RefreshCw className="h-4 w-4" />
            Reset scope to defaults
          </button>
          {status.message ? <span className={`text-sm ${status.type === "error" ? "text-red-600" : "text-slate-600"}`}>{status.message}</span> : null}
        </div>
            </form>
          ) : null}

          {activeTab === "keys" ? (
            <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">Chatbot API Keys</h2>
            <p className="mt-1 text-sm text-slate-600">Create environment-specific keys, suspend/revoke keys, rotate secrets, and optionally restrict key usage by domain origin.</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            Lifecycle enabled
          </div>
        </div>

        <form className="grid gap-4 rounded-lg border border-slate-200 p-4" onSubmit={createApiKey}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Key name
              <input
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm"
                onChange={(event) => setApiKeyForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Portal widget production"
                required
                type="text"
                value={apiKeyForm.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Environment
              <select
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                onChange={(event) => setApiKeyForm((current) => ({ ...current, environment: event.target.value }))}
                value={apiKeyForm.environment}
              >
                <option value="test">Test</option>
                <option value="certification">Certification</option>
                <option value="production">Production</option>
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Allowed origins (optional)
              <textarea
                className="min-h-[90px] rounded-lg border border-slate-200 px-3 py-2 text-sm"
                onChange={(event) => setApiKeyForm((current) => ({ ...current, allowedOrigins: event.target.value }))}
                placeholder="https://app.example.com\n*.example.org"
                value={apiKeyForm.allowedOrigins}
              />
            </label>

            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Expiry (optional)
              <input
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm"
                onChange={(event) => setApiKeyForm((current) => ({ ...current, expiresAt: event.target.value }))}
                type="datetime-local"
                value={apiKeyForm.expiresAt}
              />
            </label>

            <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white" type="submit">
              <KeyRound className="h-4 w-4" />
              Create API key
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">Strict environment enforcement</p>
              <p className="mt-1 text-xs text-slate-600">When enabled, requests must send environment and it must match API key environment exactly.</p>
              <p className="mt-1 text-xs text-slate-500">Example: key environment = production, request includes environment=production or X-Scout-Environment: production.</p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={strictEnvironmentEnforcement}
                onChange={(event) => setStrictEnvironmentEnforcement(event.target.checked)}
                type="checkbox"
              />
              Enable
            </label>
          </div>
          <div className="mt-3">
            <button className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700" onClick={saveStrictEnvironmentEnforcement} type="button">
              Save security policy
            </button>
            {policyStatus.message ? <p className={`mt-2 text-xs ${policyStatus.type === "error" ? "text-red-600" : "text-slate-600"}`}>{policyStatus.message}</p> : null}
          </div>
        </div>

        {revealedApiKey ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-medium text-emerald-800">Copy this API key now. It will not be shown again.</p>
            <textarea
              className="mt-2 min-h-[76px] w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-800"
              readOnly
              value={revealedApiKey}
            />
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[980px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Environment</th>
                <th className="px-3 py-2 text-left">Prefix</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Allowed domains</th>
                <th className="px-3 py-2 text-left">Last used</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apiKeys.map((key) => (
                <Fragment key={key.id}>
                  <tr>
                    <td className="px-3 py-3 font-medium text-slate-800">{key.name}</td>
                    <td className="px-3 py-3 text-slate-700">{key.environment}</td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">{key.keyPrefix}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${key.status === "active" ? "bg-emerald-100 text-emerald-700" : key.status === "suspended" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                        {key.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-600">{key.allowedOrigins.length ? key.allowedOrigins.join(", ") : "Any domain"}</td>
                    <td className="px-3 py-3 text-xs text-slate-600">{formatDate(key.lastUsedAt)}</td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <IconActionButton label="Rotate key and issue a new secret. Existing integrations must switch to the new key immediately." onClick={() => rotateApiKey(key.id)}>
                          <RotateCw className="h-3.5 w-3.5" />
                        </IconActionButton>
                        <IconActionButton label="Edit optional domain restrictions and expiry for this API key." onClick={() => beginEditKey(key)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </IconActionButton>
                        {key.status !== "active" ? (
                          <IconActionButton tone="success" label="Activate this key so requests can be authorized again." onClick={() => { void updateApiKey(key.id, { status: "active" }); }}>
                            <ShieldCheck className="h-3.5 w-3.5" />
                          </IconActionButton>
                        ) : null}
                        {key.status === "active" ? (
                          <IconActionButton tone="warning" label="Suspend this key temporarily without deleting it." onClick={() => { void updateApiKey(key.id, { status: "suspended" }); }}>
                            <Pause className="h-3.5 w-3.5" />
                          </IconActionButton>
                        ) : null}
                        {key.status !== "revoked" ? (
                          <IconActionButton tone="danger" label="Revoke this key permanently. It cannot be used again." onClick={() => { void updateApiKey(key.id, { status: "revoked" }); }}>
                            <Ban className="h-3.5 w-3.5" />
                          </IconActionButton>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                  {editingKeyId === key.id ? (
                    <tr>
                      <td className="bg-slate-50 px-3 py-3" colSpan={7}>
                        <div className="grid gap-3 md:grid-cols-2">
                          <label className="grid gap-1 text-xs font-medium text-slate-700 md:col-span-2">
                            Allowed origins (optional)
                            <textarea
                              className="min-h-[90px] rounded-md border border-slate-200 px-2 py-2 text-xs"
                              onChange={(event) => setEditAllowedOrigins(event.target.value)}
                              placeholder="https://app.example.com\n*.example.org"
                              value={editAllowedOrigins}
                            />
                          </label>
                          <label className="grid gap-1 text-xs font-medium text-slate-700">
                            Expiry (optional)
                            <input
                              className="h-9 rounded-md border border-slate-200 px-2 text-xs"
                              onChange={(event) => setEditExpiresAt(event.target.value)}
                              type="datetime-local"
                              value={editExpiresAt}
                            />
                          </label>
                          <div className="flex items-end gap-2">
                            <button className="inline-flex h-9 items-center rounded-md bg-slate-900 px-3 text-xs font-semibold text-white" onClick={() => saveKeyPolicy(key.id)} type="button">Save</button>
                            <button className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700" onClick={() => setEditingKeyId(null)} type="button">Cancel</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
              {apiKeys.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={7}>No API keys created yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {apiKeyStatus.message ? <p className={`mt-3 text-sm ${apiKeyStatus.type === "error" ? "text-red-600" : "text-slate-600"}`}>{apiKeyStatus.message}</p> : null}
            </div>
          ) : null}

          {activeTab === "package" ? (
            <>
              <div className="rounded-lg border border-slate-200 p-4">
                <h2 className="text-xl font-semibold text-slate-950">Chatbot Settings Package</h2>
                <p className="mt-1 text-sm text-slate-600">Generate two distributable files with encrypted identifiers for the target app.</p>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Target app
                    <select className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, targetAppId: event.target.value }))} value={embedForm.targetAppId}>
                      {targetApps.map((app) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    User ID placeholder
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, userId: event.target.value }))} value={embedForm.userId} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700 md:col-span-2">
                    API key (plaintext)
                    <textarea className="min-h-[92px] rounded-lg border border-slate-200 px-3 py-2 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="Paste newly created or rotated API key" value={embedForm.apiKey} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Scout URL
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, scoutUrl: event.target.value }))} value={embedForm.scoutUrl} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    API URL
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, apiUrl: event.target.value }))} value={embedForm.apiUrl} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Assistant name
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, assistantName: event.target.value }))} value={embedForm.assistantName} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Brand color
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, brandColor: event.target.value }))} value={embedForm.brandColor} />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Accent color
                    <input className="h-11 rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbedForm((current) => ({ ...current, accentColor: event.target.value }))} value={embedForm.accentColor} />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white" onClick={generateEmbedPackage} type="button">
                    <Download className="h-4 w-4" />
                    Generate snippets
                  </button>
                  {embedStatus.message ? <span className={`text-sm ${embedStatus.type === "error" ? "text-red-600" : "text-slate-600"}`}>{embedStatus.message}</span> : null}
                </div>

                {embedResult ? (
                  <div className="mt-6 grid gap-4">
                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">scout-chatbot-config.local.js</p>
                        <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700" onClick={() => downloadTextFile("scout-chatbot-config.local.js", embedResult.configSnippet)} type="button">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      </div>
                      <textarea className="mt-2 min-h-[220px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" readOnly value={embedResult.configSnippet} />
                    </div>

                    <div className="rounded-lg border border-slate-200 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">scout-chatbot-install.js</p>
                        <button className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-xs font-medium text-slate-700" onClick={() => downloadTextFile("scout-chatbot-install.js", embedResult.installSnippet)} type="button">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      </div>
                      <textarea className="mt-2 min-h-[220px] w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" readOnly value={embedResult.installSnippet} />
                    </div>

                    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">
                      <p>Obfuscated company ID: <span className="font-mono text-slate-800">{embedResult.obfuscatedCompanyId}</span></p>
                      <p className="mt-1">Obfuscated target app ID: <span className="font-mono text-slate-800">{embedResult.obfuscatedTargetAppId}</span></p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-slate-950">Integration Help</h2>
        <p className="mt-1 text-sm text-slate-600">Use these collapsible notes for onboarding external teams quickly.</p>

        <div className="mt-4 space-y-3">
          <details className="rounded-lg border border-slate-200 p-4" open>
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">1) Package installation flow</summary>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600">
              <li>Create or rotate an API key for the target environment.</li>
              <li>Use Chatbot settings package to generate both JS files with obfuscated IDs.</li>
              <li>Distribute the files to the client application and include them in HTML or React bootstrap.</li>
            </ol>
          </details>

          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">2) Domain-aware key policy</summary>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>Add allowed origins when creating the key to restrict usage to specific hostnames or origins.</p>
              <p>Examples: https://app.company.com, *.partner.company.com</p>
              <p>Target app level key policies can be handled by issuing separate keys per app/environment.</p>
            </div>
          </details>

          <details className="rounded-lg border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">3) Code samples</summary>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">HTML client</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{embedResult?.htmlSample || `<script src="./scout-chatbot-config.local.js"></script>\n<script src="./scout-chatbot-install.js"></script>`}</pre>
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">React client</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{embedResult?.reactSample || `import { useEffect } from "react";\n\nexport function ScoutChatbotLoader() {\n  useEffect(() => {\n    // Load config + install scripts from public path\n  }, []);\n  return null;\n}`}</pre>
              </div>
            </div>
          </details>
        </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
