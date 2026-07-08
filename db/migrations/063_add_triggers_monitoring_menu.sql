-- Migration 063: Add Triggers Monitoring Menu Item
-- Adds a menu link for the Triggers Monitoring Dashboard under Guided Workflows

-- Add Triggers Monitoring module (key 13)
INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  13,
  'Triggers Monitoring',
  '/control-panel/triggers-monitoring',
  49,  -- After Workflow Analytics (48)
  6    -- Child of Guided Workflows
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

-- Grant access to admin roles for the Triggers Monitoring module
INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 13
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();

-- Note: This creates a navigation link for the monitoring dashboard
-- that allows admins to view all triggers, their status, and execution history
