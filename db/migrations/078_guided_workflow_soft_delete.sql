ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS guided_workflow_recording_sessions_deleted_idx
  ON guided_workflow_recording_sessions (company_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS guided_workflow_topics_deleted_idx
  ON guided_workflow_topics (recording_session_id, deleted_at, sort_order, created_at);
