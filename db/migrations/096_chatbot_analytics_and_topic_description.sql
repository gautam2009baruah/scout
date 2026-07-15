ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

UPDATE modules
SET name = 'Chatbot Analytics'
WHERE key = 14;

DELETE FROM role_module_permissions
WHERE module_key = 9;

DELETE FROM modules
WHERE key = 9;
