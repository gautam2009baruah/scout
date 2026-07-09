"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bot, KeyRound, RefreshCw, Save } from "lucide-react";

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
  reembedding?: {
    documentCount: number;
    jobCount: number;
  } | null;
};

type EmbeddingProviderConfig = {
  provider: string;
  embedding_provider?: string;
  model: string;
  dimension: number | null;
  endpoint: string;
  api_key: string;
  is_active: boolean;
};

type LLMProviderConfig = {
  provider: string;
  llm_provider?: string;
  model: string;
  endpoint: string;
  api_key: string;
  is_active: boolean;
};

type EmbeddingFormState = {
  provider: string;
  model: string;
  dimension: string;
  endpoint: string;
  apiKey: string;
};

type LLMFormState = {
  provider: string;
  model: string;
  endpoint: string;
  apiKey: string;
};

type ProviderOption = {
  key: string;
  name: string;
  default_model: string;
  default_dimension?: number;
  requires_api_key: boolean;
};

type AIConfigurationFormProps = {
  config: AIConfig;
  embeddingProviders: ProviderOption[];
  llmProviders: ProviderOption[];
};

export function AIConfigurationForm({ config, embeddingProviders, llmProviders }: AIConfigurationFormProps) {
  const [adminConfig, setAdminConfig] = useState(config);
  const [state, setState] = useState<{ message: string; status: "idle" | "submitting" | "success" | "error" }>({ message: "", status: "idle" });
  const [embeddingForm, setEmbeddingForm] = useState<EmbeddingFormState>(() => embeddingStateFromConfig(adminConfig.active.embedding_provider, adminConfig));
  const [llmForm, setLLMForm] = useState<LLMFormState>(() => llmStateFromConfig(adminConfig.active.llm_provider, adminConfig));
  const [reembedDocuments, setReembedDocuments] = useState(false);
  const embeddingConfigByProvider = useMemo(() => providerMap(adminConfig.embedding_configs), [adminConfig.embedding_configs]);
  const llmConfigByProvider = useMemo(() => providerMap(adminConfig.llm_configs), [adminConfig.llm_configs]);
  const embeddingChanged = useMemo(() => {
    return embeddingForm.provider !== adminConfig.active.embedding_provider
      || embeddingForm.model.trim() !== adminConfig.active.embedding_model
      || Number(embeddingForm.dimension || 0) !== Number(adminConfig.active.embedding_dimension);
  }, [adminConfig.active.embedding_dimension, adminConfig.active.embedding_model, adminConfig.active.embedding_provider, embeddingForm.dimension, embeddingForm.model, embeddingForm.provider]);

  useEffect(() => {
    setReembedDocuments(embeddingChanged);
  }, [embeddingChanged]);

  async function saveConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ message: "", status: "submitting" });

    const response = await fetch("/admin/ai/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embedding_provider: embeddingForm.provider,
        embedding_model: embeddingForm.model,
        embedding_dimension: Number(embeddingForm.dimension || 0),
        embedding_endpoint: embeddingForm.endpoint,
        embedding_api_key: embeddingForm.apiKey,
        llm_provider: llmForm.provider,
        llm_model: llmForm.model,
        llm_endpoint: llmForm.endpoint,
        llm_api_key: llmForm.apiKey,
        reembed_documents: reembedDocuments
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setState({ message: typeof body?.message === "string" ? body.message : "Unable to save AI configuration.", status: "error" });
      return;
    }

    setAdminConfig(body);
    setEmbeddingForm(embeddingStateFromConfig(body.active.embedding_provider, body));
    setLLMForm(llmStateFromConfig(body.active.llm_provider, body));
    setReembedDocuments(false);
    const reembeddingMessage = body.reembedding
      ? ` ${body.reembedding.jobCount} re-embedding job${body.reembedding.jobCount === 1 ? "" : "s"} queued for ${body.reembedding.documentCount} document${body.reembedding.documentCount === 1 ? "" : "s"}.`
      : "";
    setState({ message: `AI configuration saved.${reembeddingMessage}`, status: "success" });
  }

  return (
    <form className="grid gap-6" onSubmit={saveConfig}>
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Bot className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">Embeddings</h2>
              <p className="text-sm text-slate-500">Used for indexing document chunks and retrieval.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Provider">
              <select
                className="input"
                name="embedding_provider"
                onChange={(event) => setEmbeddingForm(embeddingStateFromConfig(event.target.value, adminConfig))}
                value={embeddingForm.provider}
              >
                {embeddingProviders.map((provider) => <option key={provider.key} value={provider.key}>{provider.name}</option>)}
              </select>
            </Field>
            <Field label="Model">
              <input className="input" name="embedding_model" onChange={(event) => setEmbeddingForm({ ...embeddingForm, model: event.target.value })} value={embeddingForm.model} />
            </Field>
            <Field label="Dimensions">
              <input className="input" min={1} name="embedding_dimension" onChange={(event) => setEmbeddingForm({ ...embeddingForm, dimension: event.target.value })} type="number" value={embeddingForm.dimension} />
            </Field>
            <Field label="Endpoint">
              <input className="input" name="embedding_endpoint" onChange={(event) => setEmbeddingForm({ ...embeddingForm, endpoint: event.target.value })} placeholder="http://localhost:11434/api/embed" value={embeddingForm.endpoint} />
            </Field>
            <Field label="API key">
              <input className="input font-mono" name="embedding_api_key" onChange={(event) => setEmbeddingForm({ ...embeddingForm, apiKey: event.target.value })} placeholder="Optional for local providers" type="text" value={embeddingForm.apiKey} />
            </Field>
            <ProviderStatus config={embeddingConfigByProvider.get(embeddingForm.provider)} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600 text-white">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold tracking-normal text-slate-950">LLM</h2>
              <p className="text-sm text-slate-500">Used to generate final answers from retrieved context.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-4">
            <Field label="Provider">
              <select
                className="input"
                name="llm_provider"
                onChange={(event) => setLLMForm(llmStateFromConfig(event.target.value, adminConfig))}
                value={llmForm.provider}
              >
                {llmProviders.map((provider) => <option key={provider.key} value={provider.key}>{provider.name}</option>)}
              </select>
            </Field>
            <Field label="Model">
              <input className="input" name="llm_model" onChange={(event) => setLLMForm({ ...llmForm, model: event.target.value })} value={llmForm.model} />
            </Field>
            <Field label="Endpoint">
              <input className="input" name="llm_endpoint" onChange={(event) => setLLMForm({ ...llmForm, endpoint: event.target.value })} placeholder="http://localhost:11434" value={llmForm.endpoint} />
            </Field>
            <Field label="API key">
              <input className="input font-mono" name="llm_api_key" onChange={(event) => setLLMForm({ ...llmForm, apiKey: event.target.value })} placeholder="Optional for local providers" type="text" value={llmForm.apiKey} />
            </Field>
            <ProviderStatus config={llmConfigByProvider.get(llmForm.provider)} />
          </div>
        </div>
      </section>

      <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <input
          checked={reembedDocuments}
          className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-950"
          disabled={state.status === "submitting"}
          onChange={(event) => setReembedDocuments(event.target.checked)}
          type="checkbox"
        />
        <span className="grid gap-1">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <RefreshCw className="h-4 w-4" />
            Re-embed existing documents after saving
          </span>
          <span className="text-sm text-slate-500">
            Queues fresh embedding jobs for documents that already have chunks. Older vectors are deleted when each job runs.
          </span>
        </span>
      </label>

      {state.message ? (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
          {state.message}
        </p>
      ) : null}

      <div>
        <button className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60" disabled={state.status === "submitting"} type="submit">
          <Save className="h-4 w-4" />
          Save configuration
        </button>
      </div>
    </form>
  );
}

function providerKey(config: EmbeddingProviderConfig | LLMProviderConfig) {
  return config.provider;
}

function providerMap<T extends EmbeddingProviderConfig | LLMProviderConfig>(configs: T[]) {
  return new Map(configs.map((config) => [providerKey(config), config]));
}

function embeddingStateFromConfig(provider: string, config: AIConfig): EmbeddingFormState {
  const saved = providerMap(config.embedding_configs).get(provider);
  const activeDimension = config.active.embedding_provider === provider ? config.active.embedding_dimension : null;

  return {
    provider,
    model: saved?.model ?? "",
    dimension: saved?.dimension ? String(saved.dimension) : activeDimension ? String(activeDimension) : "",
    endpoint: saved?.endpoint ?? "",
    apiKey: saved?.api_key ?? ""
  };
}

function llmStateFromConfig(provider: string, config: AIConfig): LLMFormState {
  const saved = providerMap(config.llm_configs).get(provider);

  return {
    provider,
    model: saved?.model ?? "",
    endpoint: saved?.endpoint ?? "",
    apiKey: saved?.api_key ?? ""
  };
}

function ProviderStatus({ config }: { config?: { is_active: boolean } }) {
  return (
    <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${config?.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-500"}`}>
      {config ? (config.is_active ? "This provider is currently active." : "Saved provider details found. Saving will make it active.") : "No saved details for this provider yet."}
    </p>
  );
}

function Field({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-2 [&_.input]:h-11 [&_.input]:w-full [&_.input]:rounded-lg [&_.input]:border [&_.input]:border-slate-200 [&_.input]:bg-white [&_.input]:px-3 [&_.input]:text-sm [&_.input]:outline-none [&_.input:focus]:border-slate-900">
        {children}
      </div>
    </label>
  );
}
