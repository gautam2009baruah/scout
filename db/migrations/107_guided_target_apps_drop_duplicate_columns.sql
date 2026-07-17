-- Ensure all guided target app rows are linked to canonical company target apps.
INSERT INTO company_target_applications (
  company_id,
  name,
  base_url,
  created_by,
  updated_by,
  created_at,
  updated_at
)
SELECT
  gta.company_id,
  gta.name,
  gta.base_url,
  gta.created_by,
  gta.updated_by,
  gta.created_at,
  gta.updated_at
FROM guided_workflow_target_apps gta
LEFT JOIN company_target_applications cta
  ON cta.company_id = gta.company_id
 AND lower(cta.name) = lower(gta.name)
 AND cta.deleted_at IS NULL
WHERE gta.target_app_id IS NULL
  AND cta.id IS NULL
ON CONFLICT (company_id, lower(name)) WHERE deleted_at IS NULL
DO NOTHING;

UPDATE guided_workflow_target_apps gta
SET target_app_id = cta.id
FROM company_target_applications cta
WHERE gta.target_app_id IS NULL
  AND cta.company_id = gta.company_id
  AND lower(cta.name) = lower(gta.name)
  AND cta.deleted_at IS NULL;

-- Enforce mandatory canonical FK before dropping duplicate columns.
ALTER TABLE guided_workflow_target_apps
  ALTER COLUMN target_app_id SET NOT NULL;

-- company_id/name/base_url are now derived from company_target_applications via target_app_id.
ALTER TABLE guided_workflow_target_apps
  DROP COLUMN IF EXISTS company_id,
  DROP COLUMN IF EXISTS name,
  DROP COLUMN IF EXISTS base_url;

CREATE INDEX IF NOT EXISTS guided_workflow_target_apps_target_app_active_idx
  ON guided_workflow_target_apps(target_app_id)
  WHERE deleted_at IS NULL;
