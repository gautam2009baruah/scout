-- Orchestrations: Visual workflow orchestration system
-- Allows users to build business processes by connecting reusable nodes

-- Main orchestration definitions
CREATE TABLE orchestrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft', -- draft, published
  trigger_type text NOT NULL, -- manual, chatbot, schedule, webhook, api, email, file_upload
  trigger_config jsonb NOT NULL DEFAULT '{}',
  variables jsonb NOT NULL DEFAULT '{}', -- default variables/schema
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  updated_by_email text,
  published_at timestamptz,
  published_by_email text,
  CONSTRAINT orchestrations_company_fk FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX orchestrations_company_idx ON orchestrations(company_id);
CREATE INDEX orchestrations_status_idx ON orchestrations(status);
CREATE INDEX orchestrations_trigger_type_idx ON orchestrations(trigger_type);

-- Nodes within an orchestration
CREATE TABLE orchestration_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
  node_type text NOT NULL, -- workflow, ai_extraction, ai_decision, condition, human_approval, notification, variable, end
  label text NOT NULL,
  position_x integer NOT NULL,
  position_y integer NOT NULL,
  config jsonb NOT NULL DEFAULT '{}', -- node-specific configuration
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orchestration_nodes_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
);

CREATE INDEX orchestration_nodes_orchestration_idx ON orchestration_nodes(orchestration_id);
CREATE INDEX orchestration_nodes_type_idx ON orchestration_nodes(node_type);

-- Connections between nodes
CREATE TABLE orchestration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  source_handle text, -- for nodes with multiple outputs (true/false, approve/reject, etc.)
  target_handle text,
  condition jsonb, -- optional condition for this connection
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orchestration_connections_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE,
  CONSTRAINT orchestration_connections_source_fk FOREIGN KEY (source_node_id) REFERENCES orchestration_nodes(id) ON DELETE CASCADE,
  CONSTRAINT orchestration_connections_target_fk FOREIGN KEY (target_node_id) REFERENCES orchestration_nodes(id) ON DELETE CASCADE
);

CREATE INDEX orchestration_connections_orchestration_idx ON orchestration_connections(orchestration_id);
CREATE INDEX orchestration_connections_source_idx ON orchestration_connections(source_node_id);
CREATE INDEX orchestration_connections_target_idx ON orchestration_connections(target_node_id);

-- Orchestration executions
CREATE TABLE orchestration_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
  orchestration_version integer NOT NULL,
  status text NOT NULL DEFAULT 'running', -- running, paused, completed, failed, cancelled
  context jsonb NOT NULL DEFAULT '{}', -- shared execution context
  trigger_data jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_message text,
  current_node_id uuid, -- for paused/running executions
  triggered_by text, -- email or system
  CONSTRAINT orchestration_executions_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE
);

CREATE INDEX orchestration_executions_orchestration_idx ON orchestration_executions(orchestration_id);
CREATE INDEX orchestration_executions_status_idx ON orchestration_executions(status);
CREATE INDEX orchestration_executions_started_idx ON orchestration_executions(started_at);

-- Individual node executions within an orchestration execution
CREATE TABLE orchestration_node_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL,
  node_id uuid NOT NULL,
  node_type text NOT NULL,
  node_label text NOT NULL,
  status text NOT NULL, -- pending, running, completed, failed, skipped
  input jsonb,
  output jsonb,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  retry_count integer NOT NULL DEFAULT 0,
  CONSTRAINT orchestration_node_executions_execution_fk FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE
);

CREATE INDEX orchestration_node_executions_execution_idx ON orchestration_node_executions(execution_id);
CREATE INDEX orchestration_node_executions_status_idx ON orchestration_node_executions(status);
CREATE INDEX orchestration_node_executions_started_idx ON orchestration_node_executions(started_at);

-- Human approval requests
CREATE TABLE orchestration_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL,
  node_execution_id uuid NOT NULL,
  approver_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  request_data jsonb,
  response_data jsonb,
  requested_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  responded_by_email text,
  notes text,
  CONSTRAINT orchestration_approvals_execution_fk FOREIGN KEY (execution_id) REFERENCES orchestration_executions(id) ON DELETE CASCADE,
  CONSTRAINT orchestration_approvals_node_execution_fk FOREIGN KEY (node_execution_id) REFERENCES orchestration_node_executions(id) ON DELETE CASCADE
);

CREATE INDEX orchestration_approvals_execution_idx ON orchestration_approvals(execution_id);
CREATE INDEX orchestration_approvals_approver_idx ON orchestration_approvals(approver_email);
CREATE INDEX orchestration_approvals_status_idx ON orchestration_approvals(status);

-- Orchestration versions (for version history)
CREATE TABLE orchestration_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id uuid NOT NULL,
  version integer NOT NULL,
  snapshot jsonb NOT NULL, -- full orchestration snapshot including nodes and connections
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by_email text,
  change_notes text,
  CONSTRAINT orchestration_versions_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES orchestrations(id) ON DELETE CASCADE,
  CONSTRAINT orchestration_versions_unique UNIQUE (orchestration_id, version)
);

CREATE INDEX orchestration_versions_orchestration_idx ON orchestration_versions(orchestration_id);
CREATE INDEX orchestration_versions_version_idx ON orchestration_versions(orchestration_id, version);

COMMENT ON TABLE orchestrations IS 'Visual workflow orchestration definitions';
COMMENT ON TABLE orchestration_nodes IS 'Nodes within orchestrations (workflow, AI, approval, etc.)';
COMMENT ON TABLE orchestration_connections IS 'Connections between orchestration nodes';
COMMENT ON TABLE orchestration_executions IS 'Orchestration execution history and runtime state';
COMMENT ON TABLE orchestration_node_executions IS 'Individual node execution records';
COMMENT ON TABLE orchestration_approvals IS 'Human approval requests and responses';
COMMENT ON TABLE orchestration_versions IS 'Orchestration version history for rollback/compare';
