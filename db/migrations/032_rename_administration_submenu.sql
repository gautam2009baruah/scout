UPDATE modules
SET name = 'Company & Role Setup',
    href = '/control-panel/administration',
    sort_order = 20
WHERE key = 2;

UPDATE modules
SET name = 'User Management',
    href = '/control-panel/user-management',
    sort_order = 30
WHERE key = 3;

UPDATE modules
SET name = 'AI Configuration',
    href = '/control-panel/ai-configuration',
    sort_order = 40
WHERE key = 5;

UPDATE modules
SET name = 'Content Structure',
    href = '/control-panel/content-structure',
    sort_order = 50
WHERE key = 4;
