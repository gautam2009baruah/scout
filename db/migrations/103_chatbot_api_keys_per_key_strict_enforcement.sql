-- Move strict environment enforcement from company-level to per-key behavior

ALTER TABLE chatbot_api_keys
  ADD COLUMN IF NOT EXISTS strict_environment_enforcement BOOLEAN NOT NULL DEFAULT FALSE;

-- Preserve existing behavior by enabling strict enforcement on existing keys
-- where the company-level toggle had already been enabled.
UPDATE chatbot_api_keys k
SET strict_environment_enforcement = true
FROM companies c
WHERE c.id = k.company_id
  AND COALESCE(c.enforce_chatbot_key_environment, false) = true;

CREATE INDEX IF NOT EXISTS idx_chatbot_api_keys_strict_environment_enforcement
  ON chatbot_api_keys(strict_environment_enforcement)
  WHERE strict_environment_enforcement = true;
