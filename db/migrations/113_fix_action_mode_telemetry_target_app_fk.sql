-- Align action-mode telemetry with the chatbot's target-app identifier model.
-- API keys and chatbot requests use guided_workflow_target_apps.id.

ALTER TABLE chatbot_action_mode_events
  DROP CONSTRAINT IF EXISTS chatbot_action_mode_events_target_app_id_fkey;

ALTER TABLE chatbot_action_mode_events
  ADD CONSTRAINT chatbot_action_mode_events_target_app_id_fkey
  FOREIGN KEY (target_app_id)
  REFERENCES guided_workflow_target_apps(id)
  ON DELETE SET NULL;
