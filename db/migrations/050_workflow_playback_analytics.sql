ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS analytics_logging_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  workflow_version integer,
  user_id text,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS step_executions (
  id uuid PRIMARY KEY,
  workflow_execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  step_id text NOT NULL,
  step_order integer,
  action_type text,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_execution_id uuid REFERENCES step_executions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  user_id text,
  step_id text,
  action_type text,
  event_type text NOT NULL CHECK (event_type IN (
    'workflow_start',
    'step_start',
    'step_completed',
    'step_failed',
    'workflow_completed',
    'workflow_failed',
    'workflow_abandoned',
    'healing_attempted',
    'healing_succeeded',
    'ai_provider_called'
  )),
  status text,
  duration_ms integer,
  error_message text,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workflow_executions_company_started_idx
  ON workflow_executions (company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS workflow_executions_workflow_status_idx
  ON workflow_executions (workflow_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS step_executions_workflow_step_status_idx
  ON step_executions (workflow_id, step_id, status);

CREATE INDEX IF NOT EXISTS analytics_events_workflow_type_created_idx
  ON analytics_events (workflow_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_company_created_idx
  ON analytics_events (company_id, created_at DESC);
