ALTER TABLE guided_workflow_target_apps
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES company_target_applications(id) ON DELETE RESTRICT;

-- Ensure every active guided target app has a canonical company target app row.
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
WHERE cta.id IS NULL
  AND (gta.deleted_at IS NULL OR gta.deleted_at > now())
ON CONFLICT (company_id, lower(name)) WHERE deleted_at IS NULL
DO NOTHING;

-- Backfill FK from canonical table.
UPDATE guided_workflow_target_apps gta
SET target_app_id = cta.id
FROM company_target_applications cta
WHERE gta.target_app_id IS NULL
  AND cta.company_id = gta.company_id
  AND lower(cta.name) = lower(gta.name)
  AND cta.deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS guided_workflow_target_apps_target_app_idx
  ON guided_workflow_target_apps (target_app_id);

-- Enforce one guided target-app settings row per canonical target app (active rows only).
CREATE UNIQUE INDEX IF NOT EXISTS guided_workflow_target_apps_target_app_unique
  ON guided_workflow_target_apps (target_app_id)
  WHERE target_app_id IS NOT NULL AND deleted_at IS NULL;
