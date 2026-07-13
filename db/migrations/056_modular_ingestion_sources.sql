ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_file_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_file_type_check CHECK (
  file_type IN ('pdf','docx','pptx','xlsx','csv','txt','md','html','json','xml','epub','png','jpg','jpeg','webp','tiff','zip')
);

CREATE TABLE IF NOT EXISTS ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('upload','web_url','crawler','sitemap','rss','google_drive','sharepoint')),
  name text NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference text,
  sync_cursor text,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('running','completed','partial','failed')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  cursor_before text,
  cursor_after text,
  discovered_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_json jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS ingestion_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('google_drive','sharepoint','web')),
  name text NOT NULL,
  auth_type text NOT NULL CHECK (auth_type IN ('oauth_client','service_account','access_token','api_key','basic','anonymous')),
  public_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, name)
);

ALTER TABLE ingestion_sources
  ADD CONSTRAINT ingestion_sources_secret_reference_fk
  FOREIGN KEY (secret_reference) REFERENCES ingestion_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ingestion_credentials_company_provider_idx ON ingestion_credentials(company_id, provider);

CREATE TABLE IF NOT EXISTS ingestion_source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  remote_id text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  remote_version text,
  content_checksum text,
  source_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at_source timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, remote_id)
);

CREATE INDEX IF NOT EXISTS ingestion_sources_folder_idx ON ingestion_sources(folder_id, enabled);
CREATE INDEX IF NOT EXISTS ingestion_sync_runs_source_idx ON ingestion_sync_runs(source_id, started_at DESC);
