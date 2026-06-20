CREATE TABLE IF NOT EXISTS folder_document_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, role_id)
);

CREATE TABLE IF NOT EXISTS folder_document_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS folder_document_role_permissions_folder_id_idx ON folder_document_role_permissions (folder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folder_document_role_permissions_role_id_idx ON folder_document_role_permissions (role_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folder_document_user_permissions_folder_id_idx ON folder_document_user_permissions (folder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folder_document_user_permissions_user_id_idx ON folder_document_user_permissions (user_id) WHERE deleted_at IS NULL;
