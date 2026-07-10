-- Fix user_company_roles.role_id FK from RESTRICT to CASCADE
-- This allows manual deletion of roles (and companies via role cascade)
-- without being blocked by user_company_roles rows

ALTER TABLE user_company_roles
  DROP CONSTRAINT IF EXISTS user_company_roles_role_id_fkey;

ALTER TABLE user_company_roles
  ADD CONSTRAINT user_company_roles_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES roles(id)
    ON DELETE CASCADE;
