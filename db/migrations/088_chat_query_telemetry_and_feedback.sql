-- Sprint 1: Retrieval telemetry and user feedback for chatbot queries.

CREATE TABLE IF NOT EXISTS chat_query_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  answer_status text NOT NULL CHECK (answer_status IN ('answered', 'no_answer', 'failed')),
  no_answer_reason text,
  retrieved_chunk_count integer NOT NULL DEFAULT 0 CHECK (retrieved_chunk_count >= 0),
  citation_count integer NOT NULL DEFAULT 0 CHECK (citation_count >= 0),
  citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  llm_provider text,
  llm_model text,
  latency_ms integer NOT NULL DEFAULT 0 CHECK (latency_ms >= 0),
  prompt_tokens integer CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
  completion_tokens integer CHECK (completion_tokens IS NULL OR completion_tokens >= 0),
  total_tokens integer CHECK (total_tokens IS NULL OR total_tokens >= 0),
  estimated_cost_usd numeric(12, 6),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_query_telemetry_company_created_idx
  ON chat_query_telemetry (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_telemetry_company_target_created_idx
  ON chat_query_telemetry (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_telemetry_user_created_idx
  ON chat_query_telemetry (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_telemetry_status_created_idx
  ON chat_query_telemetry (answer_status, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_telemetry_conversation_idx
  ON chat_query_telemetry (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_query_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  query_id uuid NOT NULL REFERENCES chat_query_telemetry(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback text NOT NULL CHECK (feedback IN ('up', 'down')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (query_id, user_id)
);

CREATE INDEX IF NOT EXISTS chat_query_feedback_company_created_idx
  ON chat_query_feedback (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_feedback_company_target_created_idx
  ON chat_query_feedback (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chat_query_feedback_feedback_created_idx
  ON chat_query_feedback (feedback, created_at DESC);
