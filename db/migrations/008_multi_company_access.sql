ALTER TABLE role_module_permissions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS role_module_permissions_deleted_at_idx
  ON role_module_permissions (deleted_at);

CREATE TABLE IF NOT EXISTS user_company_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS user_company_roles_company_id_idx
  ON user_company_roles (company_id);

CREATE INDEX IF NOT EXISTS user_company_roles_role_id_idx
  ON user_company_roles (role_id);

CREATE INDEX IF NOT EXISTS user_company_roles_deleted_at_idx
  ON user_company_roles (deleted_at);
