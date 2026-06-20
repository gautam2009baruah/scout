UPDATE role_module_permissions
SET deleted_at = now(),
    updated_at = now()
FROM roles
WHERE role_module_permissions.role_id = roles.id
  AND role_module_permissions.module_key = 1
  AND roles.is_admin_role = false
  AND role_module_permissions.deleted_at IS NULL;

UPDATE user_module_permissions
SET deleted_at = now(),
    updated_at = now()
FROM users
INNER JOIN roles ON roles.id = users.role_id
WHERE user_module_permissions.user_id = users.id
  AND user_module_permissions.module_key = 1
  AND roles.is_admin_role = false
  AND user_module_permissions.deleted_at IS NULL;
