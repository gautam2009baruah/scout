UPDATE guided_workflow_guides
SET status = 'draft',
    updated_at = now()
WHERE status = 'unpublished';

ALTER TABLE guided_workflow_guides
  DROP CONSTRAINT IF EXISTS guided_workflow_guides_status_check;

ALTER TABLE guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_status_check
  CHECK (status IN ('draft', 'published'));

ALTER TABLE guided_workflow_guides
  ALTER COLUMN status SET DEFAULT 'draft';
