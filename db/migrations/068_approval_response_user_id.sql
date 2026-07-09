-- Migration 068: Store approval responders by user id

ALTER TABLE orchestration_approvals
  ADD COLUMN IF NOT EXISTS responded_by UUID;

UPDATE orchestration_approvals oa
SET responded_by = users.id
FROM users
WHERE oa.responded_by IS NULL
  AND oa.responded_by_email IS NOT NULL
  AND lower(users.email) = lower(oa.responded_by_email);

ALTER TABLE orchestration_approvals
  DROP COLUMN IF EXISTS responded_by_email;

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
