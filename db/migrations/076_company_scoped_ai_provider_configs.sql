ALTER TABLE ai_embedding_provider_configs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE ai_llm_provider_configs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

UPDATE ai_embedding_provider_configs
SET company_id = fallback.id
FROM (
  SELECT id
  FROM companies
  WHERE deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
) AS fallback
WHERE ai_embedding_provider_configs.company_id IS NULL;

UPDATE ai_llm_provider_configs
SET company_id = fallback.id
FROM (
  SELECT id
  FROM companies
  WHERE deleted_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1
) AS fallback
WHERE ai_llm_provider_configs.company_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM ai_embedding_provider_configs
    WHERE company_id IS NULL
  ) THEN
    ALTER TABLE ai_embedding_provider_configs
      ALTER COLUMN company_id SET NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ai_llm_provider_configs
    WHERE company_id IS NULL
  ) THEN
    ALTER TABLE ai_llm_provider_configs
      ALTER COLUMN company_id SET NOT NULL;
  END IF;
END $$;

ALTER TABLE ai_embedding_provider_configs
  DROP CONSTRAINT IF EXISTS ai_embedding_provider_configs_provider_key;

ALTER TABLE ai_llm_provider_configs
  DROP CONSTRAINT IF EXISTS ai_llm_provider_configs_provider_key;

DROP INDEX IF EXISTS ai_embedding_provider_configs_one_active;
DROP INDEX IF EXISTS ai_llm_provider_configs_one_active;

CREATE INDEX IF NOT EXISTS ai_embedding_provider_configs_company_idx
  ON ai_embedding_provider_configs (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS ai_llm_provider_configs_company_idx
  ON ai_llm_provider_configs (company_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_embedding_provider_configs_one_primary_per_company
  ON ai_embedding_provider_configs (company_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_llm_provider_configs_one_primary_per_company
  ON ai_llm_provider_configs (company_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_embedding_provider_configs_company_provider_model_unique
  ON ai_embedding_provider_configs (company_id, provider, model)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_llm_provider_configs_company_provider_model_unique
  ON ai_llm_provider_configs (company_id, provider, model)
  WHERE deleted_at IS NULL;
