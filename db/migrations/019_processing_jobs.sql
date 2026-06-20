DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_job_type') THEN
    CREATE TYPE processing_job_type AS ENUM (
      'parse_document',
      'chunk_document',
      'embed_document',
      'index_document'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'processing_job_status') THEN
    CREATE TYPE processing_job_status AS ENUM (
      'pending',
      'running',
      'completed',
      'failed',
      'retrying'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  job_type processing_job_type NOT NULL,
  status processing_job_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS processing_jobs_company_id_idx ON processing_jobs (company_id);
CREATE INDEX IF NOT EXISTS processing_jobs_document_id_idx ON processing_jobs (document_id);
CREATE INDEX IF NOT EXISTS processing_jobs_status_created_at_idx ON processing_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS processing_jobs_job_type_idx ON processing_jobs (job_type);

CREATE UNIQUE INDEX IF NOT EXISTS processing_jobs_document_job_type_active_unique
  ON processing_jobs (document_id, job_type)
  WHERE status IN ('pending', 'running', 'retrying');
