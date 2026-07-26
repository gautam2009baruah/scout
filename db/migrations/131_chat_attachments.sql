-- Files uploaded by end users through the chat widget, to be read by the
-- file_parser orchestration node. Deliberately separate from documents/KB
-- storage: these are transient user uploads, never indexed for RAG search.
CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id UUID NULL REFERENCES company_target_applications(id) ON DELETE CASCADE,
  conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL,
  uploaded_by_user_id TEXT NULL,
  original_filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  mime_type TEXT NULL,
  file_size BIGINT NOT NULL,
  checksum TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_company
  ON chat_attachments(company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_chat_attachments_conversation
  ON chat_attachments(conversation_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION trg_chat_attachments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_attachments_set_updated_at ON chat_attachments;
CREATE TRIGGER chat_attachments_set_updated_at
BEFORE UPDATE ON chat_attachments
FOR EACH ROW
EXECUTE FUNCTION trg_chat_attachments_updated_at();

-- Fixed-window upload rate limiting, mirroring the pattern already used for
-- HTTP triggers (api_trigger_rate_limit_windows) but keyed by company+client
-- rather than a trigger id, since attachments aren't tied to a trigger row.
CREATE TABLE IF NOT EXISTS chat_attachment_rate_limit_windows (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  upload_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, client_key, window_start)
);
