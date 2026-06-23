ALTER TABLE chunk_embeddings
  ADD COLUMN IF NOT EXISTS embedding_provider text NOT NULL DEFAULT 'local_bge',
  ADD COLUMN IF NOT EXISTS embedding_dimension integer NOT NULL DEFAULT 384;

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT tc.constraint_name
    FROM information_schema.table_constraints tc
    WHERE tc.table_schema = 'public'
      AND tc.table_name = 'chunk_embeddings'
      AND tc.constraint_type = 'UNIQUE'
  LOOP
    EXECUTE format('ALTER TABLE chunk_embeddings DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS chunk_embeddings_chunk_provider_model_unique
  ON chunk_embeddings (chunk_id, embedding_provider, embedding_model);

CREATE TABLE IF NOT EXISTS ai_provider_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  embedding_provider text NOT NULL DEFAULT 'local_bge' CHECK (embedding_provider IN ('local_bge', 'openai', 'gemini', 'custom')),
  embedding_model text NOT NULL DEFAULT 'nomic-embed-text',
  embedding_dimension integer NOT NULL DEFAULT 768 CHECK (embedding_dimension > 0),
  embedding_endpoint text,
  embedding_api_key text,
  llm_provider text NOT NULL DEFAULT 'ollama' CHECK (llm_provider IN ('ollama', 'openai', 'gemini', 'anthropic', 'custom', 'mock')),
  llm_model text NOT NULL DEFAULT 'qwen3:0.6b',
  llm_endpoint text,
  llm_api_key text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_provider_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO modules (key, name, href, sort_order)
VALUES (5, 'AI Configuration', '/control-panel/ai-configuration', 50)
ON CONFLICT (key) DO UPDATE
SET name = EXCLUDED.name,
    href = EXCLUDED.href,
    sort_order = EXCLUDED.sort_order;
