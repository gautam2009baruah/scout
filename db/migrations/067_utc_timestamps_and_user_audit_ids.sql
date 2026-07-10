-- Migration 067: Store timestamps as UTC instants and audit users by id
-- Timestamptz values are stored as UTC internally; forcing the DB/session timezone
-- keeps psql/raw DB output from looking like local server time.

SET timezone TO 'UTC';

DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
  EXECUTE format('ALTER ROLE %I SET timezone TO %L', current_user, 'UTC');
END $$;

-- Convert the remaining local timestamp columns to timestamptz.
ALTER TABLE internal_notifications
  ALTER COLUMN created_at TYPE TIMESTAMP WITH TIME ZONE USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN read_at TYPE TIMESTAMP WITH TIME ZONE USING read_at AT TIME ZONE 'UTC',
  ALTER COLUMN created_at SET DEFAULT now();

-- Store notification users as UUIDs too.
ALTER TABLE internal_notifications
  ALTER COLUMN user_id TYPE UUID USING user_id::uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_notifications_user_id_fkey'
  ) THEN
    ALTER TABLE internal_notifications
      ADD CONSTRAINT internal_notifications_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION migrate_email_audit_column(
  target_table regclass,
  old_column_name text,
  new_column_name text
) RETURNS void AS $$
DECLARE
  table_name_text text := target_table::text;
  constraint_name text := replace(table_name_text, '.', '_') || '_' || new_column_name || '_fkey';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = target_table
      AND attname = new_column_name
      AND NOT attisdropped
  ) THEN
    EXECUTE format('ALTER TABLE %s ADD COLUMN %I UUID', target_table, new_column_name);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = target_table
      AND attname = old_column_name
      AND NOT attisdropped
  ) THEN
    EXECUTE format(
      'UPDATE %s t SET %I = u.id FROM users u WHERE t.%I IS NULL AND t.%I IS NOT NULL AND lower(u.email) = lower(t.%I)',
      target_table,
      new_column_name,
      new_column_name,
      old_column_name,
      old_column_name
    );

    EXECUTE format('ALTER TABLE %s DROP COLUMN %I', target_table, old_column_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = constraint_name
  ) THEN
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL',
      target_table,
      constraint_name,
      new_column_name
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

SELECT migrate_email_audit_column('public.api_clients', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.email_credential_target_apps', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.email_credentials', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.email_credentials', 'updated_by_email', 'updated_by');
SELECT migrate_email_audit_column('public.orchestration_approvals', 'responded_by_email', 'responded_by');
SELECT migrate_email_audit_column('public.orchestration_triggers', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.orchestration_triggers', 'updated_by_email', 'updated_by');
SELECT migrate_email_audit_column('public.orchestration_versions', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.orchestrations', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.orchestrations', 'updated_by_email', 'updated_by');
SELECT migrate_email_audit_column('public.orchestrations', 'published_by_email', 'published_by');
SELECT migrate_email_audit_column('public.webhook_triggers', 'created_by_email', 'created_by');
SELECT migrate_email_audit_column('public.webhook_triggers', 'updated_by_email', 'updated_by');

DROP FUNCTION migrate_email_audit_column(regclass, text, text);
