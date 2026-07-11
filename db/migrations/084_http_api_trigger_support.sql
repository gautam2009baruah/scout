-- Migration 084: HTTP/API trigger support
-- Adds endpoint slug, new statuses, replay protection, and rate-limit state tables.

BEGIN;

-- Expand supported trigger types.
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
  CHECK (trigger_type IN ('manual', 'chatbot', 'email', 'schedule', 'http_api'));

-- Expand status values for immediate administrative control.
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
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE orchestration_triggers DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END
$$;

ALTER TABLE orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_status_check
  CHECK (status IN ('active', 'inactive', 'error', 'suspended', 'revoked'));

-- Public endpoint slug. No internal identifiers in URL.
ALTER TABLE orchestration_triggers
  ADD COLUMN IF NOT EXISTS endpoint_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS orchestration_triggers_http_api_slug_uidx
  ON orchestration_triggers (lower(endpoint_slug))
  WHERE trigger_type = 'http_api' AND endpoint_slug IS NOT NULL;

-- Replay protection nonce store.
CREATE TABLE IF NOT EXISTS api_trigger_request_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  nonce_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (trigger_id, nonce_hash)
);

CREATE INDEX IF NOT EXISTS api_trigger_request_nonces_expires_idx
  ON api_trigger_request_nonces (expires_at);

-- Lightweight rate-limit buckets.
CREATE TABLE IF NOT EXISTS api_trigger_rate_limit_windows (
  trigger_id uuid NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  client_key text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trigger_id, client_key, window_start)
);

CREATE INDEX IF NOT EXISTS api_trigger_rate_limit_windows_updated_idx
  ON api_trigger_rate_limit_windows (updated_at);

COMMENT ON COLUMN orchestration_triggers.endpoint_slug IS 'Public URL-safe slug used by HTTP/API trigger endpoint';
COMMENT ON TABLE api_trigger_request_nonces IS 'Replay protection nonce store for HTTP/API triggers';
COMMENT ON TABLE api_trigger_rate_limit_windows IS 'Rate-limiting buckets for HTTP/API trigger endpoints';

COMMIT;
