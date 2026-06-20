ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_updated_by_idx ON companies (updated_by);
CREATE INDEX IF NOT EXISTS roles_updated_by_idx ON roles (updated_by);
CREATE INDEX IF NOT EXISTS users_updated_by_idx ON users (updated_by);
