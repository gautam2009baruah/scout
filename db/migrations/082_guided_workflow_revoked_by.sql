ALTER TABLE guided_workflow_revoked_recorder_tokens
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS guided_workflow_revoked_tokens_revoked_by_idx
  ON guided_workflow_revoked_recorder_tokens (revoked_by);
