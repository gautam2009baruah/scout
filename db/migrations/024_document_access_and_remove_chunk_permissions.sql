CREATE TABLE IF NOT EXISTS document_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (document_id, role_id)
);

CREATE TABLE IF NOT EXISTS document_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS document_role_permissions_document_id_idx ON document_role_permissions (document_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS document_role_permissions_role_id_idx ON document_role_permissions (role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS document_user_permissions_document_id_idx ON document_user_permissions (document_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS document_user_permissions_user_id_idx ON document_user_permissions (user_id) WHERE deleted_at IS NULL;

DROP TABLE IF EXISTS chunk_permissions;
