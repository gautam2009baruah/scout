-- Flags a generated document as potentially out of date, driven by frequent
-- self-healing activity on its source guide (see http-api/smart-finder-api).
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS is_stale boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS documents_stale_idx
  ON documents (company_id, is_stale)
  WHERE is_stale = true AND status <> 'deleted';

COMMENT ON COLUMN documents.is_stale IS 'True when the source guide has healed frequently since this document was last generated';
