-- Migration 064: Email Credentials Target Apps
-- Allows email credentials to be assigned to multiple target apps
-- Each credential can work with one or more apps

-- Drop the old unique constraint that was too restrictive
DROP INDEX IF EXISTS idx_email_credentials_unique_active;

-- Add unique constraint to prevent duplicate credentials at company level
-- Allows same email to exist for multiple apps, but prevents true duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_credentials_unique_per_company
  ON email_credentials(company_id, email_address, provider, COALESCE(imap_host, ''))
  WHERE is_active = true;

-- Create junction table for email_credentials and target_apps (many-to-many)
CREATE TABLE IF NOT EXISTS email_credential_target_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_credential_id UUID NOT NULL REFERENCES email_credentials(id) ON DELETE CASCADE,
  target_app_id UUID NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_email TEXT,
  
  -- Prevent same credential being assigned to same app twice
  UNIQUE(email_credential_id, target_app_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_email_cred_target_apps_credential 
  ON email_credential_target_apps(email_credential_id);
CREATE INDEX IF NOT EXISTS idx_email_cred_target_apps_target 
  ON email_credential_target_apps(target_app_id);

-- Composite index for common query: get all credentials for a specific app.
-- Active filtering happens by joining email_credentials because PostgreSQL
-- does not allow subqueries in partial index predicates.
CREATE INDEX IF NOT EXISTS idx_email_cred_apps_active_lookup
  ON email_credential_target_apps(target_app_id, email_credential_id);
