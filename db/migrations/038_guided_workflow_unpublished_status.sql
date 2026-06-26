ALTER TABLE guided_workflow_guides
  DROP CONSTRAINT IF EXISTS guided_workflow_guides_status_check;

ALTER TABLE guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_status_check
  CHECK (status IN ('unpublished', 'draft', 'published'));

ALTER TABLE guided_workflow_guides
  ALTER COLUMN status SET DEFAULT 'unpublished';
