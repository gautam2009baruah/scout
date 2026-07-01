ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS pre_workflow_confirmation_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pre_workflow_confirmation_enabled boolean NOT NULL DEFAULT false;
