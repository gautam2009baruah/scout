UPDATE guided_workflow_recording_sessions rs
SET company_target_application_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta
  ON cta.company_id = gta.company_id
 AND lower(cta.name) = lower(gta.name)
 AND cta.deleted_at IS NULL
WHERE rs.company_target_application_id IS NULL
  AND rs.target_app_id = gta.id;

CREATE INDEX IF NOT EXISTS guided_workflow_recording_sessions_company_target_app_active_idx
  ON guided_workflow_recording_sessions (company_target_application_id, deleted_at, updated_at DESC);

ALTER TABLE guided_workflow_recording_sessions
  DROP COLUMN IF EXISTS company_id,
  DROP COLUMN IF EXISTS target_app_id;
