"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, KeyRound, Pencil, Plus, RefreshCw, Star, ToggleLeft, ToggleRight, Trash2, X } from "lucide-react";

type AIConfig = {
  active: {
    embedding_provider: string;
    embedding_model: string;
    embedding_dimension: number;
    embedding_endpoint: string;
    embedding_api_key: string;
    llm_provider: string;
    llm_model: string;
    llm_endpoint: string;
    llm_api_key: string;
  };
  embedding_configs: EmbeddingProviderConfig[];
  llm_configs: LLMProviderConfig[];
  reembedding?: { documentCount: number; jobCount: number } | null;
};

type EmbeddingProviderConfig = {
  id: string;
  company_id: string;
  provider: string;
  model: string;
  dimension: number | null;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

type LLMProviderConfig = {
  id: string;
  company_id: string;
  provider: string;
  model: string;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

type ProviderOption = {
  key: string;
  name: string;
  default_model: string;
  default_dimension?: number;
  requires_api_key: boolean;
};

type AIConfigurationFormProps = {
  companyName: string;
  config: AIConfig;
  embeddingProviders: ProviderOption[];
  llmProviders: ProviderOption[];
};

type Feedback = {
  message: string;
  status: "idle" | "submitting" | "success" | "error";
};

type ConfirmDialog = {
  message: string;
  onConfirm: () => void;
} | null;

type EmbeddingDraft = {
  id: string | null;
  provider: string;
  model: string;
  dimension: string;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

type LLMDraft = {
  id: string | null;
  provider: string;
  model: string;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

const initialFeedback: Feedback = {
  message: "",
  status: "idle"
};

function readMessage(response: Response, fallback: string) {
  return response.json().then((body) => (typeof body?.message === "string" ? body.message : fallback)).catch(() => fallback);
}

function buildEmbeddingDraft(option: ProviderOption): EmbeddingDraft {
  return {
    id: null,
    provider: option.key,
    model: option.default_model || "",
    dimension: String(option.default_dimension || ""),
    endpoint: "",
    api_key: "",
    is_active: true,
    is_primary: false
  };
}

function buildLlmDraft(option: ProviderOption): LLMDraft {
  return {
    id: null,
    provider: option.key,
    model: option.default_model || "",
    endpoint: "",
    api_key: "",
    is_active: true,
    is_primary: false
  };
}

export function AIConfigurationForm({ companyName, config, embeddingProviders, llmProviders }: AIConfigurationFormProps) {
  const [activeTab, setActiveTab] = useState<"llm" | "embedding">("llm");
  const [adminConfig, setAdminConfig] = useState(config);
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [toastTimeout, setToastTimeout] = useState<NodeJS.Timeout | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);
  const [reembedDocuments, setReembedDocuments] = useState(false);

  const defaultEmbeddingProvider = embeddingProviders[0];
  const defaultLlmProvider = llmProviders[0];

  const [embeddingDraft, setEmbeddingDraft] = useState<EmbeddingDraft>(buildEmbeddingDraft(defaultEmbeddingProvider));
  const [llmDraft, setLlmDraft] = useState<LLMDraft>(buildLlmDraft(defaultLlmProvider));

  const embeddingProviderMap = useMemo(() => new Map(embeddingProviders.map((item) => [item.key, item])), [embeddingProviders]);
  const llmProviderMap = useMemo(() => new Map(llmProviders.map((item) => [item.key, item])), [llmProviders]);

  function showToast(message: string, type: "success" | "error" = "success") {
    setToast({ message, type });
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    const timeout = setTimeout(() => setToast(null), 3000);
    setToastTimeout(timeout);
  }

  function resetEmbeddingDraft() {
    setEmbeddingDraft(buildEmbeddingDraft(defaultEmbeddingProvider));
    setReembedDocuments(false);
  }

  function resetLlmDraft() {
    setLlmDraft(buildLlmDraft(defaultLlmProvider));
  }

  async function saveEmbedding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!embeddingDraft.provider || !embeddingDraft.model.trim()) {
      showToast("Provider and model are required.", "error");
      return;
    }

    setFeedback({ message: "", status: "submitting" });

    const method = embeddingDraft.id ? "PUT" : "POST";
    const response = await fetch("/admin/ai/config", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "embedding",
        id: embeddingDraft.id,
        provider: embeddingDraft.provider,
        model: embeddingDraft.model,
        dimension: embeddingDraft.dimension ? Number(embeddingDraft.dimension) : null,
        endpoint: embeddingDraft.endpoint,
        api_key: embeddingDraft.api_key,
        is_active: embeddingDraft.is_active,
        is_primary: embeddingDraft.is_primary,
        reembed_documents: reembedDocuments
      })
    });

    if (!response.ok) {
      setFeedback(initialFeedback);
      showToast(await readMessage(response, "Unable to save embedding configuration."), "error");
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    resetEmbeddingDraft();
    setReembedDocuments(false);
    setFeedback(initialFeedback);
    const queued = body.reembedding ? ` ${body.reembedding.jobCount} re-embedding job(s) queued for ${body.reembedding.documentCount} document(s).` : "";
    showToast(`${embeddingDraft.id ? "Embedding configuration updated." : "Embedding configuration created."}${queued}`, "success");
  }

  async function saveLlm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!llmDraft.provider || !llmDraft.model.trim()) {
      showToast("Provider and model are required.", "error");
      return;
    }

    setFeedback({ message: "", status: "submitting" });

    const method = llmDraft.id ? "PUT" : "POST";
    const response = await fetch("/admin/ai/config", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "llm",
        id: llmDraft.id,
        provider: llmDraft.provider,
        model: llmDraft.model,
        endpoint: llmDraft.endpoint,
        api_key: llmDraft.api_key,
        is_active: llmDraft.is_active,
        is_primary: llmDraft.is_primary
      })
    });

    if (!response.ok) {
      setFeedback(initialFeedback);
      showToast(await readMessage(response, "Unable to save LLM configuration."), "error");
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    resetLlmDraft();
    setFeedback(initialFeedback);
    showToast(llmDraft.id ? "LLM configuration updated." : "LLM configuration created.", "success");
  }

  function editEmbedding(configItem: EmbeddingProviderConfig) {
    setEmbeddingDraft({
      id: configItem.id,
      provider: configItem.provider,
      model: configItem.model,
      dimension: configItem.dimension ? String(configItem.dimension) : "",
      endpoint: configItem.endpoint,
      api_key: configItem.api_key,
      is_active: configItem.is_active,
      is_primary: configItem.is_primary
    });
    setActiveTab("embedding");
  }

  function editLlm(configItem: LLMProviderConfig) {
    setLlmDraft({
      id: configItem.id,
      provider: configItem.provider,
      model: configItem.model,
      endpoint: configItem.endpoint,
      api_key: configItem.api_key,
      is_active: configItem.is_active,
      is_primary: configItem.is_primary
    });
    setActiveTab("llm");
  }

  async function patchConfig(type: "embedding" | "llm", id: string, action: "toggle_active" | "set_primary", value: boolean) {
    setFeedback({ message: "", status: "submitting" });

    const response = await fetch("/admin/ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, action, value })
    });

    if (!response.ok) {
      setFeedback(initialFeedback);
      showToast(await readMessage(response, "Unable to update configuration state."), "error");
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    setFeedback(initialFeedback);
    showToast("Configuration updated.", "success");
  }

  function requestDelete(type: "embedding" | "llm", id: string, label: string) {
    setConfirmDialog({
      message: `Are you sure you want to delete "${label}"? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmDialog(null);
        setFeedback({ message: "", status: "submitting" });

        const response = await fetch("/admin/ai/config", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type, id })
        });

        if (!response.ok) {
          setFeedback(initialFeedback);
          showToast(await readMessage(response, "Unable to delete configuration."), "error");
          return;
        }

        const body = await response.json();
        setAdminConfig(body);
        setFeedback(initialFeedback);
        showToast("Configuration deleted.", "success");
      }
    });
  }

  return (
    <section className="grid gap-0">
      <div className="rounded-t-lg border border-slate-200 border-b-0 bg-white px-4 pt-3">
        <div className="mt-2 border-b border-slate-200">
          <div aria-label="AI configuration sections" className="flex items-end gap-2" role="tablist">
            <button
              aria-controls="llm-panel"
              aria-selected={activeTab === "llm"}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                activeTab === "llm"
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="llm-tab"
              onClick={() => setActiveTab("llm")}
              role="tab"
              type="button"
            >
              LLM
            </button>
            <button
              aria-controls="embedding-panel"
              aria-selected={activeTab === "embedding"}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold transition ${
                activeTab === "embedding"
                  ? "border-slate-300 bg-white text-slate-900"
                  : "border-transparent bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
              id="embedding-tab"
              onClick={() => setActiveTab("embedding")}
              role="tab"
              type="button"
            >
              Embeddings
            </button>
          </div>
        </div>
      </div>

      {activeTab === "embedding" ? (
        <div aria-labelledby="embedding-tab" className="rounded-b-lg border border-slate-200 border-t-0 bg-white shadow-sm" id="embedding-panel" role="tabpanel">
          <form className="p-5" onSubmit={saveEmbedding}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bot className="h-4 w-4" />
              Embeddings Setup
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {embeddingDraft.id ? "Edit an existing embedding configuration." : "Create a new embedding configuration for this company."}
            </p>

            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Provider</span>
                  <select
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    onChange={(event) => {
                      const option = embeddingProviderMap.get(event.target.value);
                      setEmbeddingDraft((prev) => ({
                        ...prev,
                        provider: event.target.value,
                        model: option?.default_model || prev.model,
                        dimension: option?.default_dimension ? String(option.default_dimension) : prev.dimension
                      }));
                    }}
                    value={embeddingDraft.provider}
                  >
                    {embeddingProviders.map((provider) => (
                      <option key={provider.key} value={provider.key}>{provider.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Model</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, model: event.target.value }))} placeholder="Model" value={embeddingDraft.model} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Dimensions</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" min={1} onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, dimension: event.target.value }))} placeholder="Dimensions" type="number" value={embeddingDraft.dimension} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Endpoint</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, endpoint: event.target.value }))} placeholder="Endpoint" value={embeddingDraft.endpoint} />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">API Key</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, api_key: event.target.value }))} placeholder="API key" value={embeddingDraft.api_key} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                  <input checked={embeddingDraft.is_active} onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, is_active: event.target.checked }))} type="checkbox" />
                  Mark as active
                </label>
                <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                  <input checked={embeddingDraft.is_primary} onChange={(event) => setEmbeddingDraft((prev) => ({ ...prev, is_primary: event.target.checked }))} type="checkbox" />
                  Mark as primary
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">
                <input checked={reembedDocuments} className="mt-1 h-4 w-4" disabled={!embeddingDraft.is_active || !embeddingDraft.is_primary} onChange={(event) => setReembedDocuments(event.target.checked)} type="checkbox" />
                <span>
                  <span className="inline-flex items-center gap-2 font-semibold text-slate-900"><RefreshCw className="h-4 w-4" />Re-embed existing documents after saving</span>
                  <span className="mt-1 block text-xs text-slate-600">Use this when changing the primary embedding provider, model, or dimensions. Existing chunks are retained and their vectors are regenerated.</span>
                  {!embeddingDraft.is_primary ? <span className="mt-1 block text-xs text-amber-700">Mark this configuration as primary to enable re-embedding.</span> : null}
                </span>
              </label>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={feedback.status === "submitting"} type="submit">
                <Plus className="h-4 w-4" />
                {embeddingDraft.id ? "Update embedding" : "Create embedding"}
              </button>
              {embeddingDraft.id ? (
                <button className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={resetEmbeddingDraft} type="button">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="border-t border-slate-200 px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Saved Embedding Configurations</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Provider</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Model</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Dim</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Endpoint</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Active</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Primary</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {adminConfig.embedding_configs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-500" colSpan={7}>No embedding configurations saved.</td>
                  </tr>
                ) : adminConfig.embedding_configs.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 text-slate-700">{item.provider}</td>
                    <td className="px-3 py-3 text-slate-900">{item.model}</td>
                    <td className="px-3 py-3 text-slate-700">{item.dimension || "-"}</td>
                    <td className="px-3 py-3 text-slate-700">{item.endpoint || "-"}</td>
                    <td className="px-3 py-3 text-center">
                      <button className="inline-flex items-center justify-center" onClick={() => patchConfig("embedding", item.id, "toggle_active", !item.is_active)} type="button">
                        {item.is_active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button className="inline-flex items-center justify-center" onClick={() => patchConfig("embedding", item.id, "set_primary", true)} type="button">
                        <Star className={`h-4 w-4 ${item.is_primary ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" onClick={() => editEmbedding(item)} type="button">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-700 hover:bg-red-50" onClick={() => requestDelete("embedding", item.id, `${item.provider} / ${item.model}`)} type="button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === "llm" ? (
        <div aria-labelledby="llm-tab" className="rounded-b-lg border border-slate-200 border-t-0 bg-white shadow-sm" id="llm-panel" role="tabpanel">
          <form className="p-5" onSubmit={saveLlm}>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <KeyRound className="h-4 w-4" />
              LLM Setup
            </div>
            <p className="mb-4 text-sm text-slate-500">
              {llmDraft.id ? "Edit an existing LLM configuration." : "Create a new LLM configuration for this company."}
            </p>

            <div className="grid gap-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Provider</span>
                  <select
                    className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm"
                    onChange={(event) => {
                      const option = llmProviderMap.get(event.target.value);
                      setLlmDraft((prev) => ({
                        ...prev,
                        provider: event.target.value,
                        model: option?.default_model || prev.model
                      }));
                    }}
                    value={llmDraft.provider}
                  >
                    {llmProviders.map((provider) => (
                      <option key={provider.key} value={provider.key}>{provider.name}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Model</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setLlmDraft((prev) => ({ ...prev, model: event.target.value }))} placeholder="Model" value={llmDraft.model} />
                </label>

                <label className="block md:col-span-2 xl:col-span-1">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Endpoint</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setLlmDraft((prev) => ({ ...prev, endpoint: event.target.value }))} placeholder="Endpoint" value={llmDraft.endpoint} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">API Key</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setLlmDraft((prev) => ({ ...prev, api_key: event.target.value }))} placeholder="API key" value={llmDraft.api_key} />
                </label>

                <div className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Status</span>
                  <label className="inline-flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                    <input checked={llmDraft.is_active} onChange={(event) => setLlmDraft((prev) => ({ ...prev, is_active: event.target.checked }))} type="checkbox" />
                    Mark as active
                  </label>
                </div>

                <div className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Primary</span>
                  <label className="inline-flex h-10 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                    <input checked={llmDraft.is_primary} onChange={(event) => setLlmDraft((prev) => ({ ...prev, is_primary: event.target.checked }))} type="checkbox" />
                    Mark as primary
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={feedback.status === "submitting"} type="submit">
                <Plus className="h-4 w-4" />
                {llmDraft.id ? "Update LLM" : "Create LLM"}
              </button>
              {llmDraft.id ? (
                <button className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50" onClick={resetLlmDraft} type="button">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>

          <div className="border-t border-slate-200 px-5 py-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Saved LLM Configurations</h3>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Provider</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Model</th>
                  <th className="px-3 py-2 text-left font-semibold text-slate-700">Endpoint</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Active</th>
                  <th className="px-3 py-2 text-center font-semibold text-slate-700">Primary</th>
                  <th className="px-3 py-2 text-right font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {adminConfig.llm_configs.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-slate-500" colSpan={6}>No LLM configurations saved.</td>
                  </tr>
                ) : adminConfig.llm_configs.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 text-slate-700">{item.provider}</td>
                    <td className="px-3 py-3 text-slate-900">{item.model}</td>
                    <td className="px-3 py-3 text-slate-700">{item.endpoint || "-"}</td>
                    <td className="px-3 py-3 text-center">
                      <button className="inline-flex items-center justify-center" onClick={() => patchConfig("llm", item.id, "toggle_active", !item.is_active)} type="button">
                        {item.is_active ? <ToggleRight className="h-5 w-5 text-emerald-600" /> : <ToggleLeft className="h-5 w-5 text-slate-400" />}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button className="inline-flex items-center justify-center" onClick={() => patchConfig("llm", item.id, "set_primary", true)} type="button">
                        <Star className={`h-4 w-4 ${item.is_primary ? "fill-amber-400 text-amber-500" : "text-slate-300"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1">
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-700 hover:bg-slate-50" onClick={() => editLlm(item)} type="button">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-300 text-red-700 hover:bg-red-50" onClick={() => requestDelete("llm", item.id, `${item.provider} / ${item.model}`)} type="button">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </section>
  );
}
