-- Database schema manager storage for Database Node configuration.
-- Stores schema-only metadata per target app and database with active/inactive versioning.

CREATE TABLE IF NOT EXISTS target_app_database_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  database_name text NOT NULL,
  database_type text NOT NULL,
  version integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  schema_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  CONSTRAINT target_app_database_schemas_version_unique UNIQUE (target_app_id, database_name, version)
);

CREATE INDEX IF NOT EXISTS target_app_database_schemas_company_idx
  ON target_app_database_schemas (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS target_app_database_schemas_lookup_idx
  ON target_app_database_schemas (target_app_id, database_name, version DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS target_app_database_schemas_active_unique
  ON target_app_database_schemas (target_app_id, database_name)
  WHERE is_active = true AND deleted_at IS NULL;

INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  16,
  'Database Schema Manager',
  '/control-panel/administration/database-schema',
  55,
  2
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 16
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
