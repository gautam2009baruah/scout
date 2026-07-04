-- Migration 054: Orchestration Triggers (Fixed - Force Recreate)
-- Drops and recreates trigger tables to ensure clean state

-- ============================================================================
-- FORCE DROP EVERYTHING - No conditions, just drop it all
-- ============================================================================
DROP TABLE IF EXISTS trigger_execution_logs CASCADE;
DROP TABLE IF EXISTS orchestration_triggers CASCADE;
DROP INDEX IF EXISTS orchestration_triggers_type_idx CASCADE;
DROP INDEX IF EXISTS orchestration_triggers_orchestration_idx CASCADE;
DROP INDEX IF EXISTS orchestration_triggers_status_idx CASCADE;

-- ============================================================================
-- Create orchestration_triggers table with ALL columns from the start
-- ============================================================================
CREATE TABLE orchestration_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
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
  updated_by_email text,
  CONSTRAINT orchestration_triggers_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
);

-- ============================================================================
-- Create indexes
-- ============================================================================
CREATE INDEX orchestration_triggers_orchestration_idx ON orchestration_triggers(orchestration_id);
CREATE INDEX orchestration_triggers_type_idx ON orchestration_triggers(trigger_type);
CREATE INDEX orchestration_triggers_status_idx ON orchestration_triggers(status);

-- ============================================================================
-- Create trigger execution logs table
-- ============================================================================
CREATE TABLE trigger_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  orchestration_id uuid NOT NULL,
  execution_id uuid,
  status text NOT NULL CHECK (status IN ('received', 'validated', 'started', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text,
  CONSTRAINT trigger_execution_logs_trigger_fk FOREIGN KEY (trigger_id) REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  CONSTRAINT trigger_execution_logs_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE,
  CONSTRAINT trigger_execution_logs_execution_fk FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE SET NULL
);

-- ============================================================================
-- Create indexes for trigger_execution_logs
-- ============================================================================
CREATE INDEX trigger_execution_logs_trigger_idx ON trigger_execution_logs(trigger_id);
CREATE INDEX trigger_execution_logs_orchestration_idx ON trigger_execution_logs(orchestration_id);
CREATE INDEX trigger_execution_logs_execution_idx ON trigger_execution_logs(execution_id);
CREATE INDEX trigger_execution_logs_status_idx ON trigger_execution_logs(status);
CREATE INDEX trigger_execution_logs_triggered_at_idx ON trigger_execution_logs(triggered_at);

-- ============================================================================
-- Add comments
-- ============================================================================
COMMENT ON TABLE orchestration_triggers IS 'Trigger configurations for orchestrations';
COMMENT ON TABLE trigger_execution_logs IS 'Audit logs for trigger executions';
COMMENT ON COLUMN orchestration_triggers.config IS 'Encrypted trigger configuration including sensitive data';
COMMENT ON COLUMN trigger_execution_logs.payload IS 'Trigger payload that initiated the execution';

