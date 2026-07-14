CREATE TABLE IF NOT EXISTS chatbot_lifecycle_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  max_context_messages integer NOT NULL DEFAULT 20 CHECK (max_context_messages BETWEEN 10 AND 30),
  max_context_tokens integer NOT NULL DEFAULT 5000 CHECK (max_context_tokens BETWEEN 3000 AND 8000),
  inactivity_timeout_seconds integer NOT NULL DEFAULT 1800 CHECK (inactivity_timeout_seconds BETWEEN 60 AND 604800),
  reset_on_logout_event boolean NOT NULL DEFAULT true,
  reset_on_user_change boolean NOT NULL DEFAULT true,
  reset_on_target_app_change boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS chatbot_lifecycle_settings_company_target_scope_unique
  ON chatbot_lifecycle_settings (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chatbot_lifecycle_settings_company_idx
  ON chatbot_lifecycle_settings (company_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS chatbot_lifecycle_settings_target_app_idx
  ON chatbot_lifecycle_settings (target_app_id, updated_at DESC)
  WHERE deleted_at IS NULL;

INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  15,
  'Chatbot Settings',
  '/control-panel/administration/chatbot-settings',
  51,
  2
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 15
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
