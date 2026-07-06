-- Fix route paths to match menu hierarchy
-- Administration submenu items should have routes under /control-panel/administration/
-- Top-level items should NOT have routes under /control-panel/administration/

-- Update all Administration submenu items to have descriptive routes
UPDATE modules
SET href = '/control-panel/administration/company-role-setup'
WHERE key = 2;

UPDATE modules
SET href = '/control-panel/administration/user-management'
WHERE key = 3;

UPDATE modules
SET href = '/control-panel/administration/ai-configuration'
WHERE key = 5;

-- Move Orchestration Designer out of administration path (it's a top-level item)
UPDATE modules
SET href = '/control-panel/orchestration-designer'
WHERE key = 10;
