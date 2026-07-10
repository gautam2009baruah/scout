-- Migration 068: Store approval responders by user id
-- Note: orchestration_approvals.responded_by_email is migrated in 067 via migrate_email_audit_column
-- This migration is kept for backwards compatibility but uses conditional logic

ALTER TABLE orchestration_approvals
  ADD COLUMN IF NOT EXISTS responded_by UUID;

-- Only attempt the update and drop if the old column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = 'orchestration_approvals'::regclass
      AND attname = 'responded_by_email'
      AND NOT attisdropped
  ) THEN
    UPDATE orchestration_approvals oa
    SET responded_by = users.id
    FROM users
    WHERE oa.responded_by IS NULL
      AND oa.responded_by_email IS NOT NULL
      AND lower(users.email) = lower(oa.responded_by_email);

    ALTER TABLE orchestration_approvals
      DROP COLUMN responded_by_email;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orchestration_approvals_responded_by_fkey'
  ) THEN
    ALTER TABLE orchestration_approvals
      ADD CONSTRAINT orchestration_approvals_responded_by_fkey
      FOREIGN KEY (responded_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;
