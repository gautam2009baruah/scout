-- Convert inbox email credentials to single target-app scope.

ALTER TABLE email_credentials
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE;

WITH ranked_assignments AS (
  SELECT
    email_credential_id,
    target_app_id,
    ROW_NUMBER() OVER (PARTITION BY email_credential_id ORDER BY target_app_id) AS rn
  FROM email_credential_target_apps
)
UPDATE email_credentials ec
SET target_app_id = ranked_assignments.target_app_id
FROM ranked_assignments
WHERE ec.id = ranked_assignments.email_credential_id
  AND ranked_assignments.rn = 1
  AND ec.target_app_id IS NULL;

WITH ranked_assignments AS (
  SELECT
    email_credential_id,
    target_app_id,
    ROW_NUMBER() OVER (PARTITION BY email_credential_id ORDER BY target_app_id) AS rn
  FROM email_credential_target_apps
)
INSERT INTO email_credentials (
  company_id,
  target_app_id,
  provider,
  name,
  email_address,
  imap_host,
  imap_port,
  imap_username,
  imap_password,
  imap_tls,
  oauth_access_token,
  oauth_refresh_token,
  oauth_token_expires_at,
  oauth_scope,
  is_active,
  last_tested_at,
  last_test_status,
  last_test_error,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  ec.company_id,
  ranked_assignments.target_app_id,
  ec.provider,
  ec.name,
  ec.email_address,
  ec.imap_host,
  ec.imap_port,
  ec.imap_username,
  ec.imap_password,
  ec.imap_tls,
  ec.oauth_access_token,
  ec.oauth_refresh_token,
  ec.oauth_token_expires_at,
  ec.oauth_scope,
  ec.is_active,
  ec.last_tested_at,
  ec.last_test_status,
  ec.last_test_error,
  ec.created_at,
  ec.updated_at,
  ec.created_by,
  ec.updated_by
FROM email_credentials ec
INNER JOIN ranked_assignments
  ON ranked_assignments.email_credential_id = ec.id
 AND ranked_assignments.rn > 1
WHERE NOT EXISTS (
  SELECT 1
  FROM email_credentials existing
  WHERE existing.company_id = ec.company_id
    AND existing.target_app_id = ranked_assignments.target_app_id
    AND existing.email_address = ec.email_address
    AND existing.provider = ec.provider
    AND COALESCE(existing.imap_host, '') = COALESCE(ec.imap_host, '')
);

CREATE INDEX IF NOT EXISTS idx_email_credentials_target_app
  ON email_credentials(target_app_id);

DROP INDEX IF EXISTS idx_email_credentials_unique_active;
DROP INDEX IF EXISTS idx_email_credentials_unique_per_company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_credentials_unique_per_app
  ON email_credentials(company_id, target_app_id, email_address, provider, COALESCE(imap_host, ''))
  WHERE is_active = true;

DROP TABLE IF EXISTS email_credential_target_apps;
