-- Migration 072: Move active/inactive state to company memberships

ALTER TABLE user_company_roles
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE user_company_roles
  DROP CONSTRAINT IF EXISTS user_company_roles_status_check;

UPDATE user_company_roles
SET status = CASE
  WHEN users.status = 'inactive' THEN 'inactive'
  ELSE 'active'
END
FROM users
WHERE users.id = user_company_roles.user_id;

ALTER TABLE user_company_roles
  ADD CONSTRAINT user_company_roles_status_check
  CHECK (status IN ('active', 'inactive'));

UPDATE users
SET status = 'active'
WHERE status = 'inactive'
  AND deleted_at IS NULL;

UPDATE users
SET status = 'deleted'
WHERE deleted_at IS NOT NULL
  AND status <> 'deleted';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'deleted'));

CREATE INDEX IF NOT EXISTS idx_user_company_roles_status
  ON user_company_roles(company_id, status)
  WHERE deleted_at IS NULL;
