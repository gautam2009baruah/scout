ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS company_target_application_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL;

UPDATE guided_workflow_recording_sessions rs
SET company_target_application_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta
  ON cta.company_id = gta.company_id
 AND lower(cta.name) = lower(gta.name)
 AND cta.deleted_at IS NULL
WHERE rs.company_target_application_id IS NULL
  AND rs.target_app_id = gta.id;

CREATE INDEX IF NOT EXISTS guided_workflow_recording_sessions_company_target_app_idx
  ON guided_workflow_recording_sessions (company_target_application_id);

ALTER TABLE guided_workflow_recording_sessions
  DROP COLUMN IF EXISTS guide_id,
  DROP COLUMN IF EXISTS status,
  DROP COLUMN IF EXISTS recorder_token_hash,
  DROP COLUMN IF EXISTS actions_count,
  DROP COLUMN IF EXISTS started_at,
  DROP COLUMN IF EXISTS stopped_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'guided_workflow_recording_status'
  ) THEN
    DROP TYPE guided_workflow_recording_status;
  END IF;
EXCEPTION
  WHEN dependent_objects_still_exist THEN
    NULL;
END $$;
