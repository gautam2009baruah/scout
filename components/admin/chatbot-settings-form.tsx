"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import {
  Ban,
  CircleHelp,
  Check,
  Copy,
  Download,
  KeyRound,
  Pause,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
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
  canUseCompanyLevelApiKeys: boolean;
  targetApps: TargetAppOption[];
};

type ChatbotApiKeyStatus = "active" | "suspended" | "revoked";

type ChatbotApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  targetAppId: string | null;
  targetAppName: string | null;
  environment: string;
  strictEnvironmentEnforcement: boolean;
  status: ChatbotApiKeyStatus;
  isActive: boolean;
  allowedOrigins: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatbotEnvironment = {
  id: string;
  name: string;
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
type TabId = "conversation" | "keys" | "package";

type Draft = {
  scope: ScopeValue;
  maxContextMessages: string;
  maxContextTokens: string;
  inactivityTimeoutSeconds: string;
  resetOnLogoutEvent: boolean;
  resetOnUserChange: boolean;
  resetOnTargetAppChange: boolean;
};

type Toast = {
  message: string;
  type: "success" | "error";
};

type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
} | null;

const COMPANY_SCOPE = "__company__";
const MIN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const EMBED_PACKAGE_STORAGE_KEY = "chatbot-settings-package-v1";

function toDraft(scope: ScopeValue, settings: ChatbotLifecycleSettings): Draft {
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

function formatDate(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function toLocalDateTimeInput(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function minExpiryInputValue() {
  return toLocalDateTimeInput(new Date(Date.now() + MIN_EXPIRY_MS));
}

function HelpHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex items-center align-middle group">
      <CircleHelp className="h-3.5 w-3.5 text-slate-400" />
      <span className="pointer-events-none absolute left-0 top-6 z-50 hidden w-72 rounded-md border border-slate-200 bg-slate-900 px-3 py-2 text-xs leading-5 text-slate-100 shadow-lg whitespace-normal break-words group-hover:block">
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
  children: ReactNode;
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
    <button
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md border bg-white ${toneClass} disabled:opacity-50`}
      onClick={onClick}
      type="button"
      disabled={disabled}
      title={label}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function ChatbotSettingsForm({ companyName, defaults, initialSettings, canUseCompanyLevelApiKeys, targetApps }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("conversation");

  const [settings, setSettings] = useState(initialSettings);
  const [scope, setScope] = useState<ScopeValue>("global");
  const [status, setStatus] = useState<{ type: "idle" | "saving" | "success" | "error"; message: string }>({ type: "idle", message: "" });

  const [apiKeys, setApiKeys] = useState<ChatbotApiKeyRecord[]>([]);
  const [environments, setEnvironments] = useState<ChatbotEnvironment[]>([]);

  const [editingKeyId, setEditingKeyId] = useState<string | null>(null);
  const defaultTargetAppId = canUseCompanyLevelApiKeys ? COMPANY_SCOPE : (targetApps[0]?.id ?? "");
  const [apiKeyForm, setApiKeyForm] = useState({
    targetAppId: defaultTargetAppId,
    name: "",
    environment: "",
    strictEnvironmentEnforcement: false,
    allowedOriginsText: "",
    expiresAt: ""
  });

  const [rotatedApiKey, setRotatedApiKey] = useState<string | null>(null);
  const [rotatedApiKeyCopied, setRotatedApiKeyCopied] = useState(false);

  const [environmentModalOpen, setEnvironmentModalOpen] = useState(false);
  const [newEnvironmentName, setNewEnvironmentName] = useState("");
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [editingEnvironmentName, setEditingEnvironmentName] = useState("");

  const [toast, setToast] = useState<Toast | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(EMBED_PACKAGE_STORAGE_KEY);
    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as {
        embedForm?: Partial<typeof embedForm>;
        embedResult?: EmbedPackageResponse;
      };

      if (parsed.embedForm && typeof parsed.embedForm === "object") {
        setEmbedForm((current) => ({
          ...current,
          ...parsed.embedForm
        }));
      }

      if (parsed.embedResult && typeof parsed.embedResult === "object") {
        setEmbedResult(parsed.embedResult);
        setEmbedStatus({ type: "success", message: "Previously generated package loaded." });
      }
    } catch {
      window.localStorage.removeItem(EMBED_PACKAGE_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!embedResult) {
      return;
    }

    window.localStorage.setItem(
      EMBED_PACKAGE_STORAGE_KEY,
      JSON.stringify({
        embedForm,
        embedResult
      })
    );
  }, [embedForm, embedResult]);

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
  const expiryMin = useMemo(() => minExpiryInputValue(), []);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  function parseAllowedOrigins(input: string) {
    return Array.from(new Set(input.split(",").map((value) => value.trim()).filter(Boolean)));
  }

  function validateExpiryInputOrToast(value: string) {
    if (!value) {
      return true;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      showToast("Expiry date is invalid.", "error");
      return false;
    }

    if (parsed.getTime() < Date.now() + MIN_EXPIRY_MS) {
      showToast("Expiry must be at least 7 days from now.", "error");
      return false;
    }

    return true;
  }

  async function loadApiKeys() {
    const response = await fetch("/api/admin/chatbot-settings/api-keys", { method: "GET" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to load API keys.");
    }

    setApiKeys(Array.isArray(body?.keys) ? body.keys : []);
  }

  async function loadEnvironments() {
    const response = await fetch("/api/admin/chatbot-settings/environments", { method: "GET" });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to load environments.");
    }

    setEnvironments(Array.isArray(body?.environments) ? body.environments : []);
  }

  useEffect(() => {
    Promise.all([loadApiKeys(), loadEnvironments()]).catch((error) => {
      showToast(error instanceof Error ? error.message : "Unable to load chatbot key settings.", "error");
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

  async function saveConversationSettings(event: FormEvent<HTMLFormElement>) {
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
      const message = typeof body?.message === "string" ? body.message : "Unable to save settings.";
      setStatus({ type: "error", message });
      showToast(message, "error");
      return;
    }

    setSettings(Array.isArray(body?.settings) ? body.settings : []);
    setStatus({ type: "success", message: "Chatbot settings saved." });
    showToast("Chatbot settings saved.", "success");
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
      const message = typeof body?.message === "string" ? body.message : "Unable to reset settings.";
      setStatus({ type: "error", message });
      showToast(message, "error");
      return;
    }

    setSettings(Array.isArray(body?.settings) ? body.settings : []);
    setDraft(toDraft(scope, defaults));
    setStatus({ type: "success", message: "Scope reset to defaults." });
    showToast("Scope reset to defaults.", "success");
  }

  function resetApiKeyForm() {
    setEditingKeyId(null);
    setApiKeyForm({
      targetAppId: defaultTargetAppId,
      name: "",
      environment: "",
      strictEnvironmentEnforcement: false,
      allowedOriginsText: "",
      expiresAt: ""
    });
  }

  function startEditKey(key: ChatbotApiKeyRecord) {
    setEditingKeyId(key.id);
    setApiKeyForm({
      targetAppId: key.targetAppId ?? COMPANY_SCOPE,
      name: key.name,
      environment: key.environment,
      strictEnvironmentEnforcement: key.strictEnvironmentEnforcement,
      allowedOriginsText: key.allowedOrigins.join(", "),
      expiresAt: key.expiresAt ? toLocalDateTimeInput(new Date(key.expiresAt)) : ""
    });
    setActiveTab("keys");
  }

  async function submitApiKeyForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isCreateMode = editingKeyId === null;

    if (!apiKeyForm.name.trim()) {
      showToast("Key name is required.", "error");
      return;
    }

    if (!apiKeyForm.environment.trim()) {
      showToast("Environment is required. Create an environment first.", "error");
      return;
    }

    if (isCreateMode && parseAllowedOrigins(apiKeyForm.allowedOriginsText).length === 0) {
      showToast("At least one allowed origin is required.", "error");
      return;
    }

    if (!validateExpiryInputOrToast(apiKeyForm.expiresAt)) {
      return;
    }

    const payload = {
      name: apiKeyForm.name.trim(),
      targetAppId: apiKeyForm.targetAppId === COMPANY_SCOPE ? null : apiKeyForm.targetAppId,
      environment: apiKeyForm.environment,
      strictEnvironmentEnforcement: apiKeyForm.strictEnvironmentEnforcement,
      allowedOrigins: isCreateMode ? parseAllowedOrigins(apiKeyForm.allowedOriginsText) : undefined,
      expiresAt: apiKeyForm.expiresAt ? new Date(apiKeyForm.expiresAt).toISOString() : null
    };

    const response = await fetch(
      editingKeyId ? `/api/admin/chatbot-settings/api-keys/${editingKeyId}` : "/api/admin/chatbot-settings/api-keys",
      {
        method: editingKeyId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to save API key.", "error");
      return;
    }

    if (!editingKeyId && typeof body?.apiKey === "string") {
      setRotatedApiKey(body.apiKey);
      setRotatedApiKeyCopied(false);
    }

    await loadApiKeys();
    resetApiKeyForm();
    if (!editingKeyId && body?.autoSuspended === true) {
      showToast("API key created in suspended mode because an active key already exists in this environment.", "success");
      return;
    }

    showToast(editingKeyId ? "API key updated." : "API key created.", "success");
  }

  async function updateApiKeyStatus(id: string, statusValue: ChatbotApiKeyStatus) {
    const response = await fetch(`/api/admin/chatbot-settings/api-keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: statusValue })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to update API key.", "error");
      return;
    }

    await loadApiKeys();
    showToast(`API key ${statusValue}.`, "success");
  }

  function requestStatusChange(id: string, statusValue: ChatbotApiKeyStatus) {
    setConfirmDialog({
      title: statusValue === "active" ? "Activate API Key" : statusValue === "suspended" ? "Suspend API Key" : "Revoke API Key",
      message:
        statusValue === "active"
          ? "This key will become active for its environment. Continue?"
          : statusValue === "suspended"
          ? "This key will be temporarily disabled. Continue?"
          : "This key will be permanently revoked. Continue?",
      confirmLabel: statusValue === "active" ? "Activate" : statusValue === "suspended" ? "Suspend" : "Revoke",
      onConfirm: async () => {
        setConfirmDialog(null);
        await updateApiKeyStatus(id, statusValue);
      }
    });
  }

  function requestRotateKey(id: string) {
    setConfirmDialog({
      title: "Rotate API Key",
      message: "A new secret will be generated and must be updated in clients immediately. Continue?",
      confirmLabel: "Rotate",
      onConfirm: async () => {
        setConfirmDialog(null);
        const response = await fetch(`/api/admin/chatbot-settings/api-keys/${id}/rotate`, { method: "POST" });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          showToast(typeof body?.message === "string" ? body.message : "Unable to rotate API key.", "error");
          return;
        }

        await loadApiKeys();
        if (typeof body?.apiKey === "string") {
          setRotatedApiKey(body.apiKey);
          setRotatedApiKeyCopied(false);
        }
        showToast("API key rotated.", "success");
      }
    });
  }

  async function addEnvironment() {
    const name = newEnvironmentName.trim();
    if (!name) {
      showToast("Environment name is required.", "error");
      return;
    }

    const response = await fetch("/api/admin/chatbot-settings/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to create environment.", "error");
      return;
    }

    setEnvironments(Array.isArray(body?.environments) ? body.environments : []);
    setNewEnvironmentName("");
    showToast("Environment created.", "success");
  }

  async function updateEnvironment(id: string) {
    const name = editingEnvironmentName.trim();
    if (!name) {
      showToast("Environment name is required.", "error");
      return;
    }

    const response = await fetch(`/api/admin/chatbot-settings/environments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to update environment.", "error");
      return;
    }

    setEnvironments(Array.isArray(body?.environments) ? body.environments : []);
    setEditingEnvironmentId(null);
    setEditingEnvironmentName("");
    await loadApiKeys();
    showToast("Environment updated.", "success");
  }

  function requestDeleteEnvironment(id: string, name: string) {
    setConfirmDialog({
      title: "Delete Environment",
      message: `Delete environment "${name}"? This is allowed only when no API key uses it.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        setConfirmDialog(null);
        const response = await fetch(`/api/admin/chatbot-settings/environments/${id}`, { method: "DELETE" });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          showToast(typeof body?.message === "string" ? body.message : "Unable to delete environment.", "error");
          return;
        }

        setEnvironments(Array.isArray(body?.environments) ? body.environments : []);
        if (apiKeyForm.environment === name) {
          setApiKeyForm((current) => ({ ...current, environment: "" }));
        }
        showToast("Environment deleted.", "success");
      }
    });
  }

  function copyRotatedApiKey() {
    if (!rotatedApiKey) return;
    navigator.clipboard.writeText(rotatedApiKey).then(
      () => setRotatedApiKeyCopied(true),
      () => showToast("Unable to copy API key. Please copy manually.", "error")
    );
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
      showToast(typeof body?.message === "string" ? body.message : "Unable to generate snippets.", "error");
      return;
    }

    setEmbedResult(body as EmbedPackageResponse);
    setEmbedStatus({ type: "success", message: "Embed package ready. Download both files and include them in your client app." });
    showToast("Embed package generated.", "success");
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
            <form className="space-y-6" onSubmit={saveConversationSettings}>
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
            <div className="space-y-4 overflow-x-hidden">
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

              <form className="grid gap-4 rounded-lg border border-slate-200 p-4" onSubmit={submitApiKeyForm}>
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Target app
                    <select
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                      value={apiKeyForm.targetAppId}
                      onChange={(event) => setApiKeyForm((current) => ({ ...current, targetAppId: event.target.value }))}
                      disabled={editingKeyId !== null}
                    >
                      {canUseCompanyLevelApiKeys ? <option value={COMPANY_SCOPE}>Company level</option> : null}
                      {targetApps.map((app) => (
                        <option key={app.id} value={app.id}>{app.name}</option>
                      ))}
                    </select>
                  </label>

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
                    <span className="inline-flex items-center gap-1.5">Environment <HelpHint text="Create and manage your own environment names. No default values are injected." /></span>
                    <select
                      className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                      onChange={(event) => setApiKeyForm((current) => ({ ...current, environment: event.target.value }))}
                      value={apiKeyForm.environment}
                      disabled={editingKeyId !== null}
                    >
                      <option value="">Select environment</option>
                      {environments.map((env) => (
                        <option key={env.id} value={env.name}>{env.name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <div className="relative group">
                      <button
                        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => setEnvironmentModalOpen(true)}
                        type="button"
                        disabled={editingKeyId !== null}
                        title="Create, edit, or delete environment values for this dropdown."
                        aria-label="Manage environments"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    <span className="inline-flex items-center gap-1.5">Allowed origins <HelpHint text="Accepts comma separated URLs/domains. Example: https://app.example.com, *.example.org" /></span>
                    <input
                      className="h-11 rounded-lg border border-slate-200 px-3 text-sm disabled:bg-slate-100 disabled:text-slate-500"
                      onChange={(event) => setApiKeyForm((current) => ({ ...current, allowedOriginsText: event.target.value }))}
                      placeholder="https://app.example.com, *.example.org"
                      type="text"
                      value={apiKeyForm.allowedOriginsText}
                      disabled={editingKeyId !== null}
                      required={editingKeyId === null}
                    />
                  </label>

                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    Expiry (min 7 days)
                    <input
                      className="h-11 rounded-lg border border-slate-200 px-3 text-sm"
                      onChange={(event) => setApiKeyForm((current) => ({ ...current, expiresAt: event.target.value }))}
                      type="datetime-local"
                      min={expiryMin}
                      value={apiKeyForm.expiresAt}
                    />
                  </label>

                  <div className="flex items-end gap-2">
                    <button className="inline-flex h-11 items-center gap-2 rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white" type="submit">
                      <KeyRound className="h-4 w-4" />
                      {editingKeyId ? "Update API key" : "Create API key"}
                    </button>
                    {editingKeyId ? (
                      <button className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={resetApiKeyForm} type="button">Cancel</button>
                    ) : null}
                  </div>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={apiKeyForm.strictEnvironmentEnforcement}
                    onChange={(event) => setApiKeyForm((current) => ({ ...current, strictEnvironmentEnforcement: event.target.checked }))}
                    type="checkbox"
                    disabled={editingKeyId !== null}
                  />
                  Strict environment enforcement for this key
                </label>

                <details className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <summary className="cursor-pointer font-semibold text-slate-800">How strict environment enforcement works</summary>
                  <div className="mt-2 space-y-1">
                    <p>When enabled, this key can only be used if request environment exactly matches the key environment.</p>
                    <p>If environment header/body is missing for this key, the request is rejected.</p>
                    <p>Sample: key environment = production, request must include environment=production (or X-Scout-Environment: production).</p>
                  </div>
                </details>
              </form>

              <div className="w-full max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain">
                <table className="min-w-[1080px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Target app</th>
                      <th className="px-3 py-2 text-left">Environment</th>
                      <th className="px-3 py-2 text-left">Strict env</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Allowed domains</th>
                      <th className="px-3 py-2 text-left">Last used</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {apiKeys.map((key) => (
                      <tr key={key.id}>
                        <td className="px-3 py-3 font-medium text-slate-800">{key.name}</td>
                        <td className="px-3 py-3 text-slate-700">{key.targetAppName || "Company level"}</td>
                        <td className="px-3 py-3 text-slate-700">{key.environment}</td>
                        <td className="px-3 py-3 text-xs text-slate-700">{key.strictEnvironmentEnforcement ? "Enabled" : "Disabled"}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${key.status === "active" ? "bg-emerald-100 text-emerald-700" : key.status === "suspended" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                            {key.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">{key.allowedOrigins.length ? key.allowedOrigins.join(", ") : "Any domain"}</td>
                        <td className="px-3 py-3 text-xs text-slate-600">{formatDate(key.lastUsedAt)}</td>
                        <td className="px-3 py-3">
                          {key.status === "revoked" ? (
                            <span className="text-xs text-slate-500">No actions</span>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <IconActionButton label="Rotate key and issue a new secret. Existing integrations must switch to the new key immediately." onClick={() => requestRotateKey(key.id)}>
                                <RotateCw className="h-3.5 w-3.5" />
                              </IconActionButton>
                              <IconActionButton label="Edit this key using the same key form above." onClick={() => startEditKey(key)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </IconActionButton>
                              {key.status === "suspended" ? (
                                <IconActionButton tone="success" label="Activate this key so requests can be authorized again." onClick={() => requestStatusChange(key.id, "active")}>
                                  <ShieldCheck className="h-3.5 w-3.5" />
                                </IconActionButton>
                              ) : null}
                              {key.status === "active" ? (
                                <IconActionButton tone="warning" label="Suspend this key temporarily without deleting it." onClick={() => requestStatusChange(key.id, "suspended")}>
                                  <Pause className="h-3.5 w-3.5" />
                                </IconActionButton>
                              ) : null}
                              <IconActionButton tone="danger" label="Revoke this key permanently. It cannot be used again." onClick={() => requestStatusChange(key.id, "revoked")}>
                                <Ban className="h-3.5 w-3.5" />
                              </IconActionButton>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {apiKeys.length === 0 ? (
                      <tr>
                        <td className="px-3 py-8 text-center text-sm text-slate-500" colSpan={8}>No API keys created yet.</td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
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
                    {embedResult ? "Regenerate snippets" : "Generate snippets"}
                  </button>
                  {embedResult ? (
                    <button className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-700" onClick={generateEmbedPackage} type="button">
                      <RefreshCw className="h-4 w-4" />
                      Refresh
                    </button>
                  ) : null}
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

      {environmentModalOpen ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Manage Environments</h3>
              <button className="rounded-md border border-slate-200 p-2 text-slate-700" onClick={() => setEnvironmentModalOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
                placeholder="New environment name"
                value={newEnvironmentName}
                onChange={(event) => setNewEnvironmentName(event.target.value)}
              />
              <button className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" onClick={addEnvironment} type="button">Add environment</button>
            </div>

            <div className="mt-4 max-h-64 overflow-auto rounded-lg border border-slate-200">
              {environments.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">No environments created yet.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {environments.map((env) => (
                    <div className="flex items-center gap-2 p-3" key={env.id}>
                      {editingEnvironmentId === env.id ? (
                        <input
                          className="h-9 flex-1 rounded-md border border-slate-200 px-2 text-sm"
                          value={editingEnvironmentName}
                          onChange={(event) => setEditingEnvironmentName(event.target.value)}
                        />
                      ) : (
                        <p className="flex-1 text-sm text-slate-800">{env.name}</p>
                      )}

                      {editingEnvironmentId === env.id ? (
                        <>
                          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => void updateEnvironment(env.id)} type="button">Save</button>
                          <button className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => { setEditingEnvironmentId(null); setEditingEnvironmentName(""); }} type="button">Cancel</button>
                        </>
                      ) : (
                        <>
                          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-700" onClick={() => { setEditingEnvironmentId(env.id); setEditingEnvironmentName(env.name); }} type="button">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 text-red-700" onClick={() => requestDeleteEnvironment(env.id, env.name)} type="button">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {rotatedApiKey ? (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">API Key Ready</h3>
            <p className="mt-2 text-sm text-slate-600">Copy this key now. It will not be shown again.</p>
            <textarea className="mt-3 min-h-[92px] w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-800" readOnly value={rotatedApiKey} />
            <div className="mt-4 flex justify-end gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700" onClick={copyRotatedApiKey} type="button">
                {rotatedApiKeyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {rotatedApiKeyCopied ? "Copied" : "Copy"}
              </button>
              <button className="inline-flex h-10 items-center rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white" onClick={() => { setRotatedApiKey(null); setRotatedApiKeyCopied(false); }} type="button">Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
          <div className={`pointer-events-auto flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg ${toast.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            <span className="text-sm font-semibold">{toast.type === "success" ? "Success" : "Error"}</span>
            <span className="text-sm">{toast.message}</span>
            <button onClick={() => setToast(null)} className="rounded p-0.5 hover:bg-black/5" type="button"><X className="h-4 w-4" /></button>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-xl">
            <h4 className="text-base font-semibold text-slate-900">{confirmDialog.title}</h4>
            <p className="mt-2 mb-6 text-sm text-slate-700">{confirmDialog.message}</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmDialog(null)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100" type="button">Cancel</button>
              <button onClick={() => { void confirmDialog.onConfirm(); }} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800" type="button">{confirmDialog.confirmLabel || "Confirm"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
