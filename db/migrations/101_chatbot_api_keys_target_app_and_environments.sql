-- Chatbot API key enhancements: target app scoping + managed environments

ALTER TABLE chatbot_api_keys
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_company_environment_active
  ON chatbot_api_keys(company_id, environment)
  WHERE status = 'active' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_target_app
  ON chatbot_api_keys(target_app_id);

CREATE TABLE IF NOT EXISTS chatbot_api_key_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_api_key_environments_company
  ON chatbot_api_key_environments(company_id, name);

INSERT INTO chatbot_api_key_environments (company_id, name, normalized_name)
SELECT DISTINCT
  company_id,
  environment,
  lower(trim(environment))
FROM chatbot_api_keys
WHERE trim(COALESCE(environment, '')) <> ''
ON CONFLICT (company_id, normalized_name) DO NOTHING;
