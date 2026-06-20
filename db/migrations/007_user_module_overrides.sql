CREATE TABLE IF NOT EXISTS user_module_permissions (
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

CREATE INDEX IF NOT EXISTS user_module_permissions_module_key_idx
  ON user_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS user_module_permissions_deleted_at_idx
  ON user_module_permissions (deleted_at);
