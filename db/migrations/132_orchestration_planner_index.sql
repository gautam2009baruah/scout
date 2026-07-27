-- AI Planner (Step 3b): searchable index of existing saved orchestrations,
-- so a planner request can be matched against something that already does
-- the job before drafting a new one.

-- Deliberate, temporary safety gate (not a permissions system): until the
-- client's real access-management API replaces the Step 0 stub
-- (lib/chat/access-validator.ts), only orchestrations an admin has
-- explicitly opted in here are eligible to be auto-run for an unvalidated
-- external chatbot user. Defaults to false so nothing is matchable until an
-- admin reviews it.
ALTER TABLE orchestrations
  ADD COLUMN IF NOT EXISTS matchable_without_validation boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN orchestrations.matchable_without_validation IS
  'Admin-set opt-in gate for AI Planner auto-matching against unvalidated external_user_id requesters. Temporary safety control until real access validation exists (see lib/chat/access-validator.ts) — not a general permissions system.';

-- orchestration_embeddings mirrors chunk_embeddings' dual-mode (pgvector when
-- available, jsonb fallback otherwise) design, but as its own table rather
-- than reusing chunk_embeddings directly: chunk_embeddings hard-requires a
-- document_id/chunk_id (NOT NULL FKs), so it cannot represent an
-- orchestration row without schema changes to an already-heavily-used table.
-- A dedicated table is this project's equivalent of "a separate
-- collection/namespace" in a dedicated vector database.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') THEN
    EXECUTE '
      CREATE TABLE IF NOT EXISTS orchestration_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
        summary_text text NOT NULL,
        embedding vector NOT NULL,
        embedding_provider text NOT NULL,
        embedding_model text NOT NULL,
        embedding_dimension integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (orchestration_id, embedding_provider, embedding_model)
      )
    ';
  ELSE
    EXECUTE '
      CREATE TABLE IF NOT EXISTS orchestration_embeddings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        orchestration_id uuid NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
        summary_text text NOT NULL,
        embedding jsonb NOT NULL,
        embedding_provider text NOT NULL,
        embedding_model text NOT NULL,
        embedding_dimension integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (orchestration_id, embedding_provider, embedding_model)
      )
    ';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS orchestration_embeddings_company_id_idx ON orchestration_embeddings (company_id);
CREATE INDEX IF NOT EXISTS orchestration_embeddings_orchestration_id_idx ON orchestration_embeddings (orchestration_id);

COMMENT ON TABLE orchestration_embeddings IS
  'Vector index of saved orchestrations for AI Planner matching (findMatchingOrchestration). Parallel to chunk_embeddings, scoped to orchestrations instead of document chunks.';
