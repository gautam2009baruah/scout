CREATE TABLE IF NOT EXISTS ai_embedding_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('local_bge', 'openai', 'gemini', 'custom')),
  model text NOT NULL DEFAULT '',
  dimension integer CHECK (dimension IS NULL OR dimension > 0),
  endpoint text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

CREATE TABLE IF NOT EXISTS ai_llm_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('ollama', 'openai', 'gemini', 'anthropic', 'custom', 'mock')),
  model text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_embedding_provider_configs_one_active
  ON ai_embedding_provider_configs (is_active)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS ai_llm_provider_configs_one_active
  ON ai_llm_provider_configs (is_active)
  WHERE is_active;

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
SELECT
  embedding_provider,
  embedding_model,
  embedding_dimension,
  COALESCE(embedding_endpoint, ''),
  COALESCE(embedding_api_key, ''),
  true,
  created_by,
  updated_by
FROM ai_provider_config
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM ai_embedding_provider_configs
    WHERE is_active = true
  )
ON CONFLICT (provider) DO UPDATE
SET model = EXCLUDED.model,
    dimension = EXCLUDED.dimension,
    endpoint = EXCLUDED.endpoint,
    api_key = EXCLUDED.api_key,
    is_active = EXCLUDED.is_active,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

INSERT INTO ai_llm_provider_configs (
  provider,
  model,
  endpoint,
  api_key,
  is_active,
  created_by,
  updated_by
)
SELECT
  llm_provider,
  llm_model,
  COALESCE(llm_endpoint, ''),
  COALESCE(llm_api_key, ''),
  true,
  created_by,
  updated_by
FROM ai_provider_config
WHERE id = 1
  AND NOT EXISTS (
    SELECT 1
    FROM ai_llm_provider_configs
    WHERE is_active = true
  )
ON CONFLICT (provider) DO UPDATE
SET model = EXCLUDED.model,
    endpoint = EXCLUDED.endpoint,
    api_key = EXCLUDED.api_key,
    is_active = EXCLUDED.is_active,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();
