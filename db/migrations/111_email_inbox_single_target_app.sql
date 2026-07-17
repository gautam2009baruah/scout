-- Convert inbox email credentials to single target-app scope.

ALTER TABLE email_credentials
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_credentials_target_app
  ON email_credentials(target_app_id);

DROP INDEX IF EXISTS idx_email_credentials_unique_active;
DROP INDEX IF EXISTS idx_email_credentials_unique_per_company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_credentials_unique_per_app
  ON email_credentials(company_id, target_app_id, email_address, provider, COALESCE(imap_host, ''))
  WHERE is_active = true;

DROP TABLE IF EXISTS email_credential_target_apps;
commit;
