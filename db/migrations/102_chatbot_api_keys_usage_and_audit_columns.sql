-- Migration 102: Add missing usage/audit columns for chatbot_api_keys

ALTER TABLE chatbot_api_keys
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_last_used_at
  ON chatbot_api_keys(last_used_at);