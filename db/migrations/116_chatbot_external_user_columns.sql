-- Normalize chatbot-owned tables to external_user_id semantics.
-- These IDs come from outside the platform and are kept only for auditing.

-- Conversations
UPDATE conversations
SET external_user_id = COALESCE(external_user_id, user_id::text)
WHERE user_id IS NOT NULL;

ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_user_id_fkey;

DROP INDEX IF EXISTS conversations_user_id_idx;
DROP INDEX IF EXISTS conversations_company_user_status_last_message_idx;

ALTER TABLE conversations
  DROP COLUMN IF EXISTS user_id;

CREATE INDEX IF NOT EXISTS conversations_company_external_user_status_last_message_idx
  ON conversations (company_id, external_user_id, status, last_message_at DESC)
  WHERE external_user_id IS NOT NULL;

-- Chat query telemetry
UPDATE chat_query_telemetry
SET external_user_id = COALESCE(external_user_id, user_id::text)
WHERE user_id IS NOT NULL;

ALTER TABLE chat_query_telemetry
  DROP CONSTRAINT IF EXISTS chat_query_telemetry_user_id_fkey;

DROP INDEX IF EXISTS chat_query_telemetry_user_created_idx;

ALTER TABLE chat_query_telemetry
  DROP COLUMN IF EXISTS user_id;

CREATE INDEX IF NOT EXISTS chat_query_telemetry_external_user_created_idx
  ON chat_query_telemetry (external_user_id, created_at DESC)
  WHERE external_user_id IS NOT NULL;

-- Chat query feedback
ALTER TABLE chat_query_feedback
  DROP CONSTRAINT IF EXISTS chat_query_feedback_user_id_fkey;

ALTER TABLE chat_query_feedback
  RENAME COLUMN user_id TO external_user_id;

ALTER TABLE chat_query_feedback
  DROP CONSTRAINT IF EXISTS chat_query_feedback_query_id_user_id_key;

ALTER TABLE chat_query_feedback
  ADD CONSTRAINT chat_query_feedback_query_id_external_user_id_key
  UNIQUE (query_id, external_user_id);

-- Intent gate decisions
ALTER TABLE chatbot_intent_gate_decisions
  DROP CONSTRAINT IF EXISTS chatbot_intent_gate_decisions_user_id_fkey;

ALTER TABLE chatbot_intent_gate_decisions
  RENAME COLUMN user_id TO external_user_id;

DROP INDEX IF EXISTS chatbot_intent_gate_decisions_user_created_idx;
CREATE INDEX IF NOT EXISTS chatbot_intent_gate_decisions_external_user_created_idx
  ON chatbot_intent_gate_decisions (external_user_id, created_at DESC);

-- Intent gate feedback
ALTER TABLE chatbot_intent_gate_feedback
  DROP CONSTRAINT IF EXISTS chatbot_intent_gate_feedback_user_id_fkey;

ALTER TABLE chatbot_intent_gate_feedback
  RENAME COLUMN user_id TO external_user_id;

ALTER TABLE chatbot_intent_gate_feedback
  DROP CONSTRAINT IF EXISTS chatbot_intent_gate_feedback_decision_id_user_id_key;

ALTER TABLE chatbot_intent_gate_feedback
  ADD CONSTRAINT chatbot_intent_gate_feedback_decision_id_external_user_id_key
  UNIQUE (decision_id, external_user_id);

-- Action mode events
ALTER TABLE chatbot_action_mode_events
  DROP CONSTRAINT IF EXISTS chatbot_action_mode_events_user_id_fkey;

ALTER TABLE chatbot_action_mode_events
  RENAME COLUMN user_id TO external_user_id;

DROP INDEX IF EXISTS chatbot_action_mode_events_user_created_idx;
CREATE INDEX IF NOT EXISTS chatbot_action_mode_events_external_user_created_idx
  ON chatbot_action_mode_events (external_user_id, created_at DESC);
