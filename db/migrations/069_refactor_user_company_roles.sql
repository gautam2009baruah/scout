-- Migration: Refactor user-company-role relationships
-- Remove company_id & role_id from users table (make user_company_roles the source of truth)
-- Add is_primary flag to mark default company for each user

-- Step 1: Add new columns to user_company_roles if they don't exist
ALTER TABLE user_company_roles
ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

-- Step 2: Set first company per user as primary (based on created_at)
UPDATE user_company_roles SET is_primary = true 
WHERE (user_id, created_at) IN (
  SELECT user_id, MIN(created_at) 
  FROM user_company_roles 
  WHERE deleted_at IS NULL
  GROUP BY user_id
)
AND deleted_at IS NULL;

-- Step 3: Ensure roles table has NOT NULL company_id (company-specific roles only)
-- Add company_id if it doesn't exist, set to companies.id for existing roles
ALTER TABLE roles
ADD COLUMN IF NOT EXISTS company_id_temp UUID;

-- Populate company_id_temp from users table (via user_company_roles relationship)
UPDATE roles SET company_id_temp = (
  SELECT DISTINCT ucr.company_id
  FROM user_company_roles ucr
  WHERE ucr.role_id = roles.id
  LIMIT 1
)
WHERE company_id_temp IS NULL;

-- If a role has no assignments yet, assign to first company (for seeding purposes)
UPDATE roles SET company_id_temp = (
  SELECT id FROM companies LIMIT 1
)
WHERE company_id_temp IS NULL;

-- Make company_id_temp the primary column and add NOT NULL constraint
ALTER TABLE roles 
DROP COLUMN IF EXISTS company_id CASCADE;

ALTER TABLE roles 
RENAME COLUMN company_id_temp TO company_id;

ALTER TABLE roles 
ALTER COLUMN company_id SET NOT NULL;

-- Add unique constraint: each company has unique role names
ALTER TABLE roles 
DROP CONSTRAINT IF EXISTS roles_company_id_name_unique;

ALTER TABLE roles 
ADD CONSTRAINT roles_company_id_name_unique UNIQUE(company_id, name);

-- Step 4: Add foreign key constraint for roles.company_id
ALTER TABLE roles 
DROP CONSTRAINT IF EXISTS fk_roles_company_id;

ALTER TABLE roles 
ADD CONSTRAINT fk_roles_company_id FOREIGN KEY (company_id) 
  REFERENCES companies(id) ON DELETE RESTRICT;

-- Step 5: Drop company_id and role_id from users table
-- These are now stored in user_company_roles only
ALTER TABLE users 
DROP COLUMN IF EXISTS company_id,
DROP COLUMN IF EXISTS role_id;

-- Step 6: Add index for common queries
CREATE INDEX IF NOT EXISTS idx_user_company_roles_user_id_is_primary 
  ON user_company_roles(user_id, is_primary) 
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_roles_company_id 
  ON roles(company_id);

-- Step 7: Add audit columns to users table if missing
ALTER TABLE users
ADD COLUMN IF NOT EXISTS created_by UUID,
ADD COLUMN IF NOT EXISTS updated_by UUID;

-- Rollback instructions:
-- If needed to revert, keep backups of users table before running this migration
-- This migration is one-way: company_id & role_id are permanently moved to user_company_roles
