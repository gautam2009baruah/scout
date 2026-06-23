DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_storage_mode') THEN
    CREATE TYPE document_storage_mode AS ENUM (
      'managed_upload',
      'external_reference',
      'strict_external_reference'
    );
  END IF;
END $$;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_mode document_storage_mode NOT NULL DEFAULT 'managed_upload',
  ADD COLUMN IF NOT EXISTS external_source_url text,
  ADD COLUMN IF NOT EXISTS external_source_reference text,
  ADD COLUMN IF NOT EXISTS source_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS documents_storage_mode_idx ON documents (storage_mode);
CREATE INDEX IF NOT EXISTS documents_external_source_url_idx ON documents (external_source_url);

ALTER TABLE document_parsed_contents
  ADD COLUMN IF NOT EXISTS retention_mode text NOT NULL DEFAULT 'stored'
  CHECK (retention_mode IN ('stored', 'temporary'));
