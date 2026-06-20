CREATE TABLE IF NOT EXISTS document_parsed_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  parsed_file_path text NOT NULL,
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS document_parsed_contents_company_id_idx
  ON document_parsed_contents (company_id);

CREATE TABLE IF NOT EXISTS document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  page_number integer NOT NULL CHECK (page_number > 0),
  character_count integer NOT NULL DEFAULT 0 CHECK (character_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS document_pages_company_id_idx ON document_pages (company_id);
CREATE INDEX IF NOT EXISTS document_pages_document_id_idx ON document_pages (document_id);
