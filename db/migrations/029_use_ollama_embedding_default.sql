UPDATE ai_provider_config
SET embedding_model = 'nomic-embed-text',
    embedding_dimension = 768,
    updated_at = now()
WHERE id = 1
  AND embedding_provider = 'local_bge'
  AND embedding_model IN ('BAAI/bge-small-en-v1.5', 'bge-small');

ALTER TABLE ai_provider_config
  ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text',
  ALTER COLUMN embedding_dimension SET DEFAULT 768;
