-- Migration 058: Email Credentials for Email Triggers
-- Stores IMAP/Gmail/Outlook credentials for email trigger polling

-- Create email_credentials table
CREATE TABLE IF NOT EXISTS email_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  
  -- Provider type
  provider TEXT NOT NULL CHECK (provider IN ('imap', 'gmail', 'outlook')),
  
  -- Display name
  name TEXT NOT NULL,
  
  -- Email account being monitored
  email_address TEXT NOT NULL,
  
  -- IMAP-specific settings
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_username TEXT,
  imap_password TEXT, -- Encrypted
  imap_tls BOOLEAN DEFAULT true,
  
  -- OAuth-specific settings (Gmail, Outlook)
  oauth_access_token TEXT, -- Encrypted
  oauth_refresh_token TEXT, -- Encrypted
  oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
  oauth_scope TEXT,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_tested_at TIMESTAMP WITH TIME ZONE,
  last_test_status TEXT, -- 'success', 'failed'
  last_test_error TEXT,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_email TEXT,
  updated_by_email TEXT
);

-- Indexes
CREATE INDEX idx_email_credentials_company ON email_credentials(company_id);
CREATE INDEX idx_email_credentials_provider ON email_credentials(provider);
CREATE INDEX idx_email_credentials_active ON email_credentials(is_active);

-- Unique constraint: one active credential per email address per company
CREATE UNIQUE INDEX idx_email_credentials_unique_active 
  ON email_credentials(company_id, email_address, provider) 
  WHERE is_active = true;

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_email_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_email_credentials_updated_at
  BEFORE UPDATE ON email_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_email_credentials_updated_at();
