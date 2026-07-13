-- Sprint 3: Immutable document version history and structural comparison support.

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  name text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  mime_type text,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  checksum text NOT NULL,
  status document_status NOT NULL,
  storage_mode document_storage_mode NOT NULL,
  storage_path text,
  external_source_url text,
  external_source_reference text,
  source_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  parsed_file_path text,
  page_count integer,
  content_text text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS document_versions_document_version_idx
  ON document_versions (document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS document_versions_company_created_idx
  ON document_versions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_versions_folder_created_idx
  ON document_versions (folder_id, created_at DESC);

INSERT INTO document_versions (
  document_id,
  company_id,
  folder_id,
  version_number,
  name,
  original_filename,
  file_type,
  mime_type,
  file_size,
  checksum,
  status,
  storage_mode,
  storage_path,
  external_source_url,
  external_source_reference,
  source_metadata_json,
  created_by,
  created_at
)
SELECT
  documents.id,
  documents.company_id,
  documents.folder_id,
  documents.version,
  documents.name,
  documents.original_filename,
  documents.file_type,
  documents.mime_type,
  documents.file_size,
  documents.checksum,
  documents.status,
  documents.storage_mode,
  documents.storage_path,
  documents.external_source_url,
  documents.external_source_reference,
  documents.source_metadata_json,
  documents.uploaded_by,
  documents.created_at
FROM documents
WHERE documents.status <> 'deleted'
  AND NOT EXISTS (
    SELECT 1
    FROM document_versions
    WHERE document_versions.document_id = documents.id
      AND document_versions.version_number = documents.version
  );
