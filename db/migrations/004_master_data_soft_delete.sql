ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS companies_deleted_at_idx ON companies (deleted_at);
CREATE INDEX IF NOT EXISTS roles_deleted_at_idx ON roles (deleted_at);
