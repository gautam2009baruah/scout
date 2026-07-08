-- Migration 059: Add Email Credentials to Administration Menu

-- Insert Email Credentials module in the flat modules menu.
-- Note: parent_key will be set in migration 060 to establish hierarchy
INSERT INTO modules (key, name, href, sort_order)
VALUES (
  11,
  'Email Credentials',
  '/control-panel/administration/email-credentials',
  70
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order;

-- Grant access to admin roles.
INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 11
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
