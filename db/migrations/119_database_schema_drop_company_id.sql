-- Drop company_id from target_app_database_schemas and add database description.
-- target_app_id already determines tenant scope through guided_workflow_target_apps -> company_target_applications.

ALTER TABLE target_app_database_schemas
  ADD COLUMN IF NOT EXISTS database_description text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'target_app_database_schemas'
      AND column_name = 'company_id'
  ) THEN
    ALTER TABLE target_app_database_schemas DROP COLUMN company_id;
  END IF;
END $$;

DROP INDEX IF EXISTS target_app_database_schemas_company_idx;
CREATE INDEX IF NOT EXISTS target_app_database_schemas_target_app_idx
  ON target_app_database_schemas (target_app_id)
  WHERE deleted_at IS NULL;
