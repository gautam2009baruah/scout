CREATE TABLE IF NOT EXISTS guided_workflow_target_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  allowed_origins_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guided_workflow_target_apps_company_idx
  ON guided_workflow_target_apps (company_id, name);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'guided_workflow_recording_status') THEN
    CREATE TYPE guided_workflow_recording_status AS ENUM (
      'ready',
      'recording',
      'paused',
      'stopped',
      'converted'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS guided_workflow_recording_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  guide_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  title text NOT NULL,
  status guided_workflow_recording_status NOT NULL DEFAULT 'ready',
  recorder_token_hash text NOT NULL UNIQUE,
  actions_count integer NOT NULL DEFAULT 0 CHECK (actions_count >= 0),
  started_at timestamptz,
  stopped_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guided_workflow_recording_sessions_company_idx
  ON guided_workflow_recording_sessions (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS guided_workflow_recorded_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  recording_session_id uuid NOT NULL REFERENCES guided_workflow_recording_sessions(id) ON DELETE CASCADE,
  action_index integer NOT NULL CHECK (action_index >= 0),
  action_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_session_id, action_index)
);

CREATE INDEX IF NOT EXISTS guided_workflow_recorded_actions_session_idx
  ON guided_workflow_recorded_actions (recording_session_id, action_index);

ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recording_session_id uuid REFERENCES guided_workflow_recording_sessions(id) ON DELETE SET NULL;
