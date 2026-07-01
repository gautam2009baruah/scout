-- Healing suggestions table for workflow self-healing
CREATE TABLE IF NOT EXISTS guided_workflow_healing_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  step_order integer NOT NULL,
  
  -- Original recorded control metadata
  original_selector_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  original_element_identity jsonb,
  
  -- Proposed healed control metadata
  proposed_selector_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_element_identity jsonb,
  
  -- Healing metadata
  confidence_score numeric(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  healing_source text NOT NULL CHECK (healing_source IN ('rule-based', 'ai-assisted')),
  healing_reason text NOT NULL,
  ai_provider text,
  ai_model text,
  
  -- Page context at time of healing
  page_url text NOT NULL,
  page_title text,
  
  -- Status and actions
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Audit log
  playback_attempt_count integer NOT NULL DEFAULT 1,
  last_playback_attempt_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS healing_suggestions_workflow_status_idx
  ON guided_workflow_healing_suggestions (workflow_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS healing_suggestions_company_pending_idx
  ON guided_workflow_healing_suggestions (company_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS healing_suggestions_step_idx
  ON guided_workflow_healing_suggestions (workflow_id, step_id, status);

-- Audit log table for healing events
CREATE TABLE IF NOT EXISTS guided_workflow_healing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  step_id text NOT NULL,
  
  event_type text NOT NULL CHECK (event_type IN ('attempt', 'success', 'failure', 'approved', 'rejected', 'manual_edit')),
  healing_source text CHECK (healing_source IN ('rule-based', 'ai-assisted', 'manual')),
  confidence_score numeric(5,2),
  
  -- What was tried
  attempted_selector_candidates jsonb,
  
  -- Result
  success boolean,
  error_message text,
  
  -- Context
  page_url text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS healing_audit_workflow_created_idx
  ON guided_workflow_healing_audit (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS healing_audit_company_created_idx
  ON guided_workflow_healing_audit (company_id, created_at DESC);

-- Add version tracking to guided_workflow_guides
ALTER TABLE guided_workflow_guides
ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
ADD COLUMN IF NOT EXISTS parent_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS version_notes text;

CREATE INDEX IF NOT EXISTS guided_workflow_guides_parent_version_idx
  ON guided_workflow_guides (parent_version_id, version DESC)
  WHERE parent_version_id IS NOT NULL;

COMMENT ON TABLE guided_workflow_healing_suggestions IS 'Stores self-healing suggestions for workflow playback when controls are not found';
COMMENT ON TABLE guided_workflow_healing_audit IS 'Audit log for all healing attempts and approvals';
COMMENT ON COLUMN guided_workflow_guides.version IS 'Version number for workflow, incremented when healing suggestions are applied';
COMMENT ON COLUMN guided_workflow_guides.parent_version_id IS 'Reference to the parent workflow version if this is a healed version';
