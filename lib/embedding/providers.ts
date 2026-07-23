import crypto from "node:crypto";
import { getAIProviderConfig, normalizeEmbeddingModel, type AIProviderConfig } from "@/lib/ai/config";

export type ModelInfo = {
  provider: string;
  model: string;
  dimensions?: number;
  endpoint?: string;
};

export interface EmbeddingProvider {
  provider: string;
  model: string;
  dimensions: number;
  embed_text(text: string): Promise<number[]>;
  embed_batch(texts: string[]): Promise<number[][]>;
  get_model_info(): ModelInfo;
}

function normalizeVector(vector: number[]) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / length).toFixed(8)));
}

function hashedEmbedding(text: string, dimensions: number) {
  const vector = new Array(dimensions).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    const hash = crypto.createHash("sha256").update(token).digest();
    const index = hash.readUInt32BE(0) % dimensions;
    const sign = hash[4] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  return normalizeVector(vector);
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

class LocalBGEProvider implements EmbeddingProvider {
  provider = "local_bge";
  model: string;
  dimensions: number;
  private endpoint: string;

  constructor(config: AIProviderConfig) {
    this.model = config.embedding_model || "nomic-embed-text";
    this.dimensions = Number(config.embedding_dimension || 768);
    this.endpoint = config.embedding_endpoint;

    if (!this.endpoint) {
      throw new Error("EMBEDDING_ENDPOINT is required when EMBEDDING_PROVIDER=local_bge.");
    }
  }

  async embed_text(text: string) {
    const [embedding] = await this.embed_batch([text]);
    return embedding;
  }

  async embed_batch(texts: string[]) {
    try {
      return await this.requestEmbeddings(this.model, texts);
    } catch {
      try {
        return await this.requestEmbeddings("nomic-embed-text", texts);
      } catch {
        return texts.map((text) => hashedEmbedding(text, this.dimensions));
      }
    }
  }

  private async requestEmbeddings(model: string, texts: string[]) {
    const timeout = timeoutSignal(15000);

    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: texts }),
        signal: timeout.signal
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Local BGE embedding request failed.");
      }

      const embeddings = payload?.embeddings ?? payload?.data?.map((item: { embedding: number[] }) => item.embedding);

      if (!Array.isArray(embeddings)) {
        throw new Error("Local BGE embedding response did not include embeddings.");
      }

      return embeddings;
    } finally {
      timeout.clear();
    }
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions, endpoint: this.endpoint };
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  provider = "openai";
  model: string;
  dimensions: number;
  private apiKey: string;
  private endpoint: string;

  constructor(config: AIProviderConfig) {
    this.model = config.embedding_model || "text-embedding-3-small";
    this.dimensions = Number(config.embedding_dimension || 1536);
    this.apiKey = config.embedding_api_key;
    this.endpoint = config.embedding_endpoint;

    if (!this.apiKey) {
      throw new Error("EMBEDDING_API_KEY or OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.");
    }

    if (!this.endpoint) {
      throw new Error("EMBEDDING_ENDPOINT is required when EMBEDDING_PROVIDER=openai.");
    }
  }

  async embed_text(text: string) {
    const [embedding] = await this.embed_batch([text]);
    return embedding;
  }

  async embed_batch(texts: string[]) {
    const body: Record<string, unknown> = { model: this.model, input: texts };

    if (this.dimensions) {
      body.dimensions = this.dimensions;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "OpenAI embedding request failed.");
    }

    return [...payload.data]
      .sort((first, second) => first.index - second.index)
      .map((item) => item.embedding as number[]);
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions, endpoint: this.endpoint };
  }
}

class GeminiEmbeddingProvider implements EmbeddingProvider {
  provider = "gemini";
  model: string;
  dimensions: number;
  private apiKey: string;
  private endpoint: string;

  constructor(config: AIProviderConfig) {
    this.model = normalizeEmbeddingModel("gemini", config.embedding_model);
    this.dimensions = Number(config.embedding_dimension || 768);
    this.apiKey = config.embedding_api_key;
    this.endpoint = config.embedding_endpoint;

    if (!this.apiKey) {
      throw new Error("EMBEDDING_API_KEY or GEMINI_API_KEY is required when EMBEDDING_PROVIDER=gemini.");
    }

    if (!this.endpoint) {
      throw new Error("EMBEDDING_ENDPOINT is required when EMBEDDING_PROVIDER=gemini.");
    }
  }

  async embed_text(text: string) {
    const [embedding] = await this.embed_batch([text]);
    return embedding;
  }

  async embed_batch(texts: string[]) {
    const modelResource = `models/${this.model}`;
    const url = this.endpoint.includes("key=") ? this.endpoint : `${this.endpoint}${this.endpoint.includes("?") ? "&" : "?"}key=${this.apiKey}`;
    const response = await fetch(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: modelResource,
            content: { parts: [{ text }] },
            ...(this.dimensions ? { outputDimensionality: this.dimensions } : {})
          }))
        })
      }
    );
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Gemini embedding request failed.");
    }

    return payload.embeddings.map((item: { values: number[] }) => item.values);
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions, endpoint: this.endpoint };
  }
}

class CustomEmbeddingProvider implements EmbeddingProvider {
  provider = "custom";
  model: string;
  dimensions: number;
  private endpoint: string;
  private apiKey: string;

  constructor(config: AIProviderConfig) {
    this.model = config.embedding_model;
    this.dimensions = Number(config.embedding_dimension);
    this.endpoint = config.embedding_endpoint;
    this.apiKey = config.embedding_api_key;

    if (!this.endpoint) {
      throw new Error("EMBEDDING_ENDPOINT is required when EMBEDDING_PROVIDER=custom.");
    }
  }

  async embed_text(text: string) {
    const [embedding] = await this.embed_batch([text]);
    return embedding;
  }

  async embed_batch(texts: string[]) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ model: this.model, input: texts })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Custom embedding request failed.");
    }

    return payload.embeddings ?? payload.data?.map((item: { embedding: number[] }) => item.embedding);
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, dimensions: this.dimensions, endpoint: this.endpoint };
  }
}

export async function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  const config = await getAIProviderConfig();

  if (config.embedding_provider === "local_bge") {
    return new LocalBGEProvider(config);
  }

  if (config.embedding_provider === "openai") {
    return new OpenAIEmbeddingProvider(config);
  }

  if (config.embedding_provider === "gemini") {
    return new GeminiEmbeddingProvider(config);
  }

  if (config.embedding_provider === "custom") {
    return new CustomEmbeddingProvider(config);
  }

  throw new Error(`Unsupported embedding provider: ${config.embedding_provider}`);
}
