-- Treat chatbot users as external-first identifiers.
-- Persist GUIDs directly in user_id without requiring a users-table row.

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

ALTER TABLE chat_query_telemetry
  DROP CONSTRAINT IF EXISTS chat_query_telemetry_user_id_fkey;

UPDATE conversations
SET user_id = external_user_id::uuid
WHERE user_id IS NULL
  AND external_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

UPDATE chat_query_telemetry
SET user_id = external_user_id::uuid
WHERE user_id IS NULL
  AND external_user_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
