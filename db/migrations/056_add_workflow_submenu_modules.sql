-- Add workflow-related submenu items as proper modules
-- These were previously hardcoded in the admin shell component

INSERT INTO modules (key, name, href, sort_order)
VALUES
  (7, 'Workflow Training Setup', '/control-panel/administration/training-setup', 46),
  (8, 'Workflow Self-healing Review', '/control-panel/administration/self-healing-review', 47),
  (9, 'Workflow Analytics', '/control-panel/administration/workflow-analytics', 48),
  (10, 'Orchestration Designer', '/control-panel/administration/orchestration-designer', 49)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order;

-- Grant permissions to admin roles
INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, m.key
FROM roles
CROSS JOIN (VALUES (7), (8), (9), (10)) AS m(key)
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
