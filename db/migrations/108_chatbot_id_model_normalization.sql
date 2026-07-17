-- Normalize chatbot tables to ID-based relationships.

-- 1) chatbot_api_keys: remove company_id, replace environment with environment_id.
ALTER TABLE chatbot_api_keys
  ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES chatbot_api_key_environments(id) ON DELETE RESTRICT;

-- Drop rows that cannot be represented in the new model (target app is now mandatory).
DELETE FROM chatbot_api_keys
WHERE target_app_id IS NULL;

-- Backfill environment_id using target_app -> canonical company + normalized environment name.
UPDATE chatbot_api_keys k
SET environment_id = env.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
INNER JOIN chatbot_api_key_environments env
  ON env.company_id = cta.company_id
 AND env.normalized_name = lower(trim(COALESCE(k.environment, '')))
WHERE k.target_app_id = gta.id
  AND k.environment_id IS NULL;

-- Drop rows still unmatched after backfill.
DELETE FROM chatbot_api_keys
WHERE environment_id IS NULL;

ALTER TABLE chatbot_api_keys
  ALTER COLUMN target_app_id SET NOT NULL,
  ALTER COLUMN environment_id SET NOT NULL;

DROP INDEX IF EXISTS chatbot_api_keys_company_active_idx;
DROP INDEX IF EXISTS idx_chatbot_api_keys_company_env;
DROP INDEX IF EXISTS idx_chatbot_api_keys_company_environment_active;

ALTER TABLE chatbot_api_keys
  DROP COLUMN IF EXISTS company_id,
  DROP COLUMN IF EXISTS environment;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_target_env_active
  ON chatbot_api_keys(target_app_id, environment_id)
  WHERE status = 'active' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_environment_id
  ON chatbot_api_keys(environment_id);

-- 2) chat_query_telemetry/chat_query_feedback: remove company_id.
DROP INDEX IF EXISTS chat_query_telemetry_company_created_idx;
DROP INDEX IF EXISTS chat_query_telemetry_company_target_created_idx;
DROP INDEX IF EXISTS chat_query_feedback_company_created_idx;
DROP INDEX IF EXISTS chat_query_feedback_company_target_created_idx;

ALTER TABLE chat_query_telemetry
  DROP COLUMN IF EXISTS company_id;

ALTER TABLE chat_query_feedback
  DROP COLUMN IF EXISTS company_id;

CREATE INDEX IF NOT EXISTS chat_query_telemetry_target_created_idx
  ON chat_query_telemetry (target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_feedback_target_created_idx
  ON chat_query_feedback (target_app_id, created_at DESC);

-- 3) chatbot_embed_packages: remove company_id, replace environment with environment_id.
ALTER TABLE chatbot_embed_packages
  ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES chatbot_api_key_environments(id) ON DELETE RESTRICT;

UPDATE chatbot_embed_packages p
SET environment_id = env.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
INNER JOIN chatbot_api_key_environments env
  ON env.company_id = cta.company_id
 AND env.normalized_name = lower(trim(COALESCE(p.environment, '')))
WHERE p.target_app_id = gta.id
  AND p.environment_id IS NULL;

DELETE FROM chatbot_embed_packages
WHERE environment_id IS NULL;

ALTER TABLE chatbot_embed_packages
  ALTER COLUMN environment_id SET NOT NULL;

DROP INDEX IF EXISTS idx_chatbot_embed_packages_company_target_app;
DROP INDEX IF EXISTS idx_chatbot_embed_packages_company_environment;

ALTER TABLE chatbot_embed_packages
  DROP COLUMN IF EXISTS company_id,
  DROP COLUMN IF EXISTS environment;

CREATE INDEX IF NOT EXISTS idx_chatbot_embed_packages_target_app
  ON chatbot_embed_packages(target_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_embed_packages_environment_id
  ON chatbot_embed_packages(environment_id)
  WHERE deleted_at IS NULL;

-- 4) remove company_id from intent/lifecycle tables.
DROP INDEX IF EXISTS chatbot_intent_gate_decisions_company_created_idx;
DROP INDEX IF EXISTS chatbot_intent_gate_decisions_company_target_created_idx;
DROP INDEX IF EXISTS chatbot_intent_gate_feedback_company_created_idx;
DROP INDEX IF EXISTS chatbot_lifecycle_settings_company_target_scope_unique;
DROP INDEX IF EXISTS chatbot_lifecycle_settings_company_idx;

ALTER TABLE chatbot_intent_gate_decisions
  DROP COLUMN IF EXISTS company_id;

ALTER TABLE chatbot_intent_gate_feedback
  DROP COLUMN IF EXISTS company_id;

ALTER TABLE chatbot_lifecycle_settings
  DROP COLUMN IF EXISTS company_id;

-- Keep lifecycle one row per target app scope.
DELETE FROM chatbot_lifecycle_settings
WHERE target_app_id IS NULL;

ALTER TABLE chatbot_lifecycle_settings
  ALTER COLUMN target_app_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS chatbot_lifecycle_settings_target_scope_unique
  ON chatbot_lifecycle_settings (target_app_id)
  WHERE deleted_at IS NULL;
