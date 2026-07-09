-- Migration 065: Remove redundant imap_username column
-- We now use email_address as the IMAP username directly

-- Drop the imap_username column (it's always the same as email_address)
ALTER TABLE email_credentials
DROP COLUMN IF EXISTS imap_username;

-- Recreate the unique index without imap_username
DROP INDEX IF EXISTS idx_email_credentials_unique_per_company;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_credentials_unique_per_company
  ON email_credentials(company_id, email_address, provider, COALESCE(imap_host, ''))
  WHERE is_active = true;
