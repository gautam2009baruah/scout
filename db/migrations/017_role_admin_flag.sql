ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_admin_role boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roles'
      AND column_name = 'key'
  ) THEN
    EXECUTE 'UPDATE roles SET is_admin_role = true WHERE key IN (''admin'', ''owner'') OR lower(name) IN (''admin'', ''owner'')';
  ELSE
    UPDATE roles SET is_admin_role = true WHERE lower(name) IN ('admin', 'owner');
  END IF;
END $$;

DROP INDEX IF EXISTS roles_global_key_unique;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    INNER JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
      AND kcu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'roles'
      AND tc.constraint_type = 'UNIQUE'
      AND kcu.column_name = 'key'
  LOOP
    EXECUTE format('ALTER TABLE roles DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE roles DROP COLUMN IF EXISTS key;

CREATE UNIQUE INDEX IF NOT EXISTS roles_company_name_unique
  ON roles (company_id, lower(name))
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS roles_global_name_unique
  ON roles (lower(name))
  WHERE company_id IS NULL AND deleted_at IS NULL;
