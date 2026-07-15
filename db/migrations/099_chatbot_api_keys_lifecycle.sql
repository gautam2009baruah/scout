-- Add lifecycle and policy columns to chatbot_api_keys for environment-aware browser keys

ALTER TABLE chatbot_api_keys
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS allowed_origins_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rotated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotated_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revoked_by UUID REFERENCES users(id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chatbot_api_keys_status_check'
  ) THEN
    ALTER TABLE chatbot_api_keys
      ADD CONSTRAINT chatbot_api_keys_status_check
      CHECK (status IN ('active', 'suspended', 'revoked'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_company_env
  ON chatbot_api_keys(company_id, environment);

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_status
  ON chatbot_api_keys(status);
