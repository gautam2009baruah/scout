-- Migration 059: Add Email Credentials to Administration Menu

-- Insert Email Credentials module under Administration submenu
INSERT INTO modules (key, name, href, parent_key, display_order, is_active)
VALUES (
  (SELECT COALESCE(MAX(key), 0) + 1 FROM modules),
  'Email Credentials',
  '/control-panel/administration/email-credentials',
  1, -- Administration parent
  70, -- Display order (after existing items)
  true
)
ON CONFLICT DO NOTHING;
