-- Migration 083: remove unsupported orchestration trigger types
-- Keeps only manual, chatbot, email, and schedule trigger types.

BEGIN;

-- Delete existing triggers for removed types before tightening constraints.
DELETE FROM orchestration_triggers
WHERE trigger_type IN ('webhook', 'api', 'file_upload');

-- Remove trigger-specific tables no longer used.
DROP TABLE IF EXISTS webhook_deliveries CASCADE;
DROP TABLE IF EXISTS webhook_triggers CASCADE;
DROP TABLE IF EXISTS file_upload_trigger_files CASCADE;
DROP TABLE IF EXISTS file_upload_triggers CASCADE;
DROP TABLE IF EXISTS api_request_logs CASCADE;
DROP TABLE IF EXISTS api_clients CASCADE;

-- Rebuild trigger_type checks to only allow supported trigger types.
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'orchestration_triggers'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%trigger_type%'
  LOOP
    EXECUTE format('ALTER TABLE orchestration_triggers DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_trigger_type_check
  CHECK (trigger_type IN ('manual', 'chatbot', 'email', 'schedule'));

COMMIT;
