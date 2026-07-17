-- Support external chatbot users that are not present in internal users table.

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS external_user_id text;

ALTER TABLE conversations
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS conversations_company_external_user_status_last_message_idx
  ON conversations (company_id, external_user_id, status, last_message_at DESC)
  WHERE external_user_id IS NOT NULL;

ALTER TABLE chat_query_telemetry
  ADD COLUMN IF NOT EXISTS external_user_id text;

ALTER TABLE chat_query_telemetry
  ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS chat_query_telemetry_external_user_created_idx
  ON chat_query_telemetry (external_user_id, created_at DESC)
  WHERE external_user_id IS NOT NULL;
