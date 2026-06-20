import crypto from "node:crypto";

export interface EmbeddingProvider {
  model: string;
  dimensions: number;
  embed_text(text: string): Promise<number[]>;
  embed_batch(texts: string[]): Promise<number[][]>;
}

function configuredDimensions() {
  return Number(process.env.EMBEDDING_DIMENSIONS || 1536);
}

function normalizeVector(vector: number[]) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => Number((value / length).toFixed(8)));
}

class LocalMockEmbeddingProvider implements EmbeddingProvider {
  model = process.env.EMBEDDING_MODEL || "local_mock";
  dimensions = configuredDimensions();

  async embed_text(text: string) {
    const vector = new Array(this.dimensions).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

    for (const token of tokens) {
      const hash = crypto.createHash("sha256").update(token).digest();
      const index = hash.readUInt32BE(0) % this.dimensions;
      const sign = hash[4] % 2 === 0 ? 1 : -1;
      vector[index] += sign;
    }

    return normalizeVector(vector);
  }

  async embed_batch(texts: string[]) {
    return Promise.all(texts.map((text) => this.embed_text(text)));
  }
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  dimensions = configuredDimensions();
  private apiKey = process.env.OPENAI_API_KEY || "";

  constructor() {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.");
    }
  }

  async embed_text(text: string) {
    const [embedding] = await this.embed_batch([text]);
    return embedding;
  }

  async embed_batch(texts: string[]) {
    const body: Record<string, unknown> = {
      model: this.model,
      input: texts
    };

    if (process.env.EMBEDDING_DIMENSIONS) {
      body.dimensions = this.dimensions;
    }

    const response = await fetch("https://api.openai.com/v1/embeddings", {
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
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const provider = process.env.EMBEDDING_PROVIDER || "local_mock";

  if (provider === "local_mock") {
    return new LocalMockEmbeddingProvider();
  }

  if (provider === "openai") {
    return new OpenAIEmbeddingProvider();
  }

  throw new Error(`Unsupported embedding provider: ${provider}`);
}
