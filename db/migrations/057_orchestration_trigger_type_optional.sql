-- Remove trigger_type column from orchestrations table
-- Since trigger configuration is now handled exclusively via trigger nodes in the visual designer,
-- the orchestration-level trigger_type is redundant and should be removed

-- Drop the index first
DROP INDEX IF EXISTS orchestrations_trigger_type_idx;

-- Drop the column
ALTER TABLE orchestrations 
  DROP COLUMN IF EXISTS trigger_type,
  DROP COLUMN IF EXISTS trigger_config;

-- Add comment for clarity
COMMENT ON TABLE orchestrations IS 'Visual workflow orchestration definitions. Trigger configuration is now handled via trigger nodes, not at the orchestration level.';
