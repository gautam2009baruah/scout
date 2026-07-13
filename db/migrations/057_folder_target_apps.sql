CREATE TABLE IF NOT EXISTS folder_target_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  target_app_id uuid NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, target_app_id)
);

CREATE INDEX IF NOT EXISTS folder_target_apps_folder_active_idx
  ON folder_target_apps(folder_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS folder_target_apps_target_active_idx
  ON folder_target_apps(target_app_id) WHERE deleted_at IS NULL;
