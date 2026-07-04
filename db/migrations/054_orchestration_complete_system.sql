-- Migration 054: Complete Orchestration Trigger System
-- Consolidated migration that replaces old 054-058 split migrations
-- This creates the complete trigger system in one clean migration

-- ============================================================================
-- PART 1: Clean up any existing partial state (FORCE DROP EVERYTHING)
-- ============================================================================

-- Drop all related tables in correct order (dependencies first)
DROP TABLE IF EXISTS schedule_executions CASCADE;
DROP TABLE IF EXISTS email_trigger_messages CASCADE;
DROP TABLE IF EXISTS file_upload_triggers CASCADE;
DROP TABLE IF EXISTS chatbot_trigger_sessions CASCADE;
DROP TABLE IF EXISTS api_request_logs CASCADE;
DROP TABLE IF EXISTS api_clients CASCADE;
DROP TABLE IF EXISTS trigger_execution_logs CASCADE;
DROP TABLE IF EXISTS orchestration_triggers CASCADE;

-- Drop old trigger-related columns from orchestrations table (if it exists)
-- Use DO block to handle case where table doesn't exist yet
DO $$ 
BEGIN
  -- Drop index if it exists
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'orchestrations_trigger_type_idx') THEN
    DROP INDEX orchestrations_trigger_type_idx;
  END IF;
  
  -- Drop columns if table and columns exist
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orchestrations') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrations' AND column_name = 'trigger_type') THEN
      ALTER TABLE orchestrations DROP COLUMN trigger_type CASCADE;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestrations' AND column_name = 'trigger_config') THEN
      ALTER TABLE orchestrations DROP COLUMN trigger_config CASCADE;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Create orchestration_triggers table
-- ============================================================================

CREATE TABLE orchestration_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  trigger_type text NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'chatbot', 'schedule', 'webhook', 'api', 'email', 'file_upload')),
  name text NOT NULL,
  description text,
  config jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
  last_triggered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  updated_by_email text
);

CREATE INDEX idx_orchestration_triggers_orchestration ON orchestration_triggers(orchestration_id);
CREATE INDEX idx_orchestration_triggers_type ON orchestration_triggers(trigger_type);
CREATE INDEX idx_orchestration_triggers_status ON orchestration_triggers(status);

COMMENT ON TABLE orchestration_triggers IS 'Trigger configurations for orchestrations (moved from orchestration-level to dedicated table)';
COMMENT ON COLUMN orchestration_triggers.config IS 'Encrypted trigger configuration including sensitive data';

-- ============================================================================
-- PART 3: Create trigger execution logs
-- ============================================================================

CREATE TABLE trigger_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('received', 'validated', 'started', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text
);

CREATE INDEX idx_trigger_execution_logs_trigger ON trigger_execution_logs(trigger_id);
CREATE INDEX idx_trigger_execution_logs_orchestration ON trigger_execution_logs(orchestration_id);
CREATE INDEX idx_trigger_execution_logs_execution ON trigger_execution_logs(execution_id);
CREATE INDEX idx_trigger_execution_logs_status ON trigger_execution_logs(status);
CREATE INDEX idx_trigger_execution_logs_triggered_at ON trigger_execution_logs(triggered_at);

COMMENT ON TABLE trigger_execution_logs IS 'Audit logs for trigger executions';
COMMENT ON COLUMN trigger_execution_logs.payload IS 'Trigger payload that initiated the execution';

-- ============================================================================
-- PART 4: Create API clients table
-- ============================================================================

CREATE TABLE api_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text,
  api_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  rate_limit integer NOT NULL DEFAULT 60,
  allowed_orchestrations text[] DEFAULT '{}',
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_email varchar(255),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT api_clients_name_unique UNIQUE (name),
  CONSTRAINT api_clients_rate_limit_check CHECK (rate_limit >= 0)
);

CREATE INDEX idx_api_clients_is_active ON api_clients(is_active);
CREATE INDEX idx_api_clients_created_at ON api_clients(created_at);

COMMENT ON TABLE api_clients IS 'API clients for authenticated orchestration execution';
COMMENT ON COLUMN api_clients.api_key IS 'Encrypted API key for authentication';
COMMENT ON COLUMN api_clients.rate_limit IS 'Requests per minute, 0 = unlimited';

-- ============================================================================
-- PART 5: Create API request logs
-- ============================================================================

CREATE TABLE api_request_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES api_clients(id) ON DELETE SET NULL,
  orchestration_id uuid REFERENCES orchestrations(id) ON DELETE SET NULL,
  trigger_id uuid REFERENCES orchestration_triggers(id) ON DELETE SET NULL,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  endpoint varchar(500) NOT NULL,
  method varchar(10) NOT NULL,
  status_code integer NOT NULL,
  request_body jsonb,
  response_body jsonb,
  error_message text,
  ip_address varchar(45),
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_request_logs_client ON api_request_logs(client_id);
CREATE INDEX idx_api_request_logs_orchestration ON api_request_logs(orchestration_id);
CREATE INDEX idx_api_request_logs_status_code ON api_request_logs(status_code);
CREATE INDEX idx_api_request_logs_created_at ON api_request_logs(created_at);

-- ============================================================================
-- PART 6: Create schedule executions table
-- ============================================================================

CREATE TABLE schedule_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  actual_started_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('started', 'completed', 'failed', 'skipped')),
  timezone text NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  CONSTRAINT schedule_executions_unique UNIQUE (trigger_id, scheduled_at)
);

CREATE INDEX idx_schedule_executions_trigger ON schedule_executions(trigger_id);
CREATE INDEX idx_schedule_executions_scheduled_at ON schedule_executions(scheduled_at);
CREATE INDEX idx_schedule_executions_status ON schedule_executions(status);

COMMENT ON TABLE schedule_executions IS 'Tracks schedule trigger executions to prevent duplicates';

-- ============================================================================
-- PART 7: Create email trigger messages table
-- ============================================================================

CREATE TABLE email_trigger_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  message_id text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('gmail', 'outlook', 'imap')),
  mailbox text NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL,
  subject text NOT NULL,
  body_text text,
  body_html text,
  attachments jsonb DEFAULT '[]',
  received_at timestamptz NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('received', 'processed', 'failed')),
  error_message text,
  
  CONSTRAINT email_trigger_messages_unique UNIQUE (trigger_id, message_id)
);

CREATE INDEX idx_email_trigger_messages_trigger ON email_trigger_messages(trigger_id);
CREATE INDEX idx_email_trigger_messages_received_at ON email_trigger_messages(received_at);
CREATE INDEX idx_email_trigger_messages_status ON email_trigger_messages(status);

-- ============================================================================
-- PART 8: Create file upload triggers table
-- ============================================================================

CREATE TABLE file_upload_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint NOT NULL,
  mime_type text,
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  status text NOT NULL CHECK (status IN ('uploaded', 'processing', 'processed', 'failed')),
  error_message text
);

CREATE INDEX idx_file_upload_triggers_trigger ON file_upload_triggers(trigger_id);
CREATE INDEX idx_file_upload_triggers_uploaded_at ON file_upload_triggers(uploaded_at);
CREATE INDEX idx_file_upload_triggers_status ON file_upload_triggers(status);

-- ============================================================================
-- PART 9: Create chatbot trigger sessions table
-- ============================================================================

CREATE TABLE chatbot_trigger_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id uuid REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  session_id text NOT NULL,
  user_message text NOT NULL,
  user_id text,
  channel text NOT NULL,
  context jsonb DEFAULT '{}',
  triggered_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL CHECK (status IN ('triggered', 'completed', 'failed')),
  error_message text
);

CREATE INDEX idx_chatbot_trigger_sessions_trigger ON chatbot_trigger_sessions(trigger_id);
CREATE INDEX idx_chatbot_trigger_sessions_session ON chatbot_trigger_sessions(session_id);
CREATE INDEX idx_chatbot_trigger_sessions_triggered_at ON chatbot_trigger_sessions(triggered_at);

-- ============================================================================
-- PART 10: Add display_description to orchestration_nodes
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orchestration_nodes') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orchestration_nodes' AND column_name = 'display_description') THEN
      ALTER TABLE orchestration_nodes ADD COLUMN display_description text;
      COMMENT ON COLUMN orchestration_nodes.display_description IS 'Optional user-friendly description shown in the visual designer';
    END IF;
  END IF;
END $$;

-- ============================================================================
-- Final comment update for orchestrations
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'orchestrations') THEN
    COMMENT ON TABLE orchestrations IS 'Visual workflow orchestration definitions. Trigger configuration is now handled via orchestration_triggers table.';
  END IF;
END $$;
