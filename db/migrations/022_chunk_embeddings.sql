DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE '
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
        chunk_id uuid NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
        embedding vector NOT NULL,
        embedding_model text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (chunk_id, embedding_model)
      )
    ';
  ELSE
    EXECUTE '
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
        chunk_id uuid NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
        embedding jsonb NOT NULL,
        embedding_model text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (chunk_id, embedding_model)
      )
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chunk_embeddings_company_id_idx ON chunk_embeddings (company_id);
CREATE INDEX IF NOT EXISTS chunk_embeddings_document_id_idx ON chunk_embeddings (document_id);
CREATE INDEX IF NOT EXISTS chunk_embeddings_chunk_id_idx ON chunk_embeddings (chunk_id);
