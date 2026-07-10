ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS guided_workflow_revoked_recorder_tokens (
  token_hash text PRIMARY KEY,
  topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE CASCADE,
  revoked_reason text NOT NULL DEFAULT 'Recording was halted by an administrator.',
  revoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guided_workflow_revoked_tokens_topic_idx
  ON guided_workflow_revoked_recorder_tokens (topic_id, revoked_at DESC);
