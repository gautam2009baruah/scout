-- Migration 101: Add usage tracking fields expected by admin email credentials API

ALTER TABLE email_credentials
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- Backfill new usage/error fields from existing test telemetry fields.
UPDATE email_credentials
SET
  last_used_at = COALESCE(last_used_at, last_tested_at),
  last_error = COALESCE(last_error, last_test_error)
WHERE
  last_used_at IS NULL
  OR last_error IS NULL;