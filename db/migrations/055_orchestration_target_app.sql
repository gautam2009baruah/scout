-- Add target_app_id to orchestrations table
-- Links orchestrations to guided workflow target apps

ALTER TABLE orchestrations
ADD COLUMN IF NOT EXISTS target_app_id uuid;

-- Add foreign key constraint only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orchestrations_target_app_fk'
  ) THEN
    ALTER TABLE orchestrations
    ADD CONSTRAINT orchestrations_target_app_fk FOREIGN KEY (target_app_id) REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orchestrations_target_app_idx ON orchestrations(target_app_id);
