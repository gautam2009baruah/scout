"use client";

import { FormEvent, useMemo, useState } from "react";
import { Bot, KeyRound, Pencil, Plus, Star, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";

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
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null);

  const defaultEmbeddingProvider = embeddingProviders[0];
  const defaultLlmProvider = llmProviders[0];

  const [embeddingDraft, setEmbeddingDraft] = useState<EmbeddingDraft>(buildEmbeddingDraft(defaultEmbeddingProvider));
  const [llmDraft, setLlmDraft] = useState<LLMDraft>(buildLlmDraft(defaultLlmProvider));

  const embeddingProviderMap = useMemo(() => new Map(embeddingProviders.map((item) => [item.key, item])), [embeddingProviders]);
  const llmProviderMap = useMemo(() => new Map(llmProviders.map((item) => [item.key, item])), [llmProviders]);

  async function refreshConfig() {
    const response = await fetch("/admin/ai/config", { method: "GET" });
    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to refresh AI configuration."), status: "error" });
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
  }

  function resetEmbeddingDraft() {
    setEmbeddingDraft(buildEmbeddingDraft(defaultEmbeddingProvider));
  }

  function resetLlmDraft() {
    setLlmDraft(buildLlmDraft(defaultLlmProvider));
  }

  async function saveEmbedding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!embeddingDraft.provider || !embeddingDraft.model.trim()) {
      setFeedback({ message: "Provider and model are required.", status: "error" });
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
        is_primary: embeddingDraft.is_primary
      })
    });

    if (!response.ok) {
      setFeedback({ message: await readMessage(response, "Unable to save embedding configuration."), status: "error" });
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    resetEmbeddingDraft();
    setFeedback({ message: embeddingDraft.id ? "Embedding configuration updated." : "Embedding configuration created.", status: "success" });
  }

  async function saveLlm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!llmDraft.provider || !llmDraft.model.trim()) {
      setFeedback({ message: "Provider and model are required.", status: "error" });
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
      setFeedback({ message: await readMessage(response, "Unable to save LLM configuration."), status: "error" });
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    resetLlmDraft();
    setFeedback({ message: llmDraft.id ? "LLM configuration updated." : "LLM configuration created.", status: "success" });
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
      setFeedback({ message: await readMessage(response, "Unable to update configuration state."), status: "error" });
      return;
    }

    const body = await response.json();
    setAdminConfig(body);
    setFeedback({ message: "Configuration updated.", status: "success" });
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
          setFeedback({ message: await readMessage(response, "Unable to delete configuration."), status: "error" });
          return;
        }

        const body = await response.json();
        setAdminConfig(body);
        setFeedback({ message: "Configuration deleted.", status: "success" });
      }
    });
  }

  return (
    <section className="grid gap-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">AI Configuration</h2>
            <p className="text-sm text-slate-500">Company scope: {companyName}</p>
          </div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={refreshConfig}
            type="button"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${activeTab === "llm" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            onClick={() => setActiveTab("llm")}
            type="button"
          >
            LLM
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-semibold ${activeTab === "embedding" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600"}`}
            onClick={() => setActiveTab("embedding")}
            type="button"
          >
            Embeddings
          </button>
        </div>

        {feedback.message ? (
          <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${feedback.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {feedback.message}
          </div>
        ) : null}
      </div>

      {activeTab === "embedding" ? (
        <>
          <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={saveEmbedding}>
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

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
        </>
      ) : null}

      {activeTab === "llm" ? (
        <>
          <form className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" onSubmit={saveLlm}>
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

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">API Key</span>
                  <input className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm" onChange={(event) => setLlmDraft((prev) => ({ ...prev, api_key: event.target.value }))} placeholder="API key" value={llmDraft.api_key} />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
                    <input checked={llmDraft.is_active} onChange={(event) => setLlmDraft((prev) => ({ ...prev, is_active: event.target.checked }))} type="checkbox" />
                    Mark as active
                  </label>
                  <label className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700">
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

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
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
        </>
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
    </section>
  );
}
