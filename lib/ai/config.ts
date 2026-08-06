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
  target_app_id: string | null;
  environment_id: string | null;
  target_app_name?: string | null;
  environment_name?: string | null;
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
  target_app_id: string | null;
  environment_id: string | null;
  target_app_name?: string | null;
  environment_name?: string | null;
};

export type AdminAIProviderConfig = {
  active: AIProviderConfig;
  embedding_configs: EmbeddingProviderConfigRow[];
  llm_configs: LLMProviderConfigRow[];
};

// There is no deployment-level default: LLM and embedding providers are always
// configured per company (AI Configuration, stored in the database). When a
// company has not configured a provider family it resolves to these empty
// markers, and callers fail clearly instead of silently using a shared or
// fallback provider.
export const UNSET_AI_CONFIG: AIProviderConfig = {
  embedding_provider: "" as EmbeddingProviderName,
  embedding_model: "",
  embedding_dimension: 0,
  embedding_endpoint: "",
  embedding_api_key: "",
  llm_provider: "" as LLMProviderName,
  llm_model: "",
  llm_endpoint: "",
  llm_api_key: ""
};

export function normalizeEmbeddingModel(provider: EmbeddingProviderName, model: string) {
  const cleanModel = (model || "").replace(/^models\//, "");

  if (provider === "gemini" && (!cleanModel || cleanModel === "text-embedding-004")) {
    return "gemini-embedding-001";
  }

  return cleanModel;
}

// Resolves the most specific active row for (company, target app, environment):
// exact target-app+environment match, then target-app match with no environment
// set (applies to every environment of that target app), then a company-wide row
// (target_app_id IS NULL, applies to every target app/environment).
const SCOPED_EMBEDDING_QUERY = `
  SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary, target_app_id, environment_id
  FROM ai_embedding_provider_configs
  WHERE company_id = $1
    AND deleted_at IS NULL
    AND is_active = true
    AND (target_app_id = $2::uuid OR target_app_id IS NULL)
    AND (target_app_id IS DISTINCT FROM $2::uuid OR environment_id = $3::uuid OR environment_id IS NULL)
  ORDER BY
    CASE
      WHEN target_app_id = $2::uuid AND environment_id = $3::uuid THEN 0
      WHEN target_app_id = $2::uuid AND environment_id IS NULL THEN 1
      WHEN target_app_id IS NULL THEN 2
      ELSE 3
    END,
    is_primary DESC,
    updated_at DESC
  LIMIT 1
`;

const SCOPED_LLM_QUERY = `
  SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary, target_app_id, environment_id
  FROM ai_llm_provider_configs
  WHERE company_id = $1
    AND deleted_at IS NULL
    AND is_active = true
    AND (target_app_id = $2::uuid OR target_app_id IS NULL)
    AND (target_app_id IS DISTINCT FROM $2::uuid OR environment_id = $3::uuid OR environment_id IS NULL)
  ORDER BY
    CASE
      WHEN target_app_id = $2::uuid AND environment_id = $3::uuid THEN 0
      WHEN target_app_id = $2::uuid AND environment_id IS NULL THEN 1
      WHEN target_app_id IS NULL THEN 2
      ELSE 3
    END,
    is_primary DESC,
    updated_at DESC
  LIMIT 1
`;

export async function getAIProviderConfig(companyId?: string, targetAppId?: string, environmentId?: string): Promise<AIProviderConfig> {
  // No deployment-level fallback: a company without a configured provider family
  // resolves to empty markers, and callers (getLLMProvider / getEmbeddingProvider
  // and the document worker) fail clearly with a "not set" error rather than
  // silently using a shared provider or another company's row.
  if (!companyId) {
    return { ...UNSET_AI_CONFIG };
  }

  const [companyEmbeddingResult, companyLlmResult] = await Promise.all([
    getPool().query<EmbeddingProviderConfigRow>(SCOPED_EMBEDDING_QUERY, [companyId, targetAppId || null, environmentId || null]),
    getPool().query<LLMProviderConfigRow>(SCOPED_LLM_QUERY, [companyId, targetAppId || null, environmentId || null])
  ]);

  const companyEmbedding = companyEmbeddingResult.rows[0];
  const companyLlm = companyLlmResult.rows[0];

  return {
    embedding_provider: companyEmbedding?.provider ?? UNSET_AI_CONFIG.embedding_provider,
    embedding_model: companyEmbedding ? normalizeEmbeddingModel(companyEmbedding.provider, companyEmbedding.model) : "",
    embedding_dimension: companyEmbedding ? Number(companyEmbedding.dimension || 0) : 0,
    embedding_endpoint: companyEmbedding?.endpoint ?? "",
    embedding_api_key: companyEmbedding?.api_key ?? "",
    llm_provider: companyLlm?.provider ?? UNSET_AI_CONFIG.llm_provider,
    llm_model: companyLlm?.model ?? "",
    llm_endpoint: companyLlm?.endpoint ?? "",
    llm_api_key: companyLlm?.api_key ?? ""
  };
}

// Whether a company has at least one active LLM and one active embedding
// provider configured (at any scope). Used to warn admins when nothing is set,
// since there is no deployment fallback.
export async function getCompanyAiConfigStatus(companyId: string): Promise<{ hasLlm: boolean; hasEmbedding: boolean }> {
  if (!companyId) {
    return { hasLlm: false, hasEmbedding: false };
  }
  const result = await getPool().query<{ has_llm: boolean; has_embedding: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM ai_llm_provider_configs WHERE company_id = $1 AND is_active = true AND deleted_at IS NULL) AS has_llm,
       EXISTS (SELECT 1 FROM ai_embedding_provider_configs WHERE company_id = $1 AND is_active = true AND deleted_at IS NULL) AS has_embedding`,
    [companyId]
  );
  const row = result.rows[0];
  return { hasLlm: Boolean(row?.has_llm), hasEmbedding: Boolean(row?.has_embedding) };
}

export async function getAdminAIProviderConfig(companyId?: string, targetAppId?: string, environmentId?: string): Promise<AdminAIProviderConfig> {
  const active = await getAIProviderConfig(companyId, targetAppId, environmentId);

  try {
    const [embeddingResult, llmResult] = companyId
      ? await Promise.all([
        getPool().query<EmbeddingProviderConfigRow>(
          `
            SELECT c.id, c.company_id, c.provider, c.model, c.dimension, c.endpoint, c.api_key, c.is_active, c.is_primary,
                   c.target_app_id, c.environment_id, ta.name AS target_app_name, env.name AS environment_name
            FROM ai_embedding_provider_configs c
            LEFT JOIN company_target_applications ta ON ta.id = c.target_app_id
            LEFT JOIN target_app_environments env ON env.id = c.environment_id
            WHERE c.company_id = $1
              AND c.deleted_at IS NULL
            ORDER BY c.is_primary DESC, c.provider ASC, c.model ASC, c.created_at ASC
          `,
          [companyId]
        ),
        getPool().query<LLMProviderConfigRow>(
          `
            SELECT c.id, c.company_id, c.provider, c.model, c.endpoint, c.api_key, c.is_active, c.is_primary,
                   c.target_app_id, c.environment_id, ta.name AS target_app_name, env.name AS environment_name
            FROM ai_llm_provider_configs c
            LEFT JOIN company_target_applications ta ON ta.id = c.target_app_id
            LEFT JOIN target_app_environments env ON env.id = c.environment_id
            WHERE c.company_id = $1
              AND c.deleted_at IS NULL
            ORDER BY c.is_primary DESC, c.provider ASC, c.model ASC, c.created_at ASC
          `,
          [companyId]
        )
      ])
      : await Promise.all([
        getPool().query<EmbeddingProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, dimension, endpoint, api_key, is_active, is_primary, target_app_id, environment_id
            FROM ai_embedding_provider_configs
            WHERE deleted_at IS NULL
            ORDER BY provider ASC, model ASC, created_at ASC
          `
        ),
        getPool().query<LLMProviderConfigRow>(
          `
            SELECT id, company_id, provider, model, endpoint, api_key, is_active, is_primary, target_app_id, environment_id
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
        is_primary: true,
        target_app_id: null,
        environment_id: null
      }],
      llm_configs: [{
        id: "",
        company_id: companyId || "",
        provider: active.llm_provider,
        model: active.llm_model,
        endpoint: active.llm_endpoint,
        api_key: active.llm_api_key,
        is_active: true,
        is_primary: true,
        target_app_id: null,
        environment_id: null
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
