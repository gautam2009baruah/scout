-- Migration 098: Email sender credentials for outbound mail
-- Adds scoped (company / target app) sender credentials with per-scope primary selection.

CREATE TABLE IF NOT EXISTS email_sender_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id UUID REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'smtp' CHECK (provider IN ('smtp', 'gmail', 'outlook')),
  name TEXT NOT NULL,
  description TEXT,
  from_name TEXT,
  from_email TEXT NOT NULL,
  reply_to_email TEXT,
  smtp_host TEXT,
  smtp_port INTEGER DEFAULT 587,
  smtp_secure BOOLEAN DEFAULT false,
  smtp_username TEXT,
  smtp_password TEXT,
  oauth_access_token TEXT,
  oauth_refresh_token TEXT,
  oauth_token_expires_at TIMESTAMPTZ,
  oauth_scope TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_email_sender_credentials_company
  ON email_sender_credentials(company_id);

CREATE INDEX IF NOT EXISTS idx_email_sender_credentials_target_app
  ON email_sender_credentials(target_app_id);

CREATE INDEX IF NOT EXISTS idx_email_sender_credentials_active
  ON email_sender_credentials(company_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_sender_primary_per_scope
  ON email_sender_credentials(company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_primary = true AND is_active = true;

CREATE OR REPLACE FUNCTION update_email_sender_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_email_sender_credentials_updated_at ON email_sender_credentials;
CREATE TRIGGER trigger_email_sender_credentials_updated_at
  BEFORE UPDATE ON email_sender_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_email_sender_credentials_updated_at();
