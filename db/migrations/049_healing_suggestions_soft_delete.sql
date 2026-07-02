ALTER TABLE guided_workflow_healing_suggestions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS healing_suggestions_not_deleted_idx
  ON guided_workflow_healing_suggestions (company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'guided_workflow_healing_audit_event_type_check'
      AND conrelid = 'guided_workflow_healing_audit'::regclass
  ) THEN
    ALTER TABLE guided_workflow_healing_audit
      DROP CONSTRAINT guided_workflow_healing_audit_event_type_check;
  END IF;
END $$;

ALTER TABLE guided_workflow_healing_audit
  ADD CONSTRAINT guided_workflow_healing_audit_event_type_check
  CHECK (event_type IN ('attempt', 'success', 'failure', 'approved', 'rejected', 'manual_edit', 'deleted'));
