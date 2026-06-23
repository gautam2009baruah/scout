UPDATE ai_provider_config
SET llm_model = 'qwen3:0.6b',
    updated_at = now()
WHERE id = 1
  AND llm_provider = 'ollama'
  AND llm_model = 'qwen3:4b';

ALTER TABLE ai_provider_config
  ALTER COLUMN llm_model SET DEFAULT 'qwen3:0.6b';
