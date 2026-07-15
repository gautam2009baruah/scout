-- Company-level toggle for strict chatbot API key environment enforcement

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS enforce_chatbot_key_environment BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS companies_enforce_chatbot_key_environment_idx
  ON companies(enforce_chatbot_key_environment);
