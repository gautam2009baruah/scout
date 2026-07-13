-- Sprint 5: Visual document intelligence and searchable visual citations.

CREATE TABLE IF NOT EXISTS document_visual_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  page_number integer NOT NULL DEFAULT 1 CHECK (page_number > 0),
  asset_type text NOT NULL CHECK (asset_type IN (
    'table',
    'chart',
    'flow_diagram',
    'architecture_diagram',
    'screenshot',
    'organization_chart'
  )),
  label text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_visual_assets_document_version_idx
  ON document_visual_assets (document_id, version_number, page_number);

CREATE INDEX IF NOT EXISTS document_visual_assets_company_created_idx
  ON document_visual_assets (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_visual_assets_asset_type_idx
  ON document_visual_assets (asset_type, created_at DESC);

CREATE TABLE IF NOT EXISTS document_visual_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  asset_id uuid NOT NULL REFERENCES document_visual_assets(id) ON DELETE CASCADE,
  extracted_text text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.6,
  citation_preview text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_visual_insights_document_version_idx
  ON document_visual_insights (document_id, version_number, created_at DESC);

CREATE INDEX IF NOT EXISTS document_visual_insights_company_created_idx
  ON document_visual_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS document_visual_insights_asset_idx
  ON document_visual_insights (asset_id);

CREATE INDEX IF NOT EXISTS document_visual_insights_text_fts_idx
  ON document_visual_insights
  USING gin (to_tsvector('simple', extracted_text));
