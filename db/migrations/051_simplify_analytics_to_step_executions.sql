-- Drop unnecessary analytics tables and simplify to step_executions only

-- Drop analytics_events table (redundant with step_executions)
DROP TABLE IF EXISTS analytics_events CASCADE;

-- Drop workflow_executions table (can be derived from step_executions)
DROP TABLE IF EXISTS workflow_executions CASCADE;

-- Modify step_executions table
-- 1. Keep workflow_execution_id as plain UUID (for grouping steps by run)
ALTER TABLE step_executions
  DROP CONSTRAINT IF EXISTS step_executions_workflow_execution_id_fkey;

-- 2. Add user_id column as text (flexible for future implementation)
ALTER TABLE step_executions
  ADD COLUMN IF NOT EXISTS user_id text;

-- 3. Drop duration_ms column (calculate dynamically from completed_at - started_at)
ALTER TABLE step_executions
  DROP COLUMN IF EXISTS duration_ms;

-- Update indexes
DROP INDEX IF EXISTS analytics_events_workflow_type_created_idx;
DROP INDEX IF EXISTS analytics_events_company_created_idx;
DROP INDEX IF EXISTS workflow_executions_company_started_idx;
DROP INDEX IF EXISTS workflow_executions_workflow_status_idx;

-- Add new indexes for efficient analytics queries
CREATE INDEX IF NOT EXISTS step_executions_company_started_idx
  ON step_executions (company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS step_executions_status_started_idx
  ON step_executions (status, started_at DESC);

CREATE INDEX IF NOT EXISTS step_executions_workflow_execution_started_idx
  ON step_executions (workflow_execution_id, started_at);
