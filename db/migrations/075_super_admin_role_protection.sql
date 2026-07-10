ALTER TABLE users
DROP COLUMN IF EXISTS is_system;

UPDATE roles existing_admin
SET
  name = 'Super Admin',
  description = COALESCE(existing_admin.description, 'Protected company super administrator role.'),
  is_admin_role = true,
  updated_at = now()
WHERE existing_admin.is_system = true
  AND lower(existing_admin.name) = 'admin'
  AND existing_admin.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM roles existing_super_admin
    WHERE existing_super_admin.company_id = existing_admin.company_id
      AND lower(existing_super_admin.name) = lower('Super Admin')
      AND existing_super_admin.deleted_at IS NULL
      AND existing_super_admin.id <> existing_admin.id
  );

INSERT INTO roles (company_id, name, description, is_admin_role, is_system)
SELECT
  companies.id,
  'Super Admin',
  'Protected company super administrator role.',
  true,
  true
FROM companies
WHERE companies.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM roles
    WHERE roles.company_id = companies.id
      AND lower(roles.name) = lower('Super Admin')
      AND roles.deleted_at IS NULL
  );

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, modules.key
FROM roles
CROSS JOIN modules
WHERE roles.is_system = true
  AND lower(roles.name) = lower('Super Admin')
  AND roles.deleted_at IS NULL
ON CONFLICT DO NOTHING;
