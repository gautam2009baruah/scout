INSERT INTO modules (key, name, href, sort_order)
VALUES (4, 'Content Structure', '/control-panel/content-structure', 40)
ON CONFLICT (key)
DO UPDATE SET name = EXCLUDED.name, href = EXCLUDED.href, sort_order = EXCLUDED.sort_order;

CREATE TABLE IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES topics(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT topics_no_self_parent CHECK (id <> parent_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS topics_company_parent_slug_active_idx
ON topics (company_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS topics_parent_idx ON topics(parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS topics_company_idx ON topics(company_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS role_topic_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS role_topic_permissions_active_idx
ON role_topic_permissions(role_id, topic_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS user_topic_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS user_topic_permissions_active_idx
ON user_topic_permissions(user_id, topic_id)
WHERE deleted_at IS NULL;
