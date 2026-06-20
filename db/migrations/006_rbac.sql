ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_admin_role boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'roles'
      AND column_name = 'key'
  ) THEN
    EXECUTE 'UPDATE roles SET is_admin_role = true WHERE lower(name) IN (''admin'', ''owner'') OR key IN (''admin'', ''owner'')';
  ELSE
    UPDATE roles SET is_admin_role = true WHERE lower(name) IN ('admin', 'owner');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS modules (
  key integer PRIMARY KEY,
  name text NOT NULL,
  href text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE modules DROP COLUMN IF EXISTS code;

CREATE TABLE IF NOT EXISTS role_module_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_key)
);

CREATE INDEX IF NOT EXISTS role_module_permissions_module_key_idx
  ON role_module_permissions (module_key);

INSERT INTO modules (key, name, href, sort_order)
VALUES
  (1, 'Overview', '/control-panel', 10),
  (2, 'Administration', '/control-panel/administration', 20),
  (3, 'User Management', '/control-panel/user-management', 30)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, modules.key
FROM roles
CROSS JOIN (VALUES (1), (2), (3)) AS modules(key)
WHERE roles.is_admin_role = true
ON CONFLICT DO NOTHING;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, modules.key
FROM roles
CROSS JOIN (VALUES (1), (2), (3)) AS modules(key)
WHERE roles.is_admin_role = true
ON CONFLICT DO NOTHING;
