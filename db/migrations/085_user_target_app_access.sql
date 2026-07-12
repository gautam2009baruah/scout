-- Optional per-user target-app restrictions.
-- No rows for a user within a target app's company means access to all apps.
CREATE TABLE IF NOT EXISTS user_target_app_access (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_app_id uuid NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_at timestamptz,
  PRIMARY KEY (user_id, target_app_id)
);

ALTER TABLE user_target_app_access
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS user_target_app_access_target_app_idx
  ON user_target_app_access(target_app_id);

CREATE INDEX IF NOT EXISTS user_target_app_access_user_idx
  ON user_target_app_access(user_id);

CREATE INDEX IF NOT EXISTS user_target_app_access_active_idx
  ON user_target_app_access(user_id, target_app_id)
  WHERE deleted_at IS NULL;
