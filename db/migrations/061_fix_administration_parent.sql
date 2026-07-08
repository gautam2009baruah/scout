-- Migration 061: Fix Administration Menu Structure
-- Problem: Key 2 was both a parent (in parent_key references) and a page (Company & Role Setup)
-- Solution: Restore key 2 as "Administration" parent, move Company & Role Setup to new key

-- Step 1: Restore key 2 as "Administration" parent menu (no page, just container)
UPDATE modules
SET 
  name = 'Administration',
  href = '#',  -- No direct page, just a parent container
  sort_order = 20,
  parent_key = NULL  -- Top-level item
WHERE key = 2;

-- Step 2: Create "Company & Role Setup" as a child under Administration
INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  12,
  'Company & Role Setup',
  '/control-panel/administration/company-role-setup',
  21,
  2  -- Child of Administration
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

-- Step 3: Grant access to admin roles for the new Company & Role Setup module
INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 12
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();

-- Step 4: Update sort orders for better organization
UPDATE modules SET sort_order = 22 WHERE key = 3;  -- User Management
UPDATE modules SET sort_order = 23 WHERE key = 5;  -- AI Configuration
UPDATE modules SET sort_order = 46 WHERE key = 7;  -- Workflow Training Setup
UPDATE modules SET sort_order = 47 WHERE key = 8;  -- Workflow Self-healing Review
UPDATE modules SET sort_order = 48 WHERE key = 9;  -- Workflow Analytics
UPDATE modules SET sort_order = 70 WHERE key = 11; -- Email Credentials
