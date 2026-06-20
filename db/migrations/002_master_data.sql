ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS companies_created_by_idx ON companies (created_by);
CREATE INDEX IF NOT EXISTS roles_company_id_idx ON roles (company_id);
CREATE INDEX IF NOT EXISTS roles_created_by_idx ON roles (created_by);
