-- Migration 089: Add Search Analytics menu item
-- Adds tenant-safe chat search analytics dashboard under Administration.

INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  14,
  'Search Analytics',
  '/control-panel/administration/search-analytics',
  50,
  2
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 14
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
