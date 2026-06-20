CREATE INDEX IF NOT EXISTS document_chunks_content_fts_idx
ON document_chunks
USING gin (to_tsvector('simple', content));
