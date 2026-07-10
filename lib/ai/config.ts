import { getPool } from "@/lib/db/pool";

export type EmbeddingProviderName = "local_bge" | "openai" | "gemini" | "custom";
export type LLMProviderName = "ollama" | "openai" | "gemini" | "anthropic" | "custom" | "mock";

export type AIProviderConfig = {
  embedding_provider: EmbeddingProviderName;
  embedding_model: string;
  embedding_dimension: number;
  embedding_endpoint: string;
  embedding_api_key: string;
  llm_provider: LLMProviderName;
  llm_model: string;
  llm_endpoint: string;
  llm_api_key: string;
};

export type EmbeddingProviderConfigRow = {
  id: string;
  company_id: string;
  provider: EmbeddingProviderName;
  model: string;
  dimension: number | null;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

export type LLMProviderConfigRow = {
  id: string;
  company_id: string;
  provider: LLMProviderName;
  model: string;
  endpoint: string;
  api_key: string;
  is_active: boolean;
  is_primary: boolean;
};

export type AdminAIProviderConfig = {
  active: AIProviderConfig;
  embedding_configs: EmbeddingProviderConfigRow[];
  llm_configs: LLMProviderConfigRow[];
};

export const DEFAULT_AI_CONFIG: AIProviderConfig = {
  embedding_provider: "local_bge",
  embedding_model: "nomic-embed-text",
  embedding_dimension: 768,
  embedding_endpoint: "http://localhost:11434/api/embed",
  embedding_api_key: "",
  llm_provider: "ollama",
  llm_model: "qwen3:0.6b",
  llm_endpoint: "http://localhost:11434",
  llm_api_key: ""
};

export function normalizeEmbeddingModel(provider: EmbeddingProviderName, model: string) {
  const cleanModel = (model || "").replace(/^models\//, "");

  if (provider === "gemini" && (!cleanModel || cleanModel === "text-embedding-004")) {
    return "gemini-embedding-001";
  }

  return cleanModel;
}

function envConfig(): AIProviderConfig {
  const embeddingProvider = (process.env.EMBEDDING_PROVIDER || DEFAULT_AI_CONFIG.embedding_provider) as EmbeddingProviderName;

  return {
    embedding_provider: embeddingProvider,
    embedding_model: normalizeEmbeddingModel(embeddingProvider, process.env.EMBEDDING_MODEL || DEFAULT_AI_CONFIG.embedding_model),
    embedding_dimension: Number(process.env.EMBEDDING_DIMENSIONS || DEFAULT_AI_CONFIG.embedding_dimension),
    embedding_endpoint: process.env.EMBEDDING_ENDPOINT || DEFAULT_AI_CONFIG.embedding_endpoint,
    embedding_api_key: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || "",
    llm_provider: (process.env.LLM_PROVIDER || DEFAULT_AI_CONFIG.llm_provider) as LLMProviderName,
    llm_model: process.env.LLM_MODEL || DEFAULT_AI_CONFIG.llm_model,
    llm_endpoint: process.env.LLM_ENDPOINT || DEFAULT_AI_CONFIG.llm_endpoint,
    llm_api_key: process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || ""
  };
}

export async function getAIProviderConfig(companyId?: string): Promise<AIProviderConfig> {
  try {
    if (companyId) {
      const [companyEmbeddingResult, companyLlmResult] = await Promise.all([
        getPool().query<EmbeddingProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary
            FROM ai_embedding_provider_configs
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY is_primary DESC, is_active DESC, updated_at DESC
            LIMIT 1
          `,
          [companyId]
        ),
        getPool().query<LLMProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary
            FROM ai_llm_provider_configs
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY is_primary DESC, is_active DESC, updated_at DESC
            LIMIT 1
          `,
          [companyId]
        )
      ]);

      const companyEmbedding = companyEmbeddingResult.rows[0];
      const companyLlm = companyLlmResult.rows[0];

      if (companyEmbedding && companyLlm) {
        const env = envConfig();
        return {
          embedding_provider: companyEmbedding.provider,
          embedding_model: normalizeEmbeddingModel(companyEmbedding.provider, companyEmbedding.model || env.embedding_model),
          embedding_dimension: Number(companyEmbedding.dimension || env.embedding_dimension),
          embedding_endpoint: companyEmbedding.endpoint || env.embedding_endpoint,
          embedding_api_key: companyEmbedding.api_key || env.embedding_api_key,
          llm_provider: companyLlm.provider,
          llm_model: companyLlm.model || env.llm_model,
          llm_endpoint: companyLlm.endpoint || env.llm_endpoint,
          llm_api_key: companyLlm.api_key || env.llm_api_key
        };
      }
    }

    const [embeddingResult, llmResult] = await Promise.all([
      getPool().query<EmbeddingProviderConfigRow>(
        `
          SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary
          FROM ai_embedding_provider_configs
          WHERE is_active = true
            AND deleted_at IS NULL
          LIMIT 1
        `
      ),
      getPool().query<LLMProviderConfigRow>(
        `
          SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary
          FROM ai_llm_provider_configs
          WHERE is_active = true
            AND deleted_at IS NULL
          LIMIT 1
        `
      )
    ]);
    const activeEmbedding = embeddingResult.rows[0];
    const activeLLM = llmResult.rows[0];

    if (activeEmbedding && activeLLM) {
      const env = envConfig();

      return {
        embedding_provider: activeEmbedding.provider,
        embedding_model: normalizeEmbeddingModel(activeEmbedding.provider, activeEmbedding.model || env.embedding_model),
        embedding_dimension: Number(activeEmbedding.dimension || env.embedding_dimension),
        embedding_endpoint: activeEmbedding.endpoint || env.embedding_endpoint,
        embedding_api_key: activeEmbedding.api_key || env.embedding_api_key,
        llm_provider: activeLLM.provider,
        llm_model: activeLLM.model || env.llm_model,
        llm_endpoint: activeLLM.endpoint || env.llm_endpoint,
        llm_api_key: activeLLM.api_key || env.llm_api_key
      };
    }

    return envConfig();
  } catch {
    return envConfig();
  }
}

export async function updateAIProviderConfig(
  input: Partial<AIProviderConfig>,
  updatedBy?: string
) {
  const pool = getPool();
  const current = await getAIProviderConfig();
  const cleanInput = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined)
  ) as Partial<AIProviderConfig>;
  const next = { ...current, ...cleanInput };
  next.embedding_model = normalizeEmbeddingModel(next.embedding_provider, next.embedding_model);

  if (!Number.isFinite(next.embedding_dimension) || next.embedding_dimension <= 0) {
    next.embedding_dimension = current.embedding_dimension || DEFAULT_AI_CONFIG.embedding_dimension;
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE ai_embedding_provider_configs SET is_active = false, updated_at = now() WHERE is_active = true"
    );
    await client.query(
      `
        INSERT INTO ai_embedding_provider_configs (
          provider,
          model,
          dimension,
          endpoint,
          api_key,
          is_active,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, $5, true, $6, $6)
        ON CONFLICT (provider) DO UPDATE
        SET model = EXCLUDED.model,
            dimension = EXCLUDED.dimension,
            endpoint = EXCLUDED.endpoint,
            api_key = EXCLUDED.api_key,
            is_active = true,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
      `,
      [
        next.embedding_provider,
        next.embedding_model || "",
        next.embedding_dimension || null,
        next.embedding_endpoint || "",
        next.embedding_api_key || "",
        updatedBy || null
      ]
    );
    await client.query(
      "UPDATE ai_llm_provider_configs SET is_active = false, updated_at = now() WHERE is_active = true"
    );
    await client.query(
      `
        INSERT INTO ai_llm_provider_configs (
          provider,
          model,
          endpoint,
          api_key,
          is_active,
          created_by,
          updated_by
        )
        VALUES ($1, $2, $3, $4, true, $5, $5)
        ON CONFLICT (provider) DO UPDATE
        SET model = EXCLUDED.model,
            endpoint = EXCLUDED.endpoint,
            api_key = EXCLUDED.api_key,
            is_active = true,
            updated_by = EXCLUDED.updated_by,
            updated_at = now()
      `,
      [
        next.llm_provider,
        next.llm_model || "",
        next.llm_endpoint || "",
        next.llm_api_key || "",
        updatedBy || null
      ]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getAIProviderConfig();
}

export async function getAdminAIProviderConfig(companyId?: string): Promise<AdminAIProviderConfig> {
  const active = await getAIProviderConfig(companyId);

  try {
    const [embeddingResult, llmResult] = companyId
      ? await Promise.all([
        getPool().query<EmbeddingProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary
            FROM ai_embedding_provider_configs
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY is_primary DESC, provider ASC, model ASC, created_at ASC
          `,
          [companyId]
        ),
        getPool().query<LLMProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary
            FROM ai_llm_provider_configs
            WHERE company_id = $1
              AND deleted_at IS NULL
            ORDER BY is_primary DESC, provider ASC, model ASC, created_at ASC
          `,
          [companyId]
        )
      ])
      : await Promise.all([
        getPool().query<EmbeddingProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary
            FROM ai_embedding_provider_configs
            WHERE deleted_at IS NULL
            ORDER BY provider ASC, model ASC, created_at ASC
          `
        ),
        getPool().query<LLMProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary
            FROM ai_llm_provider_configs
            WHERE deleted_at IS NULL
            ORDER BY provider ASC, model ASC, created_at ASC
          `
        )
      ]);

    return {
      active,
      embedding_configs: embeddingResult.rows,
      llm_configs: llmResult.rows
    };
  } catch {
    return {
      active,
      embedding_configs: [{
        id: "",
        company_id: companyId || "",
        provider: active.embedding_provider,
        model: active.embedding_model,
        dimension: active.embedding_dimension,
        endpoint: active.embedding_endpoint,
        api_key: active.embedding_api_key,
        is_active: true,
        is_primary: true
      }],
      llm_configs: [{
        id: "",
        company_id: companyId || "",
        provider: active.llm_provider,
        model: active.llm_model,
        endpoint: active.llm_endpoint,
        api_key: active.llm_api_key,
        is_active: true,
        is_primary: true
      }]
    };
  }
}

export function publicAIConfig(config: AIProviderConfig) {
  return {
    embedding_provider: config.embedding_provider,
    embedding_model: config.embedding_model,
    embedding_dimension: config.embedding_dimension,
    embedding_endpoint: config.embedding_endpoint,
    embedding_has_api_key: Boolean(config.embedding_api_key),
    llm_provider: config.llm_provider,
    llm_model: config.llm_model,
    llm_endpoint: config.llm_endpoint,
    llm_has_api_key: Boolean(config.llm_api_key)
  };
}

export function adminAIConfig(config: AIProviderConfig) {
  return {
    embedding_provider: config.embedding_provider,
    embedding_model: config.embedding_model,
    embedding_dimension: config.embedding_dimension,
    embedding_endpoint: config.embedding_endpoint,
    embedding_api_key: config.embedding_api_key,
    llm_provider: config.llm_provider,
    llm_model: config.llm_model,
    llm_endpoint: config.llm_endpoint,
    llm_api_key: config.llm_api_key
  };
}

export function adminAIProviderConfig(config: AdminAIProviderConfig) {
  return config;
}
