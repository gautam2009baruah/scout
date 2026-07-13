-- Sprint 7: Explainability & Knowledge Quality
-- This migration is intentionally non-destructive and establishes index support
-- for explainability/quality dashboard queries introduced in Sprint 7.

CREATE INDEX IF NOT EXISTS chat_query_telemetry_metadata_json_gin_idx
  ON chat_query_telemetry
  USING gin (metadata_json);

CREATE INDEX IF NOT EXISTS documents_company_storage_status_updated_idx
  ON documents (company_id, storage_mode, status, updated_at DESC)
  WHERE status <> 'deleted';
