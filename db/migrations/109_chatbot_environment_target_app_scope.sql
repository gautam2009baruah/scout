-- Scope chatbot environments by target app instead of company.

ALTER TABLE chatbot_api_key_environments
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE;

ALTER TABLE chatbot_api_key_environments
  DROP CONSTRAINT IF EXISTS chatbot_api_key_environments_company_id_normalized_name_key;

DROP INDEX IF EXISTS idx_chatbot_api_key_environments_company;

-- Recreate environments per target app based on current API key usage.
INSERT INTO chatbot_api_key_environments (
  target_app_id,
  name,
  normalized_name,
  created_by,
  created_at,
  updated_by,
  updated_at
)
SELECT DISTINCT
  k.target_app_id,
  env.name,
  env.normalized_name,
  env.created_by,
  env.created_at,
  env.updated_by,
  env.updated_at
FROM chatbot_api_keys k
INNER JOIN chatbot_api_key_environments env ON env.id = k.environment_id
WHERE k.target_app_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chatbot_api_key_environments scoped
    WHERE scoped.target_app_id = k.target_app_id
      AND scoped.normalized_name = env.normalized_name
  );

-- Recreate environments per target app based on generated package usage.
INSERT INTO chatbot_api_key_environments (
  target_app_id,
  name,
  normalized_name,
  created_by,
  created_at,
  updated_by,
  updated_at
)
SELECT DISTINCT
  p.target_app_id,
  env.name,
  env.normalized_name,
  env.created_by,
  env.created_at,
  env.updated_by,
  env.updated_at
FROM chatbot_embed_packages p
INNER JOIN chatbot_api_key_environments env ON env.id = p.environment_id
WHERE p.target_app_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM chatbot_api_key_environments scoped
    WHERE scoped.target_app_id = p.target_app_id
      AND scoped.normalized_name = env.normalized_name
  );

-- Re-point API keys to the target-app-scoped environment rows.
UPDATE chatbot_api_keys k
SET environment_id = scoped.id
FROM chatbot_api_key_environments old_env
INNER JOIN chatbot_api_key_environments scoped
  ON scoped.target_app_id = k.target_app_id
 AND scoped.normalized_name = old_env.normalized_name
WHERE k.environment_id = old_env.id
  AND k.environment_id <> scoped.id;

-- Re-point generated packages to the target-app-scoped environment rows.
UPDATE chatbot_embed_packages p
SET environment_id = scoped.id
FROM chatbot_api_key_environments old_env
INNER JOIN chatbot_api_key_environments scoped
  ON scoped.target_app_id = p.target_app_id
 AND scoped.normalized_name = old_env.normalized_name
WHERE p.environment_id = old_env.id
  AND p.environment_id <> scoped.id;

-- Drop the old company-scoped rows once references are moved.
DELETE FROM chatbot_api_key_environments
WHERE target_app_id IS NULL;

-- Remove any accidental duplicates before enforcing the new uniqueness rule.
DELETE FROM chatbot_api_key_environments env
USING chatbot_api_key_environments dup
WHERE env.id > dup.id
  AND env.target_app_id = dup.target_app_id
  AND env.normalized_name = dup.normalized_name;

ALTER TABLE chatbot_api_key_environments
  ALTER COLUMN target_app_id SET NOT NULL,
  DROP COLUMN IF EXISTS company_id;

ALTER TABLE chatbot_api_key_environments
  ADD CONSTRAINT chatbot_api_key_environments_target_app_id_normalized_name_key
  UNIQUE (target_app_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_chatbot_api_key_environments_target_app
  ON chatbot_api_key_environments(target_app_id, name);
