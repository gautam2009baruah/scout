CREATE TABLE IF NOT EXISTS chatbot_embed_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id UUID NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  environment VARCHAR(32) NOT NULL,
  api_key_plaintext TEXT NOT NULL,
  api_key_prefix VARCHAR(32) NOT NULL,
  user_id_placeholder VARCHAR(255) NOT NULL,
  scout_url TEXT NOT NULL,
  api_url TEXT NOT NULL,
  assistant_name VARCHAR(255) NOT NULL,
  created_by UUID NULL REFERENCES users(id),
  updated_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_chatbot_embed_packages_company_target_app
  ON chatbot_embed_packages(company_id, target_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_embed_packages_company_environment
  ON chatbot_embed_packages(company_id, environment)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION trg_chatbot_embed_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chatbot_embed_packages_set_updated_at ON chatbot_embed_packages;
CREATE TRIGGER chatbot_embed_packages_set_updated_at
BEFORE UPDATE ON chatbot_embed_packages
FOR EACH ROW
EXECUTE FUNCTION trg_chatbot_embed_packages_updated_at();
