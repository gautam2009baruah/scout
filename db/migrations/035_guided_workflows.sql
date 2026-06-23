CREATE TABLE IF NOT EXISTS guided_workflow_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  recorded_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guided_workflow_guides_company_status_idx
  ON guided_workflow_guides (company_id, status, updated_at DESC);

INSERT INTO modules (key, name, href, sort_order)
VALUES (6, 'Guided Workflows', '/control-panel/guided-workflows', 45)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    href = EXCLUDED.href,
    sort_order = EXCLUDED.sort_order;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 6
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
