-- Add last_polled_at watermark to orchestration_triggers
-- Distinct from last_triggered_at:
--   last_polled_at    = last time the poller checked the source (fetch watermark)
--   last_triggered_at = last time the trigger actually matched and fired an execution
-- Used by the email trigger poller to fetch only emails received since the last poll.

ALTER TABLE orchestration_triggers
  ADD COLUMN IF NOT EXISTS last_polled_at timestamptz;

COMMENT ON COLUMN orchestration_triggers.last_polled_at IS 'Last time the poller checked this trigger''s source. Used as the fetch watermark so only new items since the previous poll are retrieved.';
