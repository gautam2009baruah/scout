-- Add display_description column to orchestration_nodes for execution plan display

ALTER TABLE orchestration_nodes 
ADD COLUMN IF NOT EXISTS display_description text;

COMMENT ON COLUMN orchestration_nodes.display_description IS 'Human-readable step description shown to users in execution plan';
