CREATE TABLE IF NOT EXISTS orchestration_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES orchestration_executions(id) ON DELETE CASCADE,
  node_execution_id uuid NOT NULL REFERENCES orchestration_node_executions(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES orchestration_nodes(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  output_variable text NOT NULL,
  partial_output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  response_text text,
  response_json jsonb
);

CREATE INDEX IF NOT EXISTS orchestration_clarifications_conversation_status_expires_idx
  ON orchestration_clarifications (conversation_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS orchestration_clarifications_execution_status_idx
  ON orchestration_clarifications (execution_id, status);

CREATE INDEX IF NOT EXISTS orchestration_clarifications_company_created_idx
  ON orchestration_clarifications (company_id, created_at DESC);