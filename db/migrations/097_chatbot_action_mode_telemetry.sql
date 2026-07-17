CREATE TABLE IF NOT EXISTS chatbot_action_mode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('action_mode_invoked', 'action_mode_auto_reset')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_action_mode_events_company_created_idx
  ON chatbot_action_mode_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_action_mode_events_user_created_idx
  ON chatbot_action_mode_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_action_mode_events_type_created_idx
  ON chatbot_action_mode_events (event_type, created_at DESC);
