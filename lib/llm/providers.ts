import { getAIProviderConfig, type AIProviderConfig } from "@/lib/ai/config";
import type { ModelInfo } from "@/lib/embedding/providers";

export type LLMContextItem = {
  content: string;
  document_name?: string;
  folder_path?: string;
  page_number?: number;
  section_title?: string;
  chunk_id?: string;
};

export interface LLMProvider {
  provider: string;
  model: string;
  generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string): Promise<string>;
  generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string): AsyncGenerator<string>;
  get_model_info(): ModelInfo;
}

export const INSUFFICIENT_CONTEXT_MESSAGE = "I could not find enough information in the available documents.";

function normalizeContext(context: LLMContextItem[] | string) {
  if (typeof context === "string") {
    return context.trim();
  }

  return context
    .map((item, index) => {
      const source = [
        item.document_name ? `Document: ${item.document_name}` : "",
        item.folder_path ? `Folder: ${item.folder_path}` : "",
        item.page_number ? `Page: ${item.page_number}` : "",
        item.section_title ? `Section: ${item.section_title}` : "",
        item.chunk_id ? `Chunk: ${item.chunk_id}` : ""
      ].filter(Boolean).join(" | ");

      return [`[Context ${index + 1}]${source ? ` ${source}` : ""}`, item.content.trim()].join("\n");
    })
    .join("\n\n")
    .trim();
}

function buildGuardedSystemPrompt(systemPrompt: string) {
  return [
    systemPrompt.trim(),
    "Answer only from the provided context.",
    "If the context contains the requested value or fact, answer directly and concisely.",
    "Never answer from model memory.",
    "Never invent facts.",
    "Never fabricate citations.",
    `Only when the context does not contain enough information, say exactly: "${INSUFFICIENT_CONTEXT_MESSAGE}"`
  ].filter(Boolean).join("\n");
}

async function* streamSingleText(text: string) {
  yield text;
}

function timeoutSignal(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout)
  };
}

class MockProvider implements LLMProvider {
  provider = "mock";
  model: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model || "mock";
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    if (!normalizeContext(context)) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    return [
      "[Mock answer]",
      buildGuardedSystemPrompt(system_prompt),
      `Question: ${user_prompt.trim()}`,
      "Context was provided. Configure a real LLM provider for production answers."
    ].join("\n\n");
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    yield await this.generate_answer(system_prompt, user_prompt, context);
  }

  get_model_info() {
    return { provider: this.provider, model: this.model };
  }
}

class OllamaProvider implements LLMProvider {
  provider = "ollama";
  model: string;
  private endpoint: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model || "qwen3:0.6b";
    this.endpoint = config.llm_endpoint || "http://localhost:11434";
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    const timeout = timeoutSignal(45000);

    try {
      const response = await fetch(`${this.endpoint.replace(/\/$/, "")}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          think: false,
          options: {
            temperature: 0.1,
            num_predict: 1024
          },
          messages: [
            { role: "system", content: buildGuardedSystemPrompt(system_prompt) },
            { role: "user", content: ["Context:", normalizedContext, "", "Question:", user_prompt.trim()].join("\n") }
          ]
        }),
        signal: timeout.signal
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "Ollama request failed.");
      }

      return String(payload?.message?.content ?? payload?.response ?? "").trim() || INSUFFICIENT_CONTEXT_MESSAGE;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Ollama did not respond within 45 seconds. Confirm model "${this.model}" is pulled and running.`);
      }

      throw error;
    } finally {
      timeout.clear();
    }
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      yield INSUFFICIENT_CONTEXT_MESSAGE;
      return;
    }

    const response = await fetch(`${this.endpoint.replace(/\/$/, "")}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        think: false,
        options: {
          temperature: 0.1,
          num_predict: 1024
        },
        messages: [
          { role: "system", content: buildGuardedSystemPrompt(system_prompt) },
          { role: "user", content: ["Context:", normalizedContext, "", "Question:", user_prompt.trim()].join("\n") }
        ]
      })
    });

    if (!response.ok || !response.body) {
      yield await this.generate_answer(system_prompt, user_prompt, context);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const payload = JSON.parse(line);
        const text = payload?.message?.content;

        if (text) {
          yield text;
        }
      }
    }
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, endpoint: this.endpoint };
  }
}

class OpenAIProvider implements LLMProvider {
  provider = "openai";
  model: string;
  private apiKey: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model || "gpt-4.1-mini";
    this.apiKey = config.llm_api_key;

    if (!this.apiKey) {
      throw new Error("LLM_API_KEY or OPENAI_API_KEY is required when LLM_PROVIDER=openai.");
    }
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        messages: [
          { role: "system", content: buildGuardedSystemPrompt(system_prompt) },
          { role: "user", content: ["Context:", normalizedContext, "", "Question:", user_prompt.trim()].join("\n") }
        ]
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "OpenAI LLM request failed.");
    }

    return String(payload?.choices?.[0]?.message?.content ?? "").trim() || INSUFFICIENT_CONTEXT_MESSAGE;
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    yield* streamSingleText(await this.generate_answer(system_prompt, user_prompt, context));
  }

  get_model_info() {
    return { provider: this.provider, model: this.model };
  }
}

class GeminiProvider implements LLMProvider {
  provider = "gemini";
  model: string;
  private apiKey: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model || "gemini-2.5-flash";
    this.apiKey = config.llm_api_key;

    if (!this.apiKey) {
      throw new Error("LLM_API_KEY or GEMINI_API_KEY is required when LLM_PROVIDER=gemini.");
    }
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    const timeout = timeoutSignal(30000);

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent?key=${this.apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: buildGuardedSystemPrompt(system_prompt) }] },
            contents: [{
              role: "user",
              parts: [{ text: ["Context:", normalizedContext, "", "Question:", user_prompt.trim()].join("\n") }]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048
            }
          }),
          signal: timeout.signal
        }
      );
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Gemini LLM request failed.");
      }

      return payload?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("")
        .trim() || INSUFFICIENT_CONTEXT_MESSAGE;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`Gemini did not respond within 30 seconds. Confirm model "${this.model}" is available for your API key.`);
      }

      throw error;
    } finally {
      timeout.clear();
    }
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    yield* streamSingleText(await this.generate_answer(system_prompt, user_prompt, context));
  }

  get_model_info() {
    return { provider: this.provider, model: this.model };
  }
}

class AnthropicProvider implements LLMProvider {
  provider = "anthropic";
  model: string;
  private apiKey: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model || "claude-3-5-haiku-latest";
    this.apiKey = config.llm_api_key;

    if (!this.apiKey) {
      throw new Error("LLM_API_KEY is required when LLM_PROVIDER=anthropic.");
    }
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        temperature: 0.1,
        system: buildGuardedSystemPrompt(system_prompt),
        messages: [{ role: "user", content: ["Context:", normalizedContext, "", "Question:", user_prompt.trim()].join("\n") }]
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Anthropic LLM request failed.");
    }

    return payload?.content?.map((part: { text?: string }) => part.text ?? "").join("").trim() || INSUFFICIENT_CONTEXT_MESSAGE;
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    yield* streamSingleText(await this.generate_answer(system_prompt, user_prompt, context));
  }

  get_model_info() {
    return { provider: this.provider, model: this.model };
  }
}

class CustomLLMProvider implements LLMProvider {
  provider = "custom";
  model: string;
  private endpoint: string;
  private apiKey: string;

  constructor(config: AIProviderConfig) {
    this.model = config.llm_model;
    this.endpoint = config.llm_endpoint;
    this.apiKey = config.llm_api_key;

    if (!this.endpoint) {
      throw new Error("LLM_ENDPOINT is required when LLM_PROVIDER=custom.");
    }
  }

  async generate_answer(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    const normalizedContext = normalizeContext(context);

    if (!normalizedContext) {
      return INSUFFICIENT_CONTEXT_MESSAGE;
    }

    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        system_prompt: buildGuardedSystemPrompt(system_prompt),
        user_prompt,
        context: normalizedContext
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof payload?.error?.message === "string" ? payload.error.message : "Custom LLM request failed.");
    }

    return String(payload?.answer ?? payload?.text ?? payload?.message ?? "").trim() || INSUFFICIENT_CONTEXT_MESSAGE;
  }

  async *generate_stream(system_prompt: string, user_prompt: string, context: LLMContextItem[] | string) {
    yield* streamSingleText(await this.generate_answer(system_prompt, user_prompt, context));
  }

  get_model_info() {
    return { provider: this.provider, model: this.model, endpoint: this.endpoint };
  }
}

export async function getLLMProvider(): Promise<LLMProvider> {
  const config = await getAIProviderConfig();

  if (config.llm_provider === "ollama") return new OllamaProvider(config);
  if (config.llm_provider === "openai") return new OpenAIProvider(config);
  if (config.llm_provider === "gemini") return new GeminiProvider(config);
  if (config.llm_provider === "anthropic") return new AnthropicProvider(config);
  if (config.llm_provider === "custom") return new CustomLLMProvider(config);
  if (config.llm_provider === "mock") return new MockProvider(config);

  throw new Error(`Unsupported LLM provider: ${config.llm_provider}`);
}
