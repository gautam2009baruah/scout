-- Migration 056: Advanced Trigger Support
-- Created: 2026-07-03
-- Purpose: Add support for Schedule, Email, File Upload, and Chatbot triggers

-- ============================================================================
-- Schedule Executions Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS schedule_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMPTZ NOT NULL, -- When it was supposed to run
  actual_started_at TIMESTAMPTZ NOT NULL, -- When it actually ran
  status TEXT NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  timezone TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate executions for the same scheduled time
  CONSTRAINT schedule_executions_unique UNIQUE (trigger_id, scheduled_at)
);

CREATE INDEX IF NOT EXISTS idx_schedule_executions_trigger_id ON schedule_executions(trigger_id);
CREATE INDEX IF NOT EXISTS idx_schedule_executions_scheduled_at ON schedule_executions(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_schedule_executions_status ON schedule_executions(status);

COMMENT ON TABLE schedule_executions IS 'Tracks schedule trigger executions to prevent duplicates';
COMMENT ON COLUMN schedule_executions.scheduled_at IS 'The scheduled fire time from cron/schedule';
COMMENT ON COLUMN schedule_executions.actual_started_at IS 'When the orchestration actually started';

-- ============================================================================
-- Email Processing Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_trigger_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL, -- Email message ID from provider
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  mailbox TEXT NOT NULL,
  from_address TEXT NOT NULL,
  to_address TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_text TEXT,
  body_html TEXT,
  attachments JSONB DEFAULT '[]', -- Array of attachment metadata
  received_at TIMESTAMPTZ NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL CHECK (status IN ('matched', 'started', 'failed')),
  error_message TEXT,
  
  -- Prevent duplicate processing of same message
  CONSTRAINT email_trigger_messages_unique UNIQUE (trigger_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_email_trigger_messages_trigger_id ON email_trigger_messages(trigger_id);
CREATE INDEX IF NOT EXISTS idx_email_trigger_messages_message_id ON email_trigger_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_email_trigger_messages_processed_at ON email_trigger_messages(processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_trigger_messages_status ON email_trigger_messages(status);

COMMENT ON TABLE email_trigger_messages IS 'Tracks processed emails to prevent duplicate execution';
COMMENT ON COLUMN email_trigger_messages.message_id IS 'Unique message ID from email provider';
COMMENT ON COLUMN email_trigger_messages.attachments IS 'Array of attachment metadata (fileName, contentType, size, storagePath)';

-- ============================================================================
-- File Upload Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS file_upload_trigger_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size BIGINT NOT NULL, -- Size in bytes
  storage_path TEXT NOT NULL, -- Path in storage system
  uploaded_by TEXT, -- User email or ID
  metadata JSONB DEFAULT '{}', -- User-provided metadata fields
  virus_scan_status TEXT CHECK (virus_scan_status IN ('pending', 'clean', 'infected', 'error', 'skipped')),
  virus_scan_result JSONB,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('uploaded', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  CONSTRAINT file_upload_trigger_files_size_check CHECK (file_size > 0)
);

CREATE INDEX IF NOT EXISTS idx_file_upload_trigger_files_trigger_id ON file_upload_trigger_files(trigger_id);
CREATE INDEX IF NOT EXISTS idx_file_upload_trigger_files_execution_id ON file_upload_trigger_files(execution_id);
CREATE INDEX IF NOT EXISTS idx_file_upload_trigger_files_uploaded_at ON file_upload_trigger_files(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_upload_trigger_files_status ON file_upload_trigger_files(status);
CREATE INDEX IF NOT EXISTS idx_file_upload_trigger_files_uploaded_by ON file_upload_trigger_files(uploaded_by);

COMMENT ON TABLE file_upload_trigger_files IS 'Tracks uploaded files for file upload triggers';
COMMENT ON COLUMN file_upload_trigger_files.storage_path IS 'Path to file in storage system (S3, local, etc.)';
COMMENT ON COLUMN file_upload_trigger_files.metadata IS 'User-provided metadata collected during upload';

-- ============================================================================
-- Chatbot Intent Matching Logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS chatbot_trigger_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  matched_intent TEXT NOT NULL,
  confidence NUMERIC(5,4) NOT NULL,
  extracted_variables JSONB DEFAULT '{}',
  confirmation_required BOOLEAN NOT NULL DEFAULT false,
  confirmation_given BOOLEAN,
  user_id TEXT, -- User who triggered it
  user_email TEXT,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('matched', 'awaiting_confirmation', 'confirmed', 'rejected', 'executed', 'failed')),
  error_message TEXT,
  
  CONSTRAINT chatbot_trigger_matches_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_matches_trigger_id ON chatbot_trigger_matches(trigger_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_matches_user_id ON chatbot_trigger_matches(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_matches_matched_at ON chatbot_trigger_matches(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_chatbot_trigger_matches_status ON chatbot_trigger_matches(status);

COMMENT ON TABLE chatbot_trigger_matches IS 'Tracks chatbot intent matches and confirmations';
COMMENT ON COLUMN chatbot_trigger_matches.confidence IS 'AI confidence score (0-1) for intent match';
COMMENT ON COLUMN chatbot_trigger_matches.extracted_variables IS 'Variables extracted from user message';

-- ============================================================================
-- Email Credentials Vault
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  provider TEXT NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  email_address TEXT NOT NULL,
  
  -- OAuth tokens (for Gmail/Outlook)
  oauth_access_token TEXT, -- Encrypted
  oauth_refresh_token TEXT, -- Encrypted
  oauth_token_expires_at TIMESTAMPTZ,
  
  -- IMAP credentials
  imap_host TEXT,
  imap_port INTEGER,
  imap_username TEXT,
  imap_password TEXT, -- Encrypted
  imap_tls BOOLEAN DEFAULT true,
  
  -- Metadata
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email TEXT,
  
  CONSTRAINT email_credentials_oauth_or_imap CHECK (
    (provider IN ('gmail', 'outlook') AND oauth_access_token IS NOT NULL) OR
    (provider = 'imap' AND imap_host IS NOT NULL AND imap_password IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_email_credentials_provider ON email_credentials(provider);
CREATE INDEX IF NOT EXISTS idx_email_credentials_is_active ON email_credentials(is_active);
CREATE INDEX IF NOT EXISTS idx_email_credentials_email_address ON email_credentials(email_address);

COMMENT ON TABLE email_credentials IS 'Secure storage for email provider credentials (OAuth tokens and IMAP passwords)';
COMMENT ON COLUMN email_credentials.oauth_access_token IS 'Encrypted OAuth access token';
COMMENT ON COLUMN email_credentials.imap_password IS 'Encrypted IMAP password';
