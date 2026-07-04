-- Migration 054: Orchestration Triggers (Fixed - Idempotent)
-- Adds trigger configuration and execution logging tables

-- ============================================================================
-- Step 1: Drop and recreate indexes that may reference missing columns
-- ============================================================================
DROP INDEX IF EXISTS orchestration_triggers_type_idx;
DROP INDEX IF EXISTS orchestration_triggers_orchestration_idx;
DROP INDEX IF EXISTS orchestration_triggers_status_idx;

-- ============================================================================
-- Step 2: Create base table without trigger_type if it doesn't exist
-- ============================================================================
CREATE TABLE IF NOT EXISTS orchestration_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
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

-- ============================================================================
-- Step 3: Add trigger_type column if it doesn't exist
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'orchestration_triggers' 
    AND column_name = 'trigger_type'
  ) THEN
    ALTER TABLE orchestration_triggers 
    ADD COLUMN trigger_type text NOT NULL DEFAULT 'manual';
    
    -- Add constraint after column is added
    ALTER TABLE orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_trigger_type_check 
    CHECK (trigger_type IN ('manual', 'chatbot', 'schedule', 'webhook', 'api', 'email', 'file_upload'));
    
    RAISE NOTICE 'Added trigger_type column';
  ELSE
    RAISE NOTICE 'Column trigger_type already exists';
  END IF;
END $$;

-- ============================================================================
-- Step 3: Add foreign key constraint if it doesn't exist
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'orchestration_triggers_orchestration_fk'
    AND table_name = 'orchestration_triggers'
  ) THEN
    ALTER TABLE orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_orchestration_fk 
    FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE;
    
    RAISE NOTICE 'Added foreign key constraint';
  ELSE
    RAISE NOTICE 'Foreign key constraint already exists';
  END IF;
END $$;

-- ============================================================================
-- Step 4: Create indexes (idempotent with IF NOT EXISTS)
-- ============================================================================
CREATE INDEX IF NOT EXISTS orchestration_triggers_orchestration_idx ON orchestration_triggers(orchestration_id);
CREATE INDEX IF NOT EXISTS orchestration_triggers_type_idx ON orchestration_triggers(trigger_type);
CREATE INDEX IF NOT EXISTS orchestration_triggers_status_idx ON orchestration_triggers(status);

-- ============================================================================
-- Step 5: Create trigger execution logs table
-- ============================================================================
CREATE TABLE IF NOT EXISTS trigger_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  orchestration_id uuid NOT NULL,
  execution_id uuid,
  status text NOT NULL CHECK (status IN ('received', 'validated', 'started', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text
);

-- ============================================================================
-- Step 6: Add foreign keys for trigger_execution_logs
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'trigger_execution_logs_trigger_fk'
    AND table_name = 'trigger_execution_logs'
  ) THEN
    ALTER TABLE trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_trigger_fk 
    FOREIGN KEY (trigger_id) REFERENCES orchestration_triggers(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'trigger_execution_logs_orchestration_fk'
    AND table_name = 'trigger_execution_logs'
  ) THEN
    ALTER TABLE trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_orchestration_fk 
    FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'trigger_execution_logs_execution_fk'
    AND table_name = 'trigger_execution_logs'
  ) THEN
    ALTER TABLE trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_execution_fk 
    FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================================
-- Step 7: Create indexes for trigger_execution_logs
-- ============================================================================
CREATE INDEX IF NOT EXISTS trigger_execution_logs_trigger_idx ON trigger_execution_logs(trigger_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_orchestration_idx ON trigger_execution_logs(orchestration_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_execution_idx ON trigger_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_status_idx ON trigger_execution_logs(status);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_triggered_at_idx ON trigger_execution_logs(triggered_at);

-- ============================================================================
-- Step 8: Add comments
-- ============================================================================
COMMENT ON TABLE orchestration_triggers IS 'Trigger configurations for orchestrations';
COMMENT ON TABLE trigger_execution_logs IS 'Audit logs for trigger executions';
COMMENT ON COLUMN orchestration_triggers.config IS 'Encrypted trigger configuration including sensitive data';
COMMENT ON COLUMN trigger_execution_logs.payload IS 'Trigger payload that initiated the execution';

-- Trigger execution logs table
CREATE TABLE IF NOT EXISTS trigger_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL,
  orchestration_id uuid NOT NULL,
  execution_id uuid, -- NULL if orchestration failed to start
  status text NOT NULL CHECK (status IN ('received', 'validated', 'started', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  triggered_by text,
  CONSTRAINT trigger_execution_logs_trigger_fk FOREIGN KEY (trigger_id) REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  CONSTRAINT trigger_execution_logs_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE,
  CONSTRAINT trigger_execution_logs_execution_fk FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS trigger_execution_logs_trigger_idx ON trigger_execution_logs(trigger_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_orchestration_idx ON trigger_execution_logs(orchestration_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_execution_idx ON trigger_execution_logs(execution_id);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_status_idx ON trigger_execution_logs(status);
CREATE INDEX IF NOT EXISTS trigger_execution_logs_triggered_at_idx ON trigger_execution_logs(triggered_at);

-- Comments
COMMENT ON TABLE orchestration_triggers IS 'Trigger configurations for orchestrations';
COMMENT ON TABLE trigger_execution_logs IS 'Audit logs for trigger executions';
COMMENT ON COLUMN orchestration_triggers.config IS 'Encrypted trigger configuration including sensitive data';
COMMENT ON COLUMN trigger_execution_logs.payload IS 'Trigger payload that initiated the execution';
