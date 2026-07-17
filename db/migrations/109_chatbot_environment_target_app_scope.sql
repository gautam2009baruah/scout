-- Scope chatbot environments by target app instead of company.

ALTER TABLE chatbot_api_key_environments
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE;

ALTER TABLE chatbot_api_key_environments
  DROP CONSTRAINT IF EXISTS chatbot_api_key_environments_company_id_normalized_name_key;

DROP INDEX IF EXISTS idx_chatbot_api_key_environments_company;


ALTER TABLE chatbot_api_key_environments
  ALTER COLUMN target_app_id SET NOT NULL,
  DROP COLUMN IF EXISTS company_id;

ALTER TABLE chatbot_api_key_environments
  ADD CONSTRAINT chatbot_api_key_environments_target_app_id_normalized_name_key
  UNIQUE (target_app_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_chatbot_api_key_environments_target_app
  ON chatbot_api_key_environments(target_app_id, name);
commit;