DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status') THEN
    CREATE TYPE document_status AS ENUM (
      'uploaded',
      'queued',
      'processing',
      'parsed',
      'chunked',
      'embedded',
      'indexed',
      'failed',
      'deleted'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  name text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'csv', 'xlsx', 'pptx')),
  mime_type text,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  checksum text NOT NULL,
  storage_path text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status document_status NOT NULL DEFAULT 'uploaded',
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS documents_company_id_idx ON documents (company_id);
CREATE INDEX IF NOT EXISTS documents_folder_id_idx ON documents (folder_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents (status);
CREATE INDEX IF NOT EXISTS documents_file_type_idx ON documents (file_type);
CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS documents_company_checksum_active_unique
  ON documents (company_id, checksum)
  WHERE status <> 'deleted';
