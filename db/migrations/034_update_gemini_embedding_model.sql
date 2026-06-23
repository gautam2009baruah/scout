UPDATE ai_provider_config
SET embedding_model = 'gemini-embedding-001',
    updated_at = now()
WHERE embedding_provider = 'gemini'
  AND embedding_model = 'text-embedding-004';

UPDATE ai_embedding_provider_configs
SET model = 'gemini-embedding-001',
    updated_at = now()
WHERE provider = 'gemini'
  AND model = 'text-embedding-004';
