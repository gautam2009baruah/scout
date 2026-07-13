-- Ensure every datetime column in public tables uses timestamptz.
-- Existing timestamp values are interpreted as UTC when converting.

DO $$
DECLARE
  column_row RECORD;
BEGIN
  FOR column_row IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      a.attname AS column_name
    FROM pg_attribute a
    INNER JOIN pg_class c ON c.oid = a.attrelid
    INNER JOIN pg_namespace n ON n.oid = c.relnamespace
    INNER JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND a.attnum > 0
      AND NOT a.attisdropped
      AND t.typname = 'timestamp'
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
      column_row.schema_name,
      column_row.table_name,
      column_row.column_name,
      column_row.column_name,
      'UTC'
    );
  END LOOP;
END $$;
