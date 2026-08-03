-- Consolidates what were originally six incremental migrations (003-008)
-- into this single end state, since none of them had shipped beyond this
-- local dev database. Together they build out per-target-app and
-- per-environment scoping across AI Configuration, Email Credentials,
-- Triggers Monitoring, Chatbot Analytics, and Pending AI Plans, plus one
-- unrelated cleanup (removing the "strict environment enforcement" API key
-- feature) and a rename of the environments table to reflect its now much
-- broader use. Order matters below: several sections reference
-- chatbot_api_key_environments by its original name before the rename
-- section renames it to target_app_environments, and the final section
-- (originally 008) already uses the new name.

-- ============================================================================
-- 1) AI Configuration (LLM + Embeddings) target-app / environment scoping
--    (originally 003_ai_config_target_app_scoping.sql)
-- ============================================================================
--
-- AI Configuration (LLM + Embeddings) gains optional target-app and
-- environment scoping, mirroring the company-wide/target-app-wide pattern
-- already used by email_sender_credentials (uq_email_sender_primary_per_scope)
-- and chatbot_lifecycle_settings, extended one level deeper to environments.
--
-- A config row left with target_app_id = NULL applies to the whole company
-- (every target app, every environment). A row with target_app_id set but
-- environment_id = NULL applies to every environment of that target app.
-- environment_id may only be set alongside a target_app_id, since
-- environments always belong to exactly one target app.
--
-- "Primary" becomes scoped: one primary per (company_id, target_app_id,
-- environment_id) combo instead of one per company, so a company-wide
-- primary and a target-app-scoped primary can coexist.

ALTER TABLE public.ai_embedding_provider_configs
  ADD COLUMN target_app_id uuid REFERENCES public.company_target_applications(id) ON DELETE CASCADE,
  ADD COLUMN environment_id uuid REFERENCES public.chatbot_api_key_environments(id) ON DELETE CASCADE,
  ADD CONSTRAINT ai_embedding_provider_configs_environment_requires_target_app
    CHECK (environment_id IS NULL OR target_app_id IS NOT NULL);

ALTER TABLE public.ai_llm_provider_configs
  ADD COLUMN target_app_id uuid REFERENCES public.company_target_applications(id) ON DELETE CASCADE,
  ADD COLUMN environment_id uuid REFERENCES public.chatbot_api_key_environments(id) ON DELETE CASCADE,
  ADD CONSTRAINT ai_llm_provider_configs_environment_requires_target_app
    CHECK (environment_id IS NULL OR target_app_id IS NOT NULL);

DROP INDEX public.ai_embedding_provider_configs_company_provider_model_unique;
DROP INDEX public.ai_embedding_provider_configs_one_primary_per_company;
DROP INDEX public.ai_llm_provider_configs_company_provider_model_unique;
DROP INDEX public.ai_llm_provider_configs_one_primary_per_company;

CREATE UNIQUE INDEX ai_embedding_provider_configs_scope_provider_model_unique
  ON public.ai_embedding_provider_configs (
    company_id,
    COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(environment_id, '00000000-0000-0000-0000-000000000000'),
    provider,
    model
  )
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX ai_embedding_provider_configs_one_primary_per_scope
  ON public.ai_embedding_provider_configs (
    company_id,
    COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(environment_id, '00000000-0000-0000-0000-000000000000')
  )
  WHERE (is_primary = true AND deleted_at IS NULL);

CREATE UNIQUE INDEX ai_llm_provider_configs_scope_provider_model_unique
  ON public.ai_llm_provider_configs (
    company_id,
    COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(environment_id, '00000000-0000-0000-0000-000000000000'),
    provider,
    model
  )
  WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX ai_llm_provider_configs_one_primary_per_scope
  ON public.ai_llm_provider_configs (
    company_id,
    COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'),
    COALESCE(environment_id, '00000000-0000-0000-0000-000000000000')
  )
  WHERE (is_primary = true AND deleted_at IS NULL);

CREATE INDEX ai_embedding_provider_configs_target_app_idx
  ON public.ai_embedding_provider_configs (target_app_id)
  WHERE (deleted_at IS NULL);

CREATE INDEX ai_embedding_provider_configs_environment_idx
  ON public.ai_embedding_provider_configs (environment_id)
  WHERE (deleted_at IS NULL);

CREATE INDEX ai_llm_provider_configs_target_app_idx
  ON public.ai_llm_provider_configs (target_app_id)
  WHERE (deleted_at IS NULL);

CREATE INDEX ai_llm_provider_configs_environment_idx
  ON public.ai_llm_provider_configs (environment_id)
  WHERE (deleted_at IS NULL);

-- ============================================================================
-- 2) Remove per-key "strict environment enforcement"
--    (originally 004_remove_strict_environment_enforcement.sql)
-- ============================================================================
--
-- Removes the per-key "strict environment enforcement" feature. It required
-- callers to pass a matching environment identifier in the request itself,
-- which was only ever enforced by the standalone http-api/chatbot-api
-- service (never by the Next.js app's own lib/chat/api-key-access.ts path)
-- and duplicated what Allowed Origins now does more reliably: an API key is
-- already locked to exactly one environment's URL.

DROP INDEX public.idx_chatbot_api_keys_strict_environment_enforcement;

ALTER TABLE public.chatbot_api_keys
  DROP COLUMN strict_environment_enforcement;

-- ============================================================================
-- 3) Email credential <-> environment many-to-many
--    (originally 005_email_credential_environments.sql)
-- ============================================================================
--
-- Email credentials (both inbox/IMAP and outbound sender) gain a mandatory
-- many-to-many link to the environment(s) they apply to. Unlike
-- orchestration/guide/folder environment releases, this is not a
-- publish/promote workflow — it's a plain membership set saved directly with
-- the credential, fully replaced on every edit, so no released_at/by or
-- deleted_at/by columns are needed here.
--
-- Existing credentials start with zero linked environments. Runtime
-- resolution hard-fails for a credential with no linked environments (no
-- "matches any environment" fallback) — admins must re-save each existing
-- credential through the now-mandatory selector before it works again.

CREATE TABLE public.email_credential_environments (
  email_credential_id uuid NOT NULL REFERENCES public.email_credentials(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.chatbot_api_key_environments(id) ON DELETE CASCADE,
  PRIMARY KEY (email_credential_id, environment_id)
);

CREATE INDEX email_credential_environments_environment_idx
  ON public.email_credential_environments (environment_id);

CREATE TABLE public.email_sender_credential_environments (
  email_sender_credential_id uuid NOT NULL REFERENCES public.email_sender_credentials(id) ON DELETE CASCADE,
  environment_id uuid NOT NULL REFERENCES public.chatbot_api_key_environments(id) ON DELETE CASCADE,
  PRIMARY KEY (email_sender_credential_id, environment_id)
);

CREATE INDEX email_sender_credential_environments_environment_idx
  ON public.email_sender_credential_environments (environment_id);

-- ============================================================================
-- 4) Opt-in per-environment activity logging
--    (originally 006_environment_activity_logging.sql)
-- ============================================================================
--
-- Opt-in per-environment logging for Triggers Monitoring (chatbot-type
-- triggers only) and Chatbot Analytics. Defaults to false so newly created
-- environments don't immediately start accumulating monitoring/analytics
-- data — an admin must explicitly enable it per environment under
-- Manage Environments, next to "Is production".

ALTER TABLE public.chatbot_api_key_environments
  ADD COLUMN activity_logging_enabled boolean NOT NULL DEFAULT false;

-- Nullable: only chatbot-type trigger executions have a single, unambiguous
-- environment at write time (the calling API key's environment). Manual,
-- schedule, HTTP API, and email triggers leave this NULL — they have no
-- single-environment answer (an orchestration is commonly released to
-- several environments at once) and are out of scope for this feature.
ALTER TABLE public.trigger_execution_logs
  ADD COLUMN environment_id uuid REFERENCES public.chatbot_api_key_environments(id) ON DELETE SET NULL;

CREATE INDEX trigger_execution_logs_environment_idx
  ON public.trigger_execution_logs (environment_id);

ALTER TABLE public.chat_query_telemetry
  ADD COLUMN environment_id uuid REFERENCES public.chatbot_api_key_environments(id) ON DELETE SET NULL;

CREATE INDEX chat_query_telemetry_environment_idx
  ON public.chat_query_telemetry (environment_id);

-- ============================================================================
-- 5) Rename chatbot_api_key_environments -> target_app_environments
--    (originally 007_rename_environments_table.sql)
-- ============================================================================
--
-- The table has never been exclusively about chatbot API keys — it's the
-- general per-target-app environment list, now also referenced by AI
-- Configuration, Email Credentials, Triggers Monitoring, and Chatbot
-- Analytics — so the old name was misleading. Postgres preserves all foreign
-- keys, data, and row OIDs across a rename; only the table name itself
-- changes. Index/constraint names (e.g. chatbot_api_key_environments_pkey)
-- are left as-is — purely cosmetic and not worth the churn of renaming them
-- too. Every reference above this point uses the pre-rename name; every
-- reference below uses the new one.

ALTER TABLE public.chatbot_api_key_environments RENAME TO target_app_environments;

-- ============================================================================
-- 6) Pending AI plan requests gain environment_id
--    (originally 008_pending_plan_environment.sql)
-- ============================================================================
--
-- Pending AI plan requests gain a nullable environment_id, captured from the
-- chatbot API key that started the planning session
-- (app/api/chatbot/ai-planner/route.ts). Unlike Triggers Monitoring/Chatbot
-- Analytics, this is not gated by target_app_environments.activity_logging_enabled
-- — a pending plan is an actionable approval-queue item, not incidental
-- telemetry, so it's always recorded regardless of that opt-in toggle.
-- Existing rows stay NULL; there's no source to backfill an environment from
-- retroactively.

ALTER TABLE public.ai_planner_pending_requests
  ADD COLUMN environment_id uuid REFERENCES public.target_app_environments(id) ON DELETE SET NULL;

CREATE INDEX ai_planner_pending_requests_environment_idx
  ON public.ai_planner_pending_requests (environment_id);
