DO $$
BEGIN
  IF to_regclass('public.admin_sessions') IS NOT NULL AND to_regclass('public.user_sessions') IS NULL THEN
    ALTER TABLE admin_sessions RENAME TO user_sessions;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

DO $$
BEGIN
  IF to_regclass('public.admin_modules') IS NOT NULL AND to_regclass('public.modules') IS NULL THEN
    CREATE TABLE modules (
      key integer PRIMARY KEY,
      name text NOT NULL,
      href text NOT NULL,
      sort_order integer NOT NULL DEFAULT 100,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    INSERT INTO modules (key, name, href, sort_order, created_at)
    SELECT
      CASE admin_modules.key
        WHEN 'overview' THEN 1
        WHEN 'master-data' THEN 2
        WHEN 'users' THEN 3
        WHEN 'topics' THEN 4
        ELSE 100 + row_number() OVER (ORDER BY admin_modules.sort_order, admin_modules.key)::integer
      END AS key,
      admin_modules.name,
      admin_modules.href,
      admin_modules.sort_order,
      admin_modules.created_at
    FROM admin_modules
    ON CONFLICT (key)
    DO UPDATE SET
      name = EXCLUDED.name,
      href = EXCLUDED.href,
      sort_order = EXCLUDED.sort_order;

    CREATE TABLE role_module_permissions_new (
      role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      PRIMARY KEY (role_id, module_key)
    );

    INSERT INTO role_module_permissions_new (
      role_id,
      module_key,
      created_at,
      created_by,
      updated_by,
      updated_at,
      deleted_at
    )
    SELECT
      role_module_permissions.role_id,
      CASE role_module_permissions.module_key
        WHEN 'overview' THEN 1
        WHEN 'master-data' THEN 2
        WHEN 'users' THEN 3
        WHEN 'topics' THEN 4
        ELSE role_module_permissions.module_key::integer
      END AS module_key,
      role_module_permissions.created_at,
      role_module_permissions.created_by,
      role_module_permissions.updated_by,
      role_module_permissions.updated_at,
      role_module_permissions.deleted_at
    FROM role_module_permissions
    ON CONFLICT (role_id, module_key) DO NOTHING;

    CREATE TABLE user_module_permissions_new (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
      effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz,
      PRIMARY KEY (user_id, module_key)
    );

    INSERT INTO user_module_permissions_new (
      user_id,
      module_key,
      effect,
      created_by,
      updated_by,
      created_at,
      updated_at,
      deleted_at
    )
    SELECT
      user_module_permissions.user_id,
      CASE user_module_permissions.module_key
        WHEN 'overview' THEN 1
        WHEN 'master-data' THEN 2
        WHEN 'users' THEN 3
        WHEN 'topics' THEN 4
        ELSE user_module_permissions.module_key::integer
      END AS module_key,
      user_module_permissions.effect,
      user_module_permissions.created_by,
      user_module_permissions.updated_by,
      user_module_permissions.created_at,
      user_module_permissions.updated_at,
      user_module_permissions.deleted_at
    FROM user_module_permissions
    ON CONFLICT (user_id, module_key) DO NOTHING;

    DROP TABLE user_module_permissions;
    DROP TABLE role_module_permissions;
    DROP TABLE admin_modules;

    ALTER TABLE role_module_permissions_new RENAME TO role_module_permissions;
    ALTER TABLE user_module_permissions_new RENAME TO user_module_permissions;
  END IF;
END $$;

ALTER TABLE modules DROP COLUMN IF EXISTS code;

CREATE INDEX IF NOT EXISTS role_module_permissions_module_key_idx
  ON role_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS role_module_permissions_deleted_at_idx
  ON role_module_permissions (deleted_at);

CREATE INDEX IF NOT EXISTS user_module_permissions_module_key_idx
  ON user_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS user_module_permissions_deleted_at_idx
  ON user_module_permissions (deleted_at);
