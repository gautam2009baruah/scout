-- Sprint 8 (Chatbot API hardening): company-scoped API keys for standalone chatbot service.

CREATE TABLE IF NOT EXISTS chatbot_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_api_keys_company_active_idx
  ON chatbot_api_keys (company_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_api_keys_expires_idx
  ON chatbot_api_keys (expires_at)
  WHERE expires_at IS NOT NULL;
