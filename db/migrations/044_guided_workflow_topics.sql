DELETE FROM guided_workflow_recorded_actions;
DELETE FROM guided_workflow_recording_sessions;
DELETE FROM guided_workflow_guides;

CREATE TABLE IF NOT EXISTS guided_workflow_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  recording_session_id uuid NOT NULL REFERENCES guided_workflow_recording_sessions(id) ON DELETE CASCADE,
  guide_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  recorder_token_hash text NOT NULL UNIQUE,
  recorder_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions_count integer NOT NULL DEFAULT 0 CHECK (actions_count >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guided_workflow_topics_session_order_idx
  ON guided_workflow_topics (recording_session_id, sort_order, created_at);

ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE SET NULL;

ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE CASCADE;

ALTER TABLE guided_workflow_recorded_actions
  ALTER COLUMN topic_id SET NOT NULL;

ALTER TABLE guided_workflow_recorded_actions
  DROP CONSTRAINT IF EXISTS guided_workflow_recorded_actions_recording_session_id_action_index_key;

DROP INDEX IF EXISTS guided_workflow_recorded_actions_session_idx;

CREATE UNIQUE INDEX IF NOT EXISTS guided_workflow_recorded_actions_topic_action_idx
  ON guided_workflow_recorded_actions (topic_id, action_index);

ALTER TABLE guided_workflow_recording_sessions
  DROP COLUMN IF EXISTS guide_id,
  DROP COLUMN IF EXISTS recorder_token_hash,
  DROP COLUMN IF EXISTS recorder_config_json,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS actions_count,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS stopped_at;

ALTER TABLE guided_workflow_guides
  DROP COLUMN IF EXISTS recording_session_id;
