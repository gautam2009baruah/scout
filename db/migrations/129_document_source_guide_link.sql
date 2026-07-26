-- Link documents to the guided workflow guide they were auto-generated from, if any
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS source_guide_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_source_guide_idx
  ON documents (source_guide_id)
  WHERE source_guide_id IS NOT NULL AND status <> 'deleted';

COMMENT ON COLUMN documents.source_guide_id IS 'Guide this document was auto-generated from, if any';
