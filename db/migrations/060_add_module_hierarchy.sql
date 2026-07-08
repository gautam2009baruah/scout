-- Migration 060: Add Module Hierarchy Support
-- Adds parent_key to support nested/submenu structure from database

-- Add parent_key column to modules table
ALTER TABLE modules 
ADD COLUMN IF NOT EXISTS parent_key INTEGER REFERENCES modules(key) ON DELETE SET NULL;

-- Create index for efficient parent lookups
CREATE INDEX IF NOT EXISTS idx_modules_parent_key ON modules(parent_key);

-- Set parent_key for Administration submenu items
-- These modules should appear under the Administration parent (key 2)
UPDATE modules
SET parent_key = 2
WHERE key IN (
  3,  -- User Management
  5,  -- AI Configuration
  7,  -- Workflow Training Setup
  8,  -- Workflow Self-healing Review
  9,  -- Workflow Analytics
  11  -- Email Credentials
);

-- Administration itself is a top-level item (parent_key = NULL)
UPDATE modules
SET parent_key = NULL
WHERE key = 2;

-- Ensure other top-level items have parent_key = NULL
UPDATE modules
SET parent_key = NULL
WHERE key IN (
  1,   -- Overview
  4,   -- Content Structure
  6,   -- Guided Workflows
  10   -- Orchestration Designer
);
