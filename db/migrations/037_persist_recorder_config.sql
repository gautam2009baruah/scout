ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS recorder_config_json jsonb NOT NULL DEFAULT '{}'::jsonb;
