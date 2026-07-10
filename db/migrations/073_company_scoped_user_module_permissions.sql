-- Migration 073: Make user module overrides company-scoped

ALTER TABLE user_module_permissions
  ADD COLUMN IF NOT EXISTS company_id UUID;

UPDATE user_module_permissions ump
SET company_id = (
  SELECT user_company_roles.company_id
  FROM user_company_roles
  WHERE user_company_roles.user_id = ump.user_id
    AND user_company_roles.deleted_at IS NULL
  ORDER BY user_company_roles.is_primary DESC NULLS LAST, user_company_roles.created_at ASC
  LIMIT 1
)
WHERE ump.company_id IS NULL;

DELETE FROM user_module_permissions
WHERE company_id IS NULL;

ALTER TABLE user_module_permissions
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE user_module_permissions
  DROP CONSTRAINT IF EXISTS user_module_permissions_pkey;

ALTER TABLE user_module_permissions
  ADD CONSTRAINT user_module_permissions_pkey PRIMARY KEY (user_id, company_id, module_key);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_module_permissions_company_id_fkey'
  ) THEN
    ALTER TABLE user_module_permissions
      ADD CONSTRAINT user_module_permissions_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_module_permissions_user_company_idx
  ON user_module_permissions (user_id, company_id)
  WHERE deleted_at IS NULL;
