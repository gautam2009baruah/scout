--
-- PostgreSQL database dump
--

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: document_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_status AS ENUM (
    'uploaded',
    'queued',
    'processing',
    'parsed',
    'chunked',
    'embedded',
    'indexed',
    'failed',
    'deleted'
);


--
-- Name: document_storage_mode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.document_storage_mode AS ENUM (
    'managed_upload',
    'external_reference',
    'strict_external_reference'
);


--
-- Name: processing_job_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.processing_job_status AS ENUM (
    'pending',
    'running',
    'completed',
    'failed',
    'retrying'
);


--
-- Name: processing_job_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.processing_job_type AS ENUM (
    'parse_document',
    'chunk_document',
    'embed_document',
    'index_document'
);


--
-- Name: trg_chat_attachments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_chat_attachments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: trg_chatbot_embed_packages_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_chatbot_embed_packages_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;


--
-- Name: update_email_credentials_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_email_credentials_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_email_sender_credentials_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_email_sender_credentials_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_webhook_triggers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_webhook_triggers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_embedding_provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_embedding_provider_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    dimension integer,
    endpoint text DEFAULT ''::text NOT NULL,
    api_key text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ai_embedding_provider_configs_dimension_check CHECK (((dimension IS NULL) OR (dimension > 0))),
    CONSTRAINT ai_embedding_provider_configs_provider_check CHECK ((provider = ANY (ARRAY['local_bge'::text, 'openai'::text, 'gemini'::text, 'custom'::text])))
);


--
-- Name: ai_llm_provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_llm_provider_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    model text DEFAULT ''::text NOT NULL,
    endpoint text DEFAULT ''::text NOT NULL,
    api_key text DEFAULT ''::text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT ai_llm_provider_configs_provider_check CHECK ((provider = ANY (ARRAY['ollama'::text, 'openai'::text, 'gemini'::text, 'anthropic'::text, 'custom'::text, 'mock'::text])))
);


--
-- Name: ai_planner_pending_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_planner_pending_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    external_user_id text NOT NULL,
    request_text text NOT NULL,
    draft_plan jsonb NOT NULL,
    plan_summary text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    resolved_by uuid,
    rejection_reason text,
    conversation_id uuid,
    draft_orchestration_id uuid,
    CONSTRAINT ai_planner_pending_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: ai_planner_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_planner_sessions (
    conversation_id uuid NOT NULL,
    target_app_id uuid NOT NULL,
    external_user_id text NOT NULL,
    state jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_trigger_rate_limit_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_trigger_rate_limit_windows (
    trigger_id uuid NOT NULL,
    client_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    request_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_trigger_request_nonces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_trigger_request_nonces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    nonce_hash text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: chat_attachment_rate_limit_windows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_attachment_rate_limit_windows (
    client_key text NOT NULL,
    window_start timestamp with time zone NOT NULL,
    upload_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_app_id uuid NOT NULL
);


--
-- Name: chat_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    conversation_id uuid,
    uploaded_by_user_id text,
    original_filename text NOT NULL,
    file_type text NOT NULL,
    mime_type text,
    file_size bigint NOT NULL,
    checksum text NOT NULL,
    storage_path text NOT NULL,
    status text DEFAULT 'uploaded'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chat_attachments_status_check CHECK ((status = ANY (ARRAY['uploaded'::text, 'failed'::text])))
);


--
-- Name: chat_query_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_query_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid,
    query_id uuid NOT NULL,
    external_user_id uuid NOT NULL,
    feedback text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_query_feedback_feedback_check CHECK ((feedback = ANY (ARRAY['up'::text, 'down'::text])))
);


--
-- Name: chat_query_telemetry; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_query_telemetry (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid,
    conversation_id uuid,
    question text NOT NULL,
    answer text NOT NULL,
    answer_status text NOT NULL,
    no_answer_reason text,
    retrieved_chunk_count integer DEFAULT 0 NOT NULL,
    citation_count integer DEFAULT 0 NOT NULL,
    citations_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    llm_provider text,
    llm_model text,
    latency_ms integer DEFAULT 0 NOT NULL,
    prompt_tokens integer,
    completion_tokens integer,
    total_tokens integer,
    estimated_cost_usd numeric(12,6),
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    external_user_id text,
    CONSTRAINT chat_query_telemetry_answer_status_check CHECK ((answer_status = ANY (ARRAY['answered'::text, 'no_answer'::text, 'failed'::text]))),
    CONSTRAINT chat_query_telemetry_citation_count_check CHECK ((citation_count >= 0)),
    CONSTRAINT chat_query_telemetry_completion_tokens_check CHECK (((completion_tokens IS NULL) OR (completion_tokens >= 0))),
    CONSTRAINT chat_query_telemetry_latency_ms_check CHECK ((latency_ms >= 0)),
    CONSTRAINT chat_query_telemetry_prompt_tokens_check CHECK (((prompt_tokens IS NULL) OR (prompt_tokens >= 0))),
    CONSTRAINT chat_query_telemetry_retrieved_chunk_count_check CHECK ((retrieved_chunk_count >= 0)),
    CONSTRAINT chat_query_telemetry_total_tokens_check CHECK (((total_tokens IS NULL) OR (total_tokens >= 0)))
);


--
-- Name: chatbot_action_mode_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_action_mode_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    external_user_id uuid NOT NULL,
    conversation_id uuid,
    event_type text NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_action_mode_events_event_type_check CHECK ((event_type = ANY (ARRAY['action_mode_invoked'::text, 'action_mode_auto_reset'::text])))
);


--
-- Name: chatbot_api_key_environments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_api_key_environments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    normalized_name text NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_app_id uuid NOT NULL
);


--
-- Name: chatbot_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    key_prefix text NOT NULL,
    key_hash text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    expires_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    allowed_origins_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    rotated_at timestamp with time zone,
    rotated_by uuid,
    suspended_at timestamp with time zone,
    suspended_by uuid,
    revoked_at timestamp with time zone,
    revoked_by uuid,
    last_used_at timestamp with time zone,
    updated_by uuid,
    target_app_id uuid NOT NULL,
    strict_environment_enforcement boolean DEFAULT false NOT NULL,
    environment_id uuid NOT NULL,
    CONSTRAINT chatbot_api_keys_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'revoked'::text])))
);


--
-- Name: chatbot_embed_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_embed_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    api_key_plaintext text NOT NULL,
    api_key_prefix character varying(32) NOT NULL,
    user_id_placeholder character varying(255) NOT NULL,
    scout_url text NOT NULL,
    api_url text NOT NULL,
    assistant_name character varying(255) NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    require_user_guid boolean DEFAULT false NOT NULL,
    environment_id uuid NOT NULL
);


--
-- Name: chatbot_intent_gate_decisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_intent_gate_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid,
    external_user_id uuid NOT NULL,
    conversation_id uuid,
    message text NOT NULL,
    prefilter_label text NOT NULL,
    prefilter_score numeric(5,4) DEFAULT 0 NOT NULL,
    ai_label text,
    ai_confidence numeric(5,4),
    final_label text NOT NULL,
    low_confidence boolean DEFAULT false NOT NULL,
    reason text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_intent_gate_decisions_ai_label_check CHECK ((ai_label = ANY (ARRAY['action'::text, 'chat'::text]))),
    CONSTRAINT chatbot_intent_gate_decisions_final_label_check CHECK ((final_label = ANY (ARRAY['action'::text, 'chat'::text]))),
    CONSTRAINT chatbot_intent_gate_decisions_prefilter_label_check CHECK ((prefilter_label = ANY (ARRAY['action'::text, 'chat'::text, 'uncertain'::text])))
);


--
-- Name: chatbot_intent_gate_feedback; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_intent_gate_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    decision_id uuid NOT NULL,
    target_app_id uuid,
    external_user_id uuid NOT NULL,
    feedback_type text NOT NULL,
    user_choice text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chatbot_intent_gate_feedback_feedback_type_check CHECK ((feedback_type = ANY (ARRAY['true_positive'::text, 'false_positive'::text, 'false_negative'::text, 'true_negative'::text, 'user_override_action'::text, 'user_override_chat'::text]))),
    CONSTRAINT chatbot_intent_gate_feedback_user_choice_check CHECK ((user_choice = ANY (ARRAY['action'::text, 'chat'::text, 'run_workflow'::text, 'continue_chat'::text])))
);


--
-- Name: chatbot_lifecycle_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_lifecycle_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    max_context_messages integer DEFAULT 20 NOT NULL,
    max_context_tokens integer DEFAULT 5000 NOT NULL,
    inactivity_timeout_seconds integer DEFAULT 1800 NOT NULL,
    reset_on_logout_event boolean DEFAULT true NOT NULL,
    reset_on_user_change boolean DEFAULT true NOT NULL,
    reset_on_target_app_change boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT chatbot_lifecycle_settings_inactivity_timeout_seconds_check CHECK (((inactivity_timeout_seconds >= 60) AND (inactivity_timeout_seconds <= 604800))),
    CONSTRAINT chatbot_lifecycle_settings_max_context_messages_check CHECK (((max_context_messages >= 10) AND (max_context_messages <= 30))),
    CONSTRAINT chatbot_lifecycle_settings_max_context_tokens_check CHECK (((max_context_tokens >= 3000) AND (max_context_tokens <= 8000)))
);


--
-- Name: chatbot_trigger_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_trigger_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    orchestration_id uuid NOT NULL,
    execution_id uuid,
    session_id text NOT NULL,
    user_message text NOT NULL,
    user_id text,
    channel text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    error_message text,
    CONSTRAINT chatbot_trigger_sessions_status_check CHECK ((status = ANY (ARRAY['triggered'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: chunk_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chunk_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    chunk_id uuid NOT NULL,
    embedding public.vector NOT NULL,
    embedding_model text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_provider text DEFAULT 'local_bge'::text NOT NULL,
    embedding_dimension integer DEFAULT 384 NOT NULL
);


--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    updated_by uuid,
    enforce_chatbot_key_environment boolean DEFAULT false NOT NULL,
    CONSTRAINT companies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'archived'::text])))
);


--
-- Name: company_target_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_target_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    base_url text DEFAULT ''::text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: conversation_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversation_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    conversation_id uuid NOT NULL,
    sender text NOT NULL,
    content text NOT NULL,
    citations_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT conversation_messages_sender_check CHECK ((sender = ANY (ARRAY['user'::text, 'assistant'::text, 'system'::text])))
);


--
-- Name: conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    message_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    external_user_id text,
    CONSTRAINT conversations_message_count_check CHECK ((message_count >= 0)),
    CONSTRAINT conversations_status_check CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text, 'deleted'::text])))
);


--
-- Name: document_chunks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    content text NOT NULL,
    page_number integer NOT NULL,
    section_title text,
    token_count integer DEFAULT 0 NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_chunks_chunk_index_check CHECK ((chunk_index >= 0)),
    CONSTRAINT document_chunks_page_number_check CHECK ((page_number > 0)),
    CONSTRAINT document_chunks_token_count_check CHECK ((token_count >= 0))
);


--
-- Name: document_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    page_number integer NOT NULL,
    character_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_pages_character_count_check CHECK ((character_count >= 0)),
    CONSTRAINT document_pages_page_number_check CHECK ((page_number > 0))
);


--
-- Name: document_parsed_contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_parsed_contents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    parsed_file_path text NOT NULL,
    page_count integer DEFAULT 0 NOT NULL,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    retention_mode text DEFAULT 'stored'::text NOT NULL,
    CONSTRAINT document_parsed_contents_page_count_check CHECK ((page_count >= 0)),
    CONSTRAINT document_parsed_contents_retention_mode_check CHECK ((retention_mode = ANY (ARRAY['stored'::text, 'temporary'::text])))
);


--
-- Name: document_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: document_user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    version_number integer NOT NULL,
    name text NOT NULL,
    original_filename text NOT NULL,
    file_type text NOT NULL,
    mime_type text,
    file_size bigint NOT NULL,
    checksum text NOT NULL,
    status public.document_status NOT NULL,
    storage_mode public.document_storage_mode NOT NULL,
    storage_path text,
    external_source_url text,
    external_source_reference text,
    source_metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    parsed_file_path text,
    page_count integer,
    content_text text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_versions_file_size_check CHECK ((file_size >= 0)),
    CONSTRAINT document_versions_version_number_check CHECK ((version_number > 0))
);


--
-- Name: document_visual_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_visual_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    version_number integer NOT NULL,
    page_number integer DEFAULT 1 NOT NULL,
    asset_type text NOT NULL,
    label text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_visual_assets_asset_type_check CHECK ((asset_type = ANY (ARRAY['table'::text, 'chart'::text, 'flow_diagram'::text, 'architecture_diagram'::text, 'screenshot'::text, 'organization_chart'::text]))),
    CONSTRAINT document_visual_assets_page_number_check CHECK ((page_number > 0)),
    CONSTRAINT document_visual_assets_version_number_check CHECK ((version_number > 0))
);


--
-- Name: document_visual_insights; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_visual_insights (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    version_number integer NOT NULL,
    asset_id uuid NOT NULL,
    extracted_text text NOT NULL,
    confidence numeric(4,3) DEFAULT 0.6 NOT NULL,
    citation_preview text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT document_visual_insights_version_number_check CHECK ((version_number > 0))
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    name text NOT NULL,
    original_filename text NOT NULL,
    file_type text NOT NULL,
    mime_type text,
    file_size bigint NOT NULL,
    checksum text NOT NULL,
    storage_path text,
    version integer DEFAULT 1 NOT NULL,
    status public.document_status DEFAULT 'uploaded'::public.document_status NOT NULL,
    uploaded_by uuid NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    storage_mode public.document_storage_mode DEFAULT 'managed_upload'::public.document_storage_mode NOT NULL,
    external_source_url text,
    external_source_reference text,
    source_metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    source_guide_id uuid,
    is_stale boolean DEFAULT false NOT NULL,
    CONSTRAINT documents_file_size_check CHECK ((file_size >= 0)),
    CONSTRAINT documents_file_type_check CHECK ((file_type = ANY (ARRAY['pdf'::text, 'docx'::text, 'pptx'::text, 'xlsx'::text, 'csv'::text, 'txt'::text, 'md'::text, 'html'::text, 'json'::text, 'xml'::text, 'epub'::text, 'png'::text, 'jpg'::text, 'jpeg'::text, 'webp'::text, 'tiff'::text, 'zip'::text]))),
    CONSTRAINT documents_version_check CHECK ((version > 0))
);


--
-- Name: email_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text NOT NULL,
    name text NOT NULL,
    email_address text NOT NULL,
    imap_host text,
    imap_port integer DEFAULT 993,
    imap_password text,
    imap_tls boolean DEFAULT true,
    oauth_access_token text,
    oauth_refresh_token text,
    oauth_token_expires_at timestamp with time zone,
    oauth_scope text,
    is_active boolean DEFAULT true,
    last_tested_at timestamp with time zone,
    last_test_status text,
    last_test_error text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    updated_by uuid,
    description text,
    last_used_at timestamp with time zone,
    last_error text,
    target_app_id uuid,
    CONSTRAINT email_credentials_provider_check CHECK ((provider = ANY (ARRAY['imap'::text, 'gmail'::text, 'outlook'::text])))
);


--
-- Name: email_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_outbox (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient text NOT NULL,
    subject text NOT NULL,
    body text NOT NULL,
    status text DEFAULT 'queued'::text NOT NULL,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT email_outbox_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text])))
);


--
-- Name: email_sender_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sender_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    target_app_id uuid,
    provider text DEFAULT 'smtp'::text NOT NULL,
    name text NOT NULL,
    description text,
    from_name text,
    from_email text NOT NULL,
    smtp_host text,
    smtp_port integer DEFAULT 587,
    smtp_secure boolean DEFAULT false,
    smtp_username text,
    smtp_password text,
    oauth_access_token text,
    oauth_refresh_token text,
    oauth_token_expires_at timestamp with time zone,
    oauth_scope text,
    is_active boolean DEFAULT true NOT NULL,
    is_primary boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    CONSTRAINT email_sender_credentials_provider_check CHECK ((provider = ANY (ARRAY['smtp'::text, 'gmail'::text, 'outlook'::text])))
);


--
-- Name: email_trigger_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_trigger_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    orchestration_id uuid NOT NULL,
    execution_id uuid,
    message_id text NOT NULL,
    provider text NOT NULL,
    mailbox text NOT NULL,
    from_address text NOT NULL,
    to_address text NOT NULL,
    subject text NOT NULL,
    body_text text,
    body_html text,
    attachments jsonb DEFAULT '[]'::jsonb,
    received_at timestamp with time zone NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    status text NOT NULL,
    error_message text,
    CONSTRAINT email_trigger_messages_provider_check CHECK ((provider = ANY (ARRAY['gmail'::text, 'outlook'::text, 'imap'::text]))),
    CONSTRAINT email_trigger_messages_status_check CHECK ((status = ANY (ARRAY['received'::text, 'processed'::text, 'failed'::text])))
);


--
-- Name: employee_activation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_activation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: folder_document_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_document_role_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: folder_document_user_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_document_user_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: folder_target_apps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folder_target_apps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    folder_id uuid NOT NULL,
    target_app_id uuid NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid,
    parent_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    role_access_all boolean DEFAULT true NOT NULL,
    user_access_all boolean DEFAULT true NOT NULL,
    CONSTRAINT topics_no_self_parent CHECK ((id <> parent_id))
);


--
-- Name: guided_workflow_guides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_guides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    recorded_actions_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    steps_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_by uuid,
    updated_by uuid,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    target_app_id uuid,
    topic_id uuid,
    pre_workflow_confirmation_html text DEFAULT ''::text NOT NULL,
    pre_workflow_confirmation_enabled boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    parent_version_id uuid,
    version_notes text,
    CONSTRAINT guided_workflow_guides_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text])))
);


--
-- Name: guided_workflow_healing_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_healing_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    step_id text NOT NULL,
    event_type text NOT NULL,
    healing_source text,
    confidence_score numeric(5,2),
    attempted_selector_candidates jsonb,
    success boolean,
    error_message text,
    page_url text NOT NULL,
    user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT guided_workflow_healing_audit_event_type_check CHECK ((event_type = ANY (ARRAY['attempt'::text, 'success'::text, 'failure'::text, 'approved'::text, 'rejected'::text, 'manual_edit'::text, 'deleted'::text]))),
    CONSTRAINT guided_workflow_healing_audit_healing_source_check CHECK ((healing_source = ANY (ARRAY['rule-based'::text, 'ai-assisted'::text, 'manual'::text])))
);


--
-- Name: guided_workflow_healing_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_healing_suggestions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workflow_id uuid NOT NULL,
    step_id text NOT NULL,
    step_order integer NOT NULL,
    original_selector_candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    original_element_identity jsonb,
    proposed_selector_candidates jsonb DEFAULT '[]'::jsonb NOT NULL,
    proposed_element_identity jsonb,
    confidence_score numeric(5,2) NOT NULL,
    healing_source text NOT NULL,
    healing_reason text NOT NULL,
    ai_provider text,
    ai_model text,
    page_url text NOT NULL,
    page_title text,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    playback_attempt_count integer DEFAULT 1 NOT NULL,
    last_playback_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    CONSTRAINT guided_workflow_healing_suggestions_confidence_score_check CHECK (((confidence_score >= (0)::numeric) AND (confidence_score <= (100)::numeric))),
    CONSTRAINT guided_workflow_healing_suggestions_healing_source_check CHECK ((healing_source = ANY (ARRAY['rule-based'::text, 'ai-assisted'::text]))),
    CONSTRAINT guided_workflow_healing_suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: guided_workflow_recorded_actions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_recorded_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recording_session_id uuid NOT NULL,
    action_index integer NOT NULL,
    action_json jsonb NOT NULL,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    topic_id uuid NOT NULL,
    CONSTRAINT guided_workflow_recorded_actions_action_index_check CHECK ((action_index >= 0))
);


--
-- Name: guided_workflow_recording_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_recording_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    company_target_application_id uuid,
    deleted_at timestamp with time zone
);


--
-- Name: guided_workflow_revoked_recorder_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_revoked_recorder_tokens (
    token_hash text NOT NULL,
    topic_id uuid,
    revoked_reason text DEFAULT 'Recording was halted by an administrator.'::text NOT NULL,
    revoked_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_by uuid
);


--
-- Name: guided_workflow_topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.guided_workflow_topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recording_session_id uuid NOT NULL,
    guide_id uuid,
    title text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    recorder_token_hash text NOT NULL,
    recorder_config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    actions_count integer DEFAULT 0 NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    analytics_logging_enabled boolean DEFAULT true NOT NULL,
    deleted_at timestamp with time zone,
    recording_enabled boolean DEFAULT true NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    CONSTRAINT guided_workflow_topics_actions_count_check CHECK ((actions_count >= 0)),
    CONSTRAINT guided_workflow_topics_sort_order_check CHECK ((sort_order >= 0))
);


--
-- Name: ingestion_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_credentials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    provider text NOT NULL,
    name text NOT NULL,
    auth_type text NOT NULL,
    public_config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    secret_ciphertext text,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingestion_credentials_auth_type_check CHECK ((auth_type = ANY (ARRAY['oauth_client'::text, 'service_account'::text, 'access_token'::text, 'api_key'::text, 'basic'::text, 'anonymous'::text]))),
    CONSTRAINT ingestion_credentials_provider_check CHECK ((provider = ANY (ARRAY['google_drive'::text, 'sharepoint'::text, 'web'::text])))
);


--
-- Name: ingestion_source_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_source_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    remote_id text NOT NULL,
    document_id uuid,
    remote_version text,
    content_checksum text,
    source_url text,
    metadata_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_at_source timestamp with time zone,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ingestion_sources; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    folder_id uuid NOT NULL,
    source_type text NOT NULL,
    name text NOT NULL,
    config_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    secret_reference uuid,
    sync_cursor text,
    last_synced_at timestamp with time zone,
    last_sync_status text,
    enabled boolean DEFAULT true NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ingestion_sources_last_sync_status_check CHECK ((last_sync_status = ANY (ARRAY['running'::text, 'completed'::text, 'partial'::text, 'failed'::text]))),
    CONSTRAINT ingestion_sources_source_type_check CHECK ((source_type = ANY (ARRAY['upload'::text, 'web_url'::text, 'crawler'::text, 'sitemap'::text, 'rss'::text, 'google_drive'::text, 'sharepoint'::text])))
);


--
-- Name: ingestion_sync_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ingestion_sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id uuid NOT NULL,
    status text NOT NULL,
    cursor_before text,
    cursor_after text,
    discovered_count integer DEFAULT 0 NOT NULL,
    processed_count integer DEFAULT 0 NOT NULL,
    skipped_count integer DEFAULT 0 NOT NULL,
    failed_count integer DEFAULT 0 NOT NULL,
    error_json jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    CONSTRAINT ingestion_sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'partial'::text, 'failed'::text])))
);


--
-- Name: internal_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.internal_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title character varying(500) NOT NULL,
    message text NOT NULL,
    read boolean DEFAULT false NOT NULL,
    type character varying(50) DEFAULT 'orchestration'::character varying NOT NULL,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    notification_type character varying(50) DEFAULT 'information'::character varying,
    action_label character varying(255),
    action_url text,
    expires_at timestamp with time zone,
    persistent_until_read boolean DEFAULT false
);


--
-- Name: modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.modules (
    key integer NOT NULL,
    name text NOT NULL,
    href text NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    parent_key integer
);


--
-- Name: orchestration_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execution_id uuid NOT NULL,
    node_execution_id uuid NOT NULL,
    approver_email text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    request_data jsonb,
    response_data jsonb,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    responded_at timestamp with time zone,
    notes text,
    responded_by uuid
);


--
-- Name: orchestration_clarifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_clarifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execution_id uuid NOT NULL,
    node_execution_id uuid NOT NULL,
    node_id uuid NOT NULL,
    conversation_id uuid,
    target_app_id uuid,
    output_variable text NOT NULL,
    partial_output_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    missing_fields_json jsonb DEFAULT '[]'::jsonb NOT NULL,
    prompt text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    response_text text,
    response_json jsonb,
    CONSTRAINT orchestration_clarifications_status_check CHECK ((status = ANY (ARRAY['active'::text, 'resolved'::text, 'expired'::text])))
);


--
-- Name: orchestration_connections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_connections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orchestration_id uuid NOT NULL,
    source_node_id uuid NOT NULL,
    target_node_id uuid NOT NULL,
    source_handle text,
    target_handle text,
    condition jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orchestration_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_embeddings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    orchestration_id uuid NOT NULL,
    summary_text text NOT NULL,
    embedding public.vector NOT NULL,
    embedding_provider text NOT NULL,
    embedding_model text NOT NULL,
    embedding_dimension integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: orchestration_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orchestration_id uuid NOT NULL,
    orchestration_version integer NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    context jsonb DEFAULT '{}'::jsonb NOT NULL,
    trigger_data jsonb,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    error_message text,
    current_node_id uuid,
    triggered_by text
);


--
-- Name: orchestration_node_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_node_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    execution_id uuid NOT NULL,
    node_id uuid NOT NULL,
    node_type text NOT NULL,
    node_label text NOT NULL,
    status text NOT NULL,
    input jsonb,
    output jsonb,
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    duration_ms integer,
    retry_count integer DEFAULT 0 NOT NULL
);


--
-- Name: orchestration_nodes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_nodes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orchestration_id uuid NOT NULL,
    node_type text NOT NULL,
    label text NOT NULL,
    position_x integer NOT NULL,
    position_y integer NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    display_description text
);


--
-- Name: orchestration_triggers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_triggers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orchestration_id uuid NOT NULL,
    trigger_type text DEFAULT 'manual'::text NOT NULL,
    name text NOT NULL,
    description text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    last_triggered_at timestamp with time zone,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    last_polled_at timestamp with time zone,
    created_by uuid,
    updated_by uuid,
    endpoint_slug text,
    CONSTRAINT orchestration_triggers_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text, 'error'::text, 'suspended'::text, 'revoked'::text]))),
    CONSTRAINT orchestration_triggers_trigger_type_check CHECK ((trigger_type = ANY (ARRAY['manual'::text, 'chatbot'::text, 'email'::text, 'schedule'::text, 'http_api'::text])))
);


--
-- Name: orchestration_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestration_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    orchestration_id uuid NOT NULL,
    version integer NOT NULL,
    snapshot jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    change_notes text,
    created_by uuid
);


--
-- Name: orchestrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orchestrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    variables jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    published_at timestamp with time zone,
    target_app_id uuid,
    created_by uuid,
    updated_by uuid,
    published_by uuid,
    matchable_without_validation boolean DEFAULT false NOT NULL,
    originating_external_user_id text,
    ai_planner_drafting_trigger_type text,
    CONSTRAINT orchestrations_ai_planner_drafting_trigger_type_check CHECK ((ai_planner_drafting_trigger_type = ANY (ARRAY['manual'::text, 'chatbot'::text, 'schedule'::text, 'email'::text, 'http_api'::text])))
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: processing_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processing_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_id uuid NOT NULL,
    job_type public.processing_job_type NOT NULL,
    status public.processing_job_status DEFAULT 'pending'::public.processing_job_status NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    max_attempts integer DEFAULT 3 NOT NULL,
    error_message text,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT processing_jobs_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT processing_jobs_max_attempts_check CHECK ((max_attempts > 0))
);


--
-- Name: role_module_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_module_permissions (
    role_id uuid NOT NULL,
    module_key integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: role_topic_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_topic_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    is_system boolean DEFAULT false NOT NULL,
    is_admin_role boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    deleted_at timestamp with time zone,
    updated_by uuid,
    company_id uuid NOT NULL
);


--
-- Name: schedule_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedule_executions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    orchestration_id uuid NOT NULL,
    execution_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    actual_started_at timestamp with time zone NOT NULL,
    status text NOT NULL,
    timezone text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schedule_executions_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: step_executions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.step_executions (
    id uuid NOT NULL,
    workflow_execution_id uuid NOT NULL,
    company_id uuid NOT NULL,
    workflow_id uuid NOT NULL,
    workflow_version_id uuid,
    step_id text NOT NULL,
    step_order integer,
    action_type text,
    status text DEFAULT 'started'::text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    error_message text,
    healing_used boolean DEFAULT false NOT NULL,
    ai_used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id text,
    CONSTRAINT step_executions_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text, 'abandoned'::text])))
);


--
-- Name: target_app_database_schemas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.target_app_database_schemas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_app_id uuid NOT NULL,
    database_name text NOT NULL,
    database_type text NOT NULL,
    version integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    schema_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    deactivated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    deleted_at timestamp with time zone,
    database_description text
);


--
-- Name: trigger_execution_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.trigger_execution_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    trigger_id uuid NOT NULL,
    orchestration_id uuid NOT NULL,
    execution_id uuid,
    status text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    error_message text,
    triggered_at timestamp with time zone DEFAULT now() NOT NULL,
    triggered_by text,
    CONSTRAINT trigger_execution_logs_status_check CHECK ((status = ANY (ARRAY['received'::text, 'validated'::text, 'started'::text, 'failed'::text])))
);


--
-- Name: user_company_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_company_roles (
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    role_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    is_primary boolean DEFAULT false,
    status text DEFAULT 'active'::text NOT NULL,
    CONSTRAINT user_company_roles_status_check CHECK ((status = ANY (ARRAY['active'::text, 'inactive'::text])))
);


--
-- Name: user_lifecycle_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_lifecycle_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid,
    action text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    reason text NOT NULL,
    performed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_lifecycle_events_action_check CHECK ((action = ANY (ARRAY['inactivated'::text, 'deleted'::text]))),
    CONSTRAINT user_lifecycle_events_reason_check CHECK ((length(TRIM(BOTH FROM reason)) > 0))
);


--
-- Name: user_module_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_module_permissions (
    user_id uuid NOT NULL,
    module_key integer NOT NULL,
    effect text NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    company_id uuid NOT NULL,
    CONSTRAINT user_module_permissions_effect_check CHECK ((effect = ANY (ARRAY['allow'::text, 'deny'::text])))
);


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    company_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: user_target_app_access; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_target_app_access (
    user_id uuid NOT NULL,
    target_app_id uuid NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_by uuid,
    deleted_at timestamp with time zone
);


--
-- Name: user_topic_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_topic_permissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    created_by uuid,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text,
    status text DEFAULT 'active'::text NOT NULL,
    last_login_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    employee_code text,
    phone text,
    can_view_chatbot boolean DEFAULT false NOT NULL,
    activated_at timestamp with time zone,
    invited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    updated_by uuid,
    must_change_password boolean DEFAULT false NOT NULL,
    CONSTRAINT users_status_check CHECK ((status = ANY (ARRAY['active'::text, 'invited'::text, 'deleted'::text])))
);


--
-- Name: ai_embedding_provider_configs ai_embedding_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embedding_provider_configs
    ADD CONSTRAINT ai_embedding_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_llm_provider_configs ai_llm_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_llm_provider_configs
    ADD CONSTRAINT ai_llm_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_planner_pending_requests ai_planner_pending_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_pending_requests
    ADD CONSTRAINT ai_planner_pending_requests_pkey PRIMARY KEY (id);


--
-- Name: ai_planner_sessions ai_planner_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_sessions
    ADD CONSTRAINT ai_planner_sessions_pkey PRIMARY KEY (conversation_id);


--
-- Name: api_trigger_rate_limit_windows api_trigger_rate_limit_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_trigger_rate_limit_windows
    ADD CONSTRAINT api_trigger_rate_limit_windows_pkey PRIMARY KEY (trigger_id, client_key, window_start);


--
-- Name: api_trigger_request_nonces api_trigger_request_nonces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_trigger_request_nonces
    ADD CONSTRAINT api_trigger_request_nonces_pkey PRIMARY KEY (id);


--
-- Name: api_trigger_request_nonces api_trigger_request_nonces_trigger_id_nonce_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_trigger_request_nonces
    ADD CONSTRAINT api_trigger_request_nonces_trigger_id_nonce_hash_key UNIQUE (trigger_id, nonce_hash);


--
-- Name: chat_attachment_rate_limit_windows chat_attachment_rate_limit_windows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachment_rate_limit_windows
    ADD CONSTRAINT chat_attachment_rate_limit_windows_pkey PRIMARY KEY (target_app_id, client_key, window_start);


--
-- Name: chat_attachments chat_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_pkey PRIMARY KEY (id);


--
-- Name: chat_query_feedback chat_query_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_feedback
    ADD CONSTRAINT chat_query_feedback_pkey PRIMARY KEY (id);


--
-- Name: chat_query_feedback chat_query_feedback_query_id_external_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_feedback
    ADD CONSTRAINT chat_query_feedback_query_id_external_user_id_key UNIQUE (query_id, external_user_id);


--
-- Name: chat_query_telemetry chat_query_telemetry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_telemetry
    ADD CONSTRAINT chat_query_telemetry_pkey PRIMARY KEY (id);


--
-- Name: chatbot_action_mode_events chatbot_action_mode_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_action_mode_events
    ADD CONSTRAINT chatbot_action_mode_events_pkey PRIMARY KEY (id);


--
-- Name: chatbot_api_key_environments chatbot_api_key_environments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_key_environments
    ADD CONSTRAINT chatbot_api_key_environments_pkey PRIMARY KEY (id);


--
-- Name: chatbot_api_key_environments chatbot_api_key_environments_target_app_id_normalized_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_key_environments
    ADD CONSTRAINT chatbot_api_key_environments_target_app_id_normalized_name_key UNIQUE (target_app_id, normalized_name);


--
-- Name: chatbot_api_keys chatbot_api_keys_key_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_key_hash_key UNIQUE (key_hash);


--
-- Name: chatbot_api_keys chatbot_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_pkey PRIMARY KEY (id);


--
-- Name: chatbot_embed_packages chatbot_embed_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_embed_packages
    ADD CONSTRAINT chatbot_embed_packages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_intent_gate_decisions chatbot_intent_gate_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_decisions
    ADD CONSTRAINT chatbot_intent_gate_decisions_pkey PRIMARY KEY (id);


--
-- Name: chatbot_intent_gate_feedback chatbot_intent_gate_feedback_decision_id_external_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_feedback
    ADD CONSTRAINT chatbot_intent_gate_feedback_decision_id_external_user_id_key UNIQUE (decision_id, external_user_id);


--
-- Name: chatbot_intent_gate_feedback chatbot_intent_gate_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_feedback
    ADD CONSTRAINT chatbot_intent_gate_feedback_pkey PRIMARY KEY (id);


--
-- Name: chatbot_lifecycle_settings chatbot_lifecycle_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_lifecycle_settings
    ADD CONSTRAINT chatbot_lifecycle_settings_pkey PRIMARY KEY (id);


--
-- Name: chatbot_trigger_sessions chatbot_trigger_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_trigger_sessions
    ADD CONSTRAINT chatbot_trigger_sessions_pkey PRIMARY KEY (id);


--
-- Name: chunk_embeddings chunk_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunk_embeddings
    ADD CONSTRAINT chunk_embeddings_pkey PRIMARY KEY (id);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: companies companies_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_slug_key UNIQUE (slug);


--
-- Name: company_target_applications company_target_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_target_applications
    ADD CONSTRAINT company_target_applications_pkey PRIMARY KEY (id);


--
-- Name: conversation_messages conversation_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_pkey PRIMARY KEY (id);


--
-- Name: conversations conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);


--
-- Name: document_chunks document_chunks_document_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_chunk_index_key UNIQUE (document_id, chunk_index);


--
-- Name: document_chunks document_chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_pkey PRIMARY KEY (id);


--
-- Name: document_pages document_pages_document_id_page_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_pages
    ADD CONSTRAINT document_pages_document_id_page_number_key UNIQUE (document_id, page_number);


--
-- Name: document_pages document_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_pages
    ADD CONSTRAINT document_pages_pkey PRIMARY KEY (id);


--
-- Name: document_parsed_contents document_parsed_contents_document_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parsed_contents
    ADD CONSTRAINT document_parsed_contents_document_id_key UNIQUE (document_id);


--
-- Name: document_parsed_contents document_parsed_contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parsed_contents
    ADD CONSTRAINT document_parsed_contents_pkey PRIMARY KEY (id);


--
-- Name: document_role_permissions document_role_permissions_document_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_document_id_role_id_key UNIQUE (document_id, role_id);


--
-- Name: document_role_permissions document_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: document_user_permissions document_user_permissions_document_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_document_id_user_id_key UNIQUE (document_id, user_id);


--
-- Name: document_user_permissions document_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: document_versions document_versions_document_id_version_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_version_number_key UNIQUE (document_id, version_number);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: document_visual_assets document_visual_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_assets
    ADD CONSTRAINT document_visual_assets_pkey PRIMARY KEY (id);


--
-- Name: document_visual_insights document_visual_insights_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_insights
    ADD CONSTRAINT document_visual_insights_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: email_credentials email_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_credentials
    ADD CONSTRAINT email_credentials_pkey PRIMARY KEY (id);


--
-- Name: email_outbox email_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_outbox
    ADD CONSTRAINT email_outbox_pkey PRIMARY KEY (id);


--
-- Name: email_sender_credentials email_sender_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sender_credentials
    ADD CONSTRAINT email_sender_credentials_pkey PRIMARY KEY (id);


--
-- Name: email_trigger_messages email_trigger_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_trigger_messages
    ADD CONSTRAINT email_trigger_messages_pkey PRIMARY KEY (id);


--
-- Name: email_trigger_messages email_trigger_messages_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_trigger_messages
    ADD CONSTRAINT email_trigger_messages_unique UNIQUE (trigger_id, message_id);


--
-- Name: employee_activation_tokens employee_activation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_activation_tokens
    ADD CONSTRAINT employee_activation_tokens_pkey PRIMARY KEY (id);


--
-- Name: employee_activation_tokens employee_activation_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_activation_tokens
    ADD CONSTRAINT employee_activation_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: folder_document_role_permissions folder_document_role_permissions_folder_id_role_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_folder_id_role_id_key UNIQUE (folder_id, role_id);


--
-- Name: folder_document_role_permissions folder_document_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_pkey PRIMARY KEY (id);


--
-- Name: folder_document_user_permissions folder_document_user_permissions_folder_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_folder_id_user_id_key UNIQUE (folder_id, user_id);


--
-- Name: folder_document_user_permissions folder_document_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: folder_target_apps folder_target_apps_folder_id_target_app_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_folder_id_target_app_id_key UNIQUE (folder_id, target_app_id);


--
-- Name: folder_target_apps folder_target_apps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_guides guided_workflow_guides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_healing_audit guided_workflow_healing_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_audit
    ADD CONSTRAINT guided_workflow_healing_audit_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_healing_suggestions guided_workflow_healing_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_suggestions
    ADD CONSTRAINT guided_workflow_healing_suggestions_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_recorded_actions guided_workflow_recorded_actions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recorded_actions
    ADD CONSTRAINT guided_workflow_recorded_actions_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_recording_sessions guided_workflow_recording_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recording_sessions
    ADD CONSTRAINT guided_workflow_recording_sessions_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_revoked_recorder_tokens guided_workflow_revoked_recorder_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_revoked_recorder_tokens
    ADD CONSTRAINT guided_workflow_revoked_recorder_tokens_pkey PRIMARY KEY (token_hash);


--
-- Name: guided_workflow_topics guided_workflow_topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_pkey PRIMARY KEY (id);


--
-- Name: guided_workflow_topics guided_workflow_topics_recorder_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_recorder_token_hash_key UNIQUE (recorder_token_hash);


--
-- Name: ingestion_credentials ingestion_credentials_company_id_provider_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_credentials
    ADD CONSTRAINT ingestion_credentials_company_id_provider_name_key UNIQUE (company_id, provider, name);


--
-- Name: ingestion_credentials ingestion_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_credentials
    ADD CONSTRAINT ingestion_credentials_pkey PRIMARY KEY (id);


--
-- Name: ingestion_source_items ingestion_source_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_source_items
    ADD CONSTRAINT ingestion_source_items_pkey PRIMARY KEY (id);


--
-- Name: ingestion_source_items ingestion_source_items_source_id_remote_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_source_items
    ADD CONSTRAINT ingestion_source_items_source_id_remote_id_key UNIQUE (source_id, remote_id);


--
-- Name: ingestion_sources ingestion_sources_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sources
    ADD CONSTRAINT ingestion_sources_pkey PRIMARY KEY (id);


--
-- Name: ingestion_sync_runs ingestion_sync_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sync_runs
    ADD CONSTRAINT ingestion_sync_runs_pkey PRIMARY KEY (id);


--
-- Name: internal_notifications internal_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notifications
    ADD CONSTRAINT internal_notifications_pkey PRIMARY KEY (id);


--
-- Name: modules modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_pkey PRIMARY KEY (key);


--
-- Name: orchestration_approvals orchestration_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_approvals
    ADD CONSTRAINT orchestration_approvals_pkey PRIMARY KEY (id);


--
-- Name: orchestration_clarifications orchestration_clarifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_pkey PRIMARY KEY (id);


--
-- Name: orchestration_connections orchestration_connections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_connections
    ADD CONSTRAINT orchestration_connections_pkey PRIMARY KEY (id);


--
-- Name: orchestration_embeddings orchestration_embeddings_orchestration_id_embedding_provide_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_embeddings
    ADD CONSTRAINT orchestration_embeddings_orchestration_id_embedding_provide_key UNIQUE (orchestration_id, embedding_provider, embedding_model);


--
-- Name: orchestration_embeddings orchestration_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_embeddings
    ADD CONSTRAINT orchestration_embeddings_pkey PRIMARY KEY (id);


--
-- Name: orchestration_executions orchestration_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_executions
    ADD CONSTRAINT orchestration_executions_pkey PRIMARY KEY (id);


--
-- Name: orchestration_node_executions orchestration_node_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_node_executions
    ADD CONSTRAINT orchestration_node_executions_pkey PRIMARY KEY (id);


--
-- Name: orchestration_nodes orchestration_nodes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_nodes
    ADD CONSTRAINT orchestration_nodes_pkey PRIMARY KEY (id);


--
-- Name: orchestration_triggers orchestration_triggers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_pkey PRIMARY KEY (id);


--
-- Name: orchestration_versions orchestration_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_versions
    ADD CONSTRAINT orchestration_versions_pkey PRIMARY KEY (id);


--
-- Name: orchestration_versions orchestration_versions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_versions
    ADD CONSTRAINT orchestration_versions_unique UNIQUE (orchestration_id, version);


--
-- Name: orchestrations orchestrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: processing_jobs processing_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_pkey PRIMARY KEY (id);


--
-- Name: role_module_permissions role_module_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_module_permissions
    ADD CONSTRAINT role_module_permissions_pkey PRIMARY KEY (role_id, module_key);


--
-- Name: role_topic_permissions role_topic_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_topic_permissions
    ADD CONSTRAINT role_topic_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_company_id_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_company_id_name_unique UNIQUE (company_id, name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schedule_executions schedule_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_executions
    ADD CONSTRAINT schedule_executions_pkey PRIMARY KEY (id);


--
-- Name: schedule_executions schedule_executions_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_executions
    ADD CONSTRAINT schedule_executions_unique UNIQUE (trigger_id, scheduled_at);


--
-- Name: step_executions step_executions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_executions
    ADD CONSTRAINT step_executions_pkey PRIMARY KEY (id);


--
-- Name: target_app_database_schemas target_app_database_schemas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_app_database_schemas
    ADD CONSTRAINT target_app_database_schemas_pkey PRIMARY KEY (id);


--
-- Name: target_app_database_schemas target_app_database_schemas_version_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_app_database_schemas
    ADD CONSTRAINT target_app_database_schemas_version_unique UNIQUE (target_app_id, database_name, version);


--
-- Name: trigger_execution_logs trigger_execution_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_pkey PRIMARY KEY (id);


--
-- Name: user_company_roles user_company_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_pkey PRIMARY KEY (user_id, company_id);


--
-- Name: user_lifecycle_events user_lifecycle_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_events
    ADD CONSTRAINT user_lifecycle_events_pkey PRIMARY KEY (id);


--
-- Name: user_module_permissions user_module_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_pkey PRIMARY KEY (user_id, company_id, module_key);


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: user_sessions user_sessions_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_token_hash_key UNIQUE (token_hash);


--
-- Name: user_target_app_access user_target_app_access_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_pkey PRIMARY KEY (user_id, target_app_id);


--
-- Name: user_topic_permissions user_topic_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_topic_permissions
    ADD CONSTRAINT user_topic_permissions_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ai_embedding_provider_configs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_embedding_provider_configs_company_idx ON public.ai_embedding_provider_configs USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: ai_embedding_provider_configs_company_provider_model_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_embedding_provider_configs_company_provider_model_unique ON public.ai_embedding_provider_configs USING btree (company_id, provider, model) WHERE (deleted_at IS NULL);


--
-- Name: ai_embedding_provider_configs_one_primary_per_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_embedding_provider_configs_one_primary_per_company ON public.ai_embedding_provider_configs USING btree (company_id) WHERE ((is_primary = true) AND (deleted_at IS NULL));


--
-- Name: ai_llm_provider_configs_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_llm_provider_configs_company_idx ON public.ai_llm_provider_configs USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: ai_llm_provider_configs_company_provider_model_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_llm_provider_configs_company_provider_model_unique ON public.ai_llm_provider_configs USING btree (company_id, provider, model) WHERE (deleted_at IS NULL);


--
-- Name: ai_llm_provider_configs_one_primary_per_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_llm_provider_configs_one_primary_per_company ON public.ai_llm_provider_configs USING btree (company_id) WHERE ((is_primary = true) AND (deleted_at IS NULL));


--
-- Name: ai_planner_pending_requests_one_active_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ai_planner_pending_requests_one_active_per_user ON public.ai_planner_pending_requests USING btree (target_app_id, external_user_id) WHERE (status = 'pending'::text);


--
-- Name: ai_planner_pending_requests_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ai_planner_pending_requests_target_app_idx ON public.ai_planner_pending_requests USING btree (target_app_id, status);


--
-- Name: api_trigger_rate_limit_windows_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_trigger_rate_limit_windows_updated_idx ON public.api_trigger_rate_limit_windows USING btree (updated_at);


--
-- Name: api_trigger_request_nonces_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX api_trigger_request_nonces_expires_idx ON public.api_trigger_request_nonces USING btree (expires_at);


--
-- Name: chat_query_feedback_feedback_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_feedback_feedback_created_idx ON public.chat_query_feedback USING btree (feedback, created_at DESC);


--
-- Name: chat_query_feedback_target_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_feedback_target_created_idx ON public.chat_query_feedback USING btree (target_app_id, created_at DESC);


--
-- Name: chat_query_telemetry_conversation_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_telemetry_conversation_idx ON public.chat_query_telemetry USING btree (conversation_id, created_at DESC) WHERE (conversation_id IS NOT NULL);


--
-- Name: chat_query_telemetry_external_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_telemetry_external_user_created_idx ON public.chat_query_telemetry USING btree (external_user_id, created_at DESC) WHERE (external_user_id IS NOT NULL);


--
-- Name: chat_query_telemetry_metadata_json_gin_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_telemetry_metadata_json_gin_idx ON public.chat_query_telemetry USING gin (metadata_json);


--
-- Name: chat_query_telemetry_status_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_telemetry_status_created_idx ON public.chat_query_telemetry USING btree (answer_status, created_at DESC);


--
-- Name: chat_query_telemetry_target_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_query_telemetry_target_created_idx ON public.chat_query_telemetry USING btree (target_app_id, created_at DESC);


--
-- Name: chatbot_action_mode_events_external_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_action_mode_events_external_user_created_idx ON public.chatbot_action_mode_events USING btree (external_user_id, created_at DESC);


--
-- Name: chatbot_action_mode_events_type_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_action_mode_events_type_created_idx ON public.chatbot_action_mode_events USING btree (event_type, created_at DESC);


--
-- Name: chatbot_api_keys_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_api_keys_expires_idx ON public.chatbot_api_keys USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: chatbot_intent_gate_decisions_external_user_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_intent_gate_decisions_external_user_created_idx ON public.chatbot_intent_gate_decisions USING btree (external_user_id, created_at DESC);


--
-- Name: chatbot_intent_gate_decisions_low_confidence_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_intent_gate_decisions_low_confidence_idx ON public.chatbot_intent_gate_decisions USING btree (low_confidence, created_at DESC);


--
-- Name: chatbot_intent_gate_feedback_feedback_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_intent_gate_feedback_feedback_type_idx ON public.chatbot_intent_gate_feedback USING btree (feedback_type, created_at DESC);


--
-- Name: chatbot_lifecycle_settings_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chatbot_lifecycle_settings_target_app_idx ON public.chatbot_lifecycle_settings USING btree (target_app_id, updated_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: chatbot_lifecycle_settings_target_scope_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chatbot_lifecycle_settings_target_scope_unique ON public.chatbot_lifecycle_settings USING btree (target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: chunk_embeddings_chunk_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunk_embeddings_chunk_id_idx ON public.chunk_embeddings USING btree (chunk_id);


--
-- Name: chunk_embeddings_chunk_provider_model_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX chunk_embeddings_chunk_provider_model_unique ON public.chunk_embeddings USING btree (chunk_id, embedding_provider, embedding_model);


--
-- Name: chunk_embeddings_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunk_embeddings_company_id_idx ON public.chunk_embeddings USING btree (company_id);


--
-- Name: chunk_embeddings_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chunk_embeddings_document_id_idx ON public.chunk_embeddings USING btree (document_id);


--
-- Name: companies_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_created_by_idx ON public.companies USING btree (created_by);


--
-- Name: companies_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_deleted_at_idx ON public.companies USING btree (deleted_at);


--
-- Name: companies_enforce_chatbot_key_environment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_enforce_chatbot_key_environment_idx ON public.companies USING btree (enforce_chatbot_key_environment);


--
-- Name: companies_updated_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX companies_updated_by_idx ON public.companies USING btree (updated_by);


--
-- Name: company_target_applications_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX company_target_applications_company_idx ON public.company_target_applications USING btree (company_id, name) WHERE (deleted_at IS NULL);


--
-- Name: company_target_applications_company_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX company_target_applications_company_name_unique ON public.company_target_applications USING btree (company_id, lower(name)) WHERE (deleted_at IS NULL);


--
-- Name: conversation_messages_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_messages_company_id_idx ON public.conversation_messages USING btree (company_id);


--
-- Name: conversation_messages_conversation_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_messages_conversation_id_idx ON public.conversation_messages USING btree (conversation_id, created_at);


--
-- Name: conversation_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversation_messages_created_at_idx ON public.conversation_messages USING btree (created_at DESC);


--
-- Name: conversations_company_external_user_status_last_message_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_company_external_user_status_last_message_idx ON public.conversations USING btree (company_id, external_user_id, status, last_message_at DESC) WHERE (external_user_id IS NOT NULL);


--
-- Name: conversations_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_company_id_idx ON public.conversations USING btree (company_id);


--
-- Name: conversations_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_created_at_idx ON public.conversations USING btree (created_at DESC);


--
-- Name: conversations_last_message_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_last_message_at_idx ON public.conversations USING btree (last_message_at DESC);


--
-- Name: conversations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX conversations_status_idx ON public.conversations USING btree (status);


--
-- Name: document_chunks_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_company_id_idx ON public.document_chunks USING btree (company_id);


--
-- Name: document_chunks_content_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_content_fts_idx ON public.document_chunks USING gin (to_tsvector('simple'::regconfig, content));


--
-- Name: document_chunks_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_document_id_idx ON public.document_chunks USING btree (document_id);


--
-- Name: document_chunks_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_folder_id_idx ON public.document_chunks USING btree (folder_id);


--
-- Name: document_chunks_page_number_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_chunks_page_number_idx ON public.document_chunks USING btree (document_id, page_number);


--
-- Name: document_pages_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_pages_company_id_idx ON public.document_pages USING btree (company_id);


--
-- Name: document_pages_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_pages_document_id_idx ON public.document_pages USING btree (document_id);


--
-- Name: document_parsed_contents_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_parsed_contents_company_id_idx ON public.document_parsed_contents USING btree (company_id);


--
-- Name: document_role_permissions_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_role_permissions_document_id_idx ON public.document_role_permissions USING btree (document_id) WHERE (deleted_at IS NULL);


--
-- Name: document_role_permissions_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_role_permissions_role_id_idx ON public.document_role_permissions USING btree (role_id) WHERE (deleted_at IS NULL);


--
-- Name: document_user_permissions_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_user_permissions_document_id_idx ON public.document_user_permissions USING btree (document_id) WHERE (deleted_at IS NULL);


--
-- Name: document_user_permissions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_user_permissions_user_id_idx ON public.document_user_permissions USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: document_versions_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_versions_company_created_idx ON public.document_versions USING btree (company_id, created_at DESC);


--
-- Name: document_versions_document_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_versions_document_version_idx ON public.document_versions USING btree (document_id, version_number DESC);


--
-- Name: document_versions_folder_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_versions_folder_created_idx ON public.document_versions USING btree (folder_id, created_at DESC);


--
-- Name: document_visual_assets_asset_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_assets_asset_type_idx ON public.document_visual_assets USING btree (asset_type, created_at DESC);


--
-- Name: document_visual_assets_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_assets_company_created_idx ON public.document_visual_assets USING btree (company_id, created_at DESC);


--
-- Name: document_visual_assets_document_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_assets_document_version_idx ON public.document_visual_assets USING btree (document_id, version_number, page_number);


--
-- Name: document_visual_insights_asset_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_insights_asset_idx ON public.document_visual_insights USING btree (asset_id);


--
-- Name: document_visual_insights_company_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_insights_company_created_idx ON public.document_visual_insights USING btree (company_id, created_at DESC);


--
-- Name: document_visual_insights_document_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_insights_document_version_idx ON public.document_visual_insights USING btree (document_id, version_number, created_at DESC);


--
-- Name: document_visual_insights_text_fts_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX document_visual_insights_text_fts_idx ON public.document_visual_insights USING gin (to_tsvector('simple'::regconfig, extracted_text));


--
-- Name: documents_company_checksum_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX documents_company_checksum_active_unique ON public.documents USING btree (company_id, checksum) WHERE (status <> 'deleted'::public.document_status);


--
-- Name: documents_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_company_id_idx ON public.documents USING btree (company_id);


--
-- Name: documents_company_storage_status_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_company_storage_status_updated_idx ON public.documents USING btree (company_id, storage_mode, status, updated_at DESC) WHERE (status <> 'deleted'::public.document_status);


--
-- Name: documents_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_created_at_idx ON public.documents USING btree (created_at DESC);


--
-- Name: documents_external_source_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_external_source_url_idx ON public.documents USING btree (external_source_url);


--
-- Name: documents_file_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_file_type_idx ON public.documents USING btree (file_type);


--
-- Name: documents_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_folder_id_idx ON public.documents USING btree (folder_id);


--
-- Name: documents_source_guide_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_source_guide_idx ON public.documents USING btree (source_guide_id) WHERE ((source_guide_id IS NOT NULL) AND (status <> 'deleted'::public.document_status));


--
-- Name: documents_stale_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_stale_idx ON public.documents USING btree (company_id, is_stale) WHERE ((is_stale = true) AND (status <> 'deleted'::public.document_status));


--
-- Name: documents_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_status_idx ON public.documents USING btree (status);


--
-- Name: documents_storage_mode_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_storage_mode_idx ON public.documents USING btree (storage_mode);


--
-- Name: email_outbox_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_outbox_status_created_at_idx ON public.email_outbox USING btree (status, created_at);


--
-- Name: employee_activation_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_activation_tokens_expires_at_idx ON public.employee_activation_tokens USING btree (expires_at);


--
-- Name: employee_activation_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX employee_activation_tokens_user_id_idx ON public.employee_activation_tokens USING btree (user_id);


--
-- Name: folder_document_role_permissions_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_document_role_permissions_folder_id_idx ON public.folder_document_role_permissions USING btree (folder_id) WHERE (deleted_at IS NULL);


--
-- Name: folder_document_role_permissions_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_document_role_permissions_role_id_idx ON public.folder_document_role_permissions USING btree (role_id) WHERE (deleted_at IS NULL);


--
-- Name: folder_document_user_permissions_folder_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_document_user_permissions_folder_id_idx ON public.folder_document_user_permissions USING btree (folder_id) WHERE (deleted_at IS NULL);


--
-- Name: folder_document_user_permissions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_document_user_permissions_user_id_idx ON public.folder_document_user_permissions USING btree (user_id) WHERE (deleted_at IS NULL);


--
-- Name: folder_target_apps_folder_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_target_apps_folder_active_idx ON public.folder_target_apps USING btree (folder_id) WHERE (deleted_at IS NULL);


--
-- Name: folder_target_apps_target_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folder_target_apps_target_active_idx ON public.folder_target_apps USING btree (target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: folders_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_company_idx ON public.folders USING btree (company_id) WHERE (deleted_at IS NULL);


--
-- Name: folders_parent_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX folders_parent_idx ON public.folders USING btree (parent_id) WHERE (deleted_at IS NULL);


--
-- Name: guided_workflow_guides_parent_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_guides_parent_version_idx ON public.guided_workflow_guides USING btree (parent_version_id, version DESC) WHERE (parent_version_id IS NOT NULL);


--
-- Name: guided_workflow_guides_target_app_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_guides_target_app_status_idx ON public.guided_workflow_guides USING btree (target_app_id, status, updated_at DESC);


--
-- Name: guided_workflow_recorded_actions_topic_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX guided_workflow_recorded_actions_topic_action_idx ON public.guided_workflow_recorded_actions USING btree (topic_id, action_index);


--
-- Name: guided_workflow_recording_sessions_company_target_app_active_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_recording_sessions_company_target_app_active_id ON public.guided_workflow_recording_sessions USING btree (company_target_application_id, deleted_at, updated_at DESC);


--
-- Name: guided_workflow_recording_sessions_company_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_recording_sessions_company_target_app_idx ON public.guided_workflow_recording_sessions USING btree (company_target_application_id);


--
-- Name: guided_workflow_revoked_tokens_revoked_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_revoked_tokens_revoked_by_idx ON public.guided_workflow_revoked_recorder_tokens USING btree (revoked_by);


--
-- Name: guided_workflow_revoked_tokens_topic_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_revoked_tokens_topic_idx ON public.guided_workflow_revoked_recorder_tokens USING btree (topic_id, revoked_at DESC);


--
-- Name: guided_workflow_topics_deleted_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_topics_deleted_idx ON public.guided_workflow_topics USING btree (recording_session_id, deleted_at, sort_order, created_at);


--
-- Name: guided_workflow_topics_session_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX guided_workflow_topics_session_order_idx ON public.guided_workflow_topics USING btree (recording_session_id, sort_order, created_at);


--
-- Name: healing_audit_workflow_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX healing_audit_workflow_created_idx ON public.guided_workflow_healing_audit USING btree (workflow_id, created_at DESC);


--
-- Name: healing_suggestions_step_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX healing_suggestions_step_idx ON public.guided_workflow_healing_suggestions USING btree (workflow_id, step_id, status);


--
-- Name: healing_suggestions_workflow_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX healing_suggestions_workflow_status_idx ON public.guided_workflow_healing_suggestions USING btree (workflow_id, status, created_at DESC);


--
-- Name: idx_chat_attachments_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_conversation ON public.chat_attachments USING btree (conversation_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_chat_attachments_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_attachments_target_app ON public.chat_attachments USING btree (target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_chatbot_api_key_environments_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_key_environments_target_app ON public.chatbot_api_key_environments USING btree (target_app_id, name);


--
-- Name: idx_chatbot_api_keys_environment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_environment_id ON public.chatbot_api_keys USING btree (environment_id);


--
-- Name: idx_chatbot_api_keys_last_used_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_last_used_at ON public.chatbot_api_keys USING btree (last_used_at);


--
-- Name: idx_chatbot_api_keys_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_status ON public.chatbot_api_keys USING btree (status);


--
-- Name: idx_chatbot_api_keys_strict_environment_enforcement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_strict_environment_enforcement ON public.chatbot_api_keys USING btree (strict_environment_enforcement) WHERE (strict_environment_enforcement = true);


--
-- Name: idx_chatbot_api_keys_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_target_app ON public.chatbot_api_keys USING btree (target_app_id);


--
-- Name: idx_chatbot_api_keys_target_env_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_api_keys_target_env_active ON public.chatbot_api_keys USING btree (target_app_id, environment_id) WHERE ((status = 'active'::text) AND (is_active = true));


--
-- Name: idx_chatbot_embed_packages_environment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_embed_packages_environment_id ON public.chatbot_embed_packages USING btree (environment_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_chatbot_embed_packages_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_embed_packages_target_app ON public.chatbot_embed_packages USING btree (target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_chatbot_trigger_sessions_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_trigger_sessions_session ON public.chatbot_trigger_sessions USING btree (session_id);


--
-- Name: idx_chatbot_trigger_sessions_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_trigger_sessions_trigger ON public.chatbot_trigger_sessions USING btree (trigger_id);


--
-- Name: idx_chatbot_trigger_sessions_triggered_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_trigger_sessions_triggered_at ON public.chatbot_trigger_sessions USING btree (triggered_at);


--
-- Name: idx_email_credentials_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_credentials_active ON public.email_credentials USING btree (is_active);


--
-- Name: idx_email_credentials_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_credentials_company ON public.email_credentials USING btree (company_id);


--
-- Name: idx_email_credentials_provider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_credentials_provider ON public.email_credentials USING btree (provider);


--
-- Name: idx_email_credentials_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_credentials_target_app ON public.email_credentials USING btree (target_app_id);


--
-- Name: idx_email_credentials_unique_per_app; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_email_credentials_unique_per_app ON public.email_credentials USING btree (company_id, target_app_id, email_address, provider, COALESCE(imap_host, ''::text)) WHERE (is_active = true);


--
-- Name: idx_email_sender_credentials_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sender_credentials_active ON public.email_sender_credentials USING btree (company_id, is_active);


--
-- Name: idx_email_sender_credentials_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sender_credentials_company ON public.email_sender_credentials USING btree (company_id);


--
-- Name: idx_email_sender_credentials_target_app; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sender_credentials_target_app ON public.email_sender_credentials USING btree (target_app_id);


--
-- Name: idx_email_trigger_messages_received_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_trigger_messages_received_at ON public.email_trigger_messages USING btree (received_at);


--
-- Name: idx_email_trigger_messages_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_trigger_messages_status ON public.email_trigger_messages USING btree (status);


--
-- Name: idx_email_trigger_messages_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_trigger_messages_trigger ON public.email_trigger_messages USING btree (trigger_id);


--
-- Name: idx_internal_notifications_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_created_at ON public.internal_notifications USING btree (created_at DESC);


--
-- Name: idx_internal_notifications_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_expires_at ON public.internal_notifications USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_internal_notifications_persistent_until_read; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_persistent_until_read ON public.internal_notifications USING btree (persistent_until_read) WHERE (persistent_until_read = true);


--
-- Name: idx_internal_notifications_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_type ON public.internal_notifications USING btree (type);


--
-- Name: idx_internal_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_unread ON public.internal_notifications USING btree (user_id, read) WHERE (read = false);


--
-- Name: idx_internal_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_internal_notifications_user_id ON public.internal_notifications USING btree (user_id);


--
-- Name: idx_modules_parent_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_modules_parent_key ON public.modules USING btree (parent_key);


--
-- Name: idx_orchestration_triggers_orchestration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchestration_triggers_orchestration ON public.orchestration_triggers USING btree (orchestration_id);


--
-- Name: idx_orchestration_triggers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchestration_triggers_status ON public.orchestration_triggers USING btree (status);


--
-- Name: idx_orchestration_triggers_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orchestration_triggers_type ON public.orchestration_triggers USING btree (trigger_type);


--
-- Name: idx_roles_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_roles_company_id ON public.roles USING btree (company_id);


--
-- Name: idx_schedule_executions_scheduled_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_executions_scheduled_at ON public.schedule_executions USING btree (scheduled_at);


--
-- Name: idx_schedule_executions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_executions_status ON public.schedule_executions USING btree (status);


--
-- Name: idx_schedule_executions_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedule_executions_trigger ON public.schedule_executions USING btree (trigger_id);


--
-- Name: idx_trigger_execution_logs_execution; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_logs_execution ON public.trigger_execution_logs USING btree (execution_id);


--
-- Name: idx_trigger_execution_logs_orchestration; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_logs_orchestration ON public.trigger_execution_logs USING btree (orchestration_id);


--
-- Name: idx_trigger_execution_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_logs_status ON public.trigger_execution_logs USING btree (status);


--
-- Name: idx_trigger_execution_logs_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_logs_trigger ON public.trigger_execution_logs USING btree (trigger_id);


--
-- Name: idx_trigger_execution_logs_triggered_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trigger_execution_logs_triggered_at ON public.trigger_execution_logs USING btree (triggered_at);


--
-- Name: idx_user_company_roles_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_company_roles_status ON public.user_company_roles USING btree (company_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_user_company_roles_user_id_is_primary; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_company_roles_user_id_is_primary ON public.user_company_roles USING btree (user_id, is_primary) WHERE (deleted_at IS NULL);


--
-- Name: idx_user_lifecycle_events_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_lifecycle_events_company ON public.user_lifecycle_events USING btree (company_id, created_at DESC);


--
-- Name: idx_user_lifecycle_events_performed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_lifecycle_events_performed_by ON public.user_lifecycle_events USING btree (performed_by, created_at DESC);


--
-- Name: idx_user_lifecycle_events_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_lifecycle_events_user ON public.user_lifecycle_events USING btree (user_id, created_at DESC);


--
-- Name: ingestion_credentials_company_provider_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_credentials_company_provider_idx ON public.ingestion_credentials USING btree (company_id, provider);


--
-- Name: ingestion_sources_folder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_sources_folder_idx ON public.ingestion_sources USING btree (folder_id, enabled);


--
-- Name: ingestion_sync_runs_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ingestion_sync_runs_source_idx ON public.ingestion_sync_runs USING btree (source_id, started_at DESC);


--
-- Name: orchestration_approvals_approver_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_approvals_approver_idx ON public.orchestration_approvals USING btree (approver_email);


--
-- Name: orchestration_approvals_execution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_approvals_execution_idx ON public.orchestration_approvals USING btree (execution_id);


--
-- Name: orchestration_approvals_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_approvals_status_idx ON public.orchestration_approvals USING btree (status);


--
-- Name: orchestration_clarifications_conversation_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_clarifications_conversation_status_expires_idx ON public.orchestration_clarifications USING btree (conversation_id, status, expires_at DESC);


--
-- Name: orchestration_clarifications_execution_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_clarifications_execution_status_idx ON public.orchestration_clarifications USING btree (execution_id, status);


--
-- Name: orchestration_connections_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_connections_orchestration_idx ON public.orchestration_connections USING btree (orchestration_id);


--
-- Name: orchestration_connections_source_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_connections_source_idx ON public.orchestration_connections USING btree (source_node_id);


--
-- Name: orchestration_connections_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_connections_target_idx ON public.orchestration_connections USING btree (target_node_id);


--
-- Name: orchestration_embeddings_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_embeddings_company_id_idx ON public.orchestration_embeddings USING btree (company_id);


--
-- Name: orchestration_embeddings_orchestration_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_embeddings_orchestration_id_idx ON public.orchestration_embeddings USING btree (orchestration_id);


--
-- Name: orchestration_executions_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_executions_orchestration_idx ON public.orchestration_executions USING btree (orchestration_id);


--
-- Name: orchestration_executions_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_executions_started_idx ON public.orchestration_executions USING btree (started_at);


--
-- Name: orchestration_executions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_executions_status_idx ON public.orchestration_executions USING btree (status);


--
-- Name: orchestration_node_executions_execution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_node_executions_execution_idx ON public.orchestration_node_executions USING btree (execution_id);


--
-- Name: orchestration_node_executions_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_node_executions_started_idx ON public.orchestration_node_executions USING btree (started_at);


--
-- Name: orchestration_node_executions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_node_executions_status_idx ON public.orchestration_node_executions USING btree (status);


--
-- Name: orchestration_nodes_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_nodes_orchestration_idx ON public.orchestration_nodes USING btree (orchestration_id);


--
-- Name: orchestration_nodes_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_nodes_type_idx ON public.orchestration_nodes USING btree (node_type);


--
-- Name: orchestration_triggers_http_api_slug_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orchestration_triggers_http_api_slug_uidx ON public.orchestration_triggers USING btree (lower(endpoint_slug)) WHERE ((trigger_type = 'http_api'::text) AND (endpoint_slug IS NOT NULL));


--
-- Name: orchestration_triggers_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_triggers_orchestration_idx ON public.orchestration_triggers USING btree (orchestration_id);


--
-- Name: orchestration_triggers_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_triggers_status_idx ON public.orchestration_triggers USING btree (status);


--
-- Name: orchestration_triggers_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_triggers_type_idx ON public.orchestration_triggers USING btree (trigger_type);


--
-- Name: orchestration_versions_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_versions_orchestration_idx ON public.orchestration_versions USING btree (orchestration_id);


--
-- Name: orchestration_versions_version_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestration_versions_version_idx ON public.orchestration_versions USING btree (orchestration_id, version);


--
-- Name: orchestrations_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestrations_company_idx ON public.orchestrations USING btree (company_id);


--
-- Name: orchestrations_one_ai_planner_drafting_entry_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX orchestrations_one_ai_planner_drafting_entry_per_scope ON public.orchestrations USING btree (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid), ai_planner_drafting_trigger_type) WHERE (ai_planner_drafting_trigger_type IS NOT NULL);


--
-- Name: orchestrations_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestrations_status_idx ON public.orchestrations USING btree (status);


--
-- Name: orchestrations_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX orchestrations_target_app_idx ON public.orchestrations USING btree (target_app_id);


--
-- Name: password_reset_tokens_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_expires_at_idx ON public.password_reset_tokens USING btree (expires_at);


--
-- Name: password_reset_tokens_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX password_reset_tokens_user_id_idx ON public.password_reset_tokens USING btree (user_id);


--
-- Name: processing_jobs_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processing_jobs_company_id_idx ON public.processing_jobs USING btree (company_id);


--
-- Name: processing_jobs_document_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processing_jobs_document_id_idx ON public.processing_jobs USING btree (document_id);


--
-- Name: processing_jobs_document_job_type_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX processing_jobs_document_job_type_active_unique ON public.processing_jobs USING btree (document_id, job_type) WHERE (status = ANY (ARRAY['pending'::public.processing_job_status, 'running'::public.processing_job_status, 'retrying'::public.processing_job_status]));


--
-- Name: processing_jobs_job_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processing_jobs_job_type_idx ON public.processing_jobs USING btree (job_type);


--
-- Name: processing_jobs_status_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX processing_jobs_status_created_at_idx ON public.processing_jobs USING btree (status, created_at);


--
-- Name: role_module_permissions_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_module_permissions_deleted_at_idx ON public.role_module_permissions USING btree (deleted_at);


--
-- Name: role_module_permissions_module_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX role_module_permissions_module_key_idx ON public.role_module_permissions USING btree (module_key);


--
-- Name: role_topic_permissions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX role_topic_permissions_active_idx ON public.role_topic_permissions USING btree (role_id, topic_id) WHERE (deleted_at IS NULL);


--
-- Name: roles_created_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_created_by_idx ON public.roles USING btree (created_by);


--
-- Name: roles_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_deleted_at_idx ON public.roles USING btree (deleted_at);


--
-- Name: roles_updated_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX roles_updated_by_idx ON public.roles USING btree (updated_by);


--
-- Name: step_executions_company_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_executions_company_started_idx ON public.step_executions USING btree (company_id, started_at DESC);


--
-- Name: step_executions_status_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_executions_status_started_idx ON public.step_executions USING btree (status, started_at DESC);


--
-- Name: step_executions_workflow_execution_started_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_executions_workflow_execution_started_idx ON public.step_executions USING btree (workflow_execution_id, started_at);


--
-- Name: step_executions_workflow_step_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX step_executions_workflow_step_status_idx ON public.step_executions USING btree (workflow_id, step_id, status);


--
-- Name: target_app_database_schemas_active_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX target_app_database_schemas_active_unique ON public.target_app_database_schemas USING btree (target_app_id, database_name) WHERE ((is_active = true) AND (deleted_at IS NULL));


--
-- Name: target_app_database_schemas_lookup_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX target_app_database_schemas_lookup_idx ON public.target_app_database_schemas USING btree (target_app_id, database_name, version DESC) WHERE (deleted_at IS NULL);


--
-- Name: target_app_database_schemas_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX target_app_database_schemas_target_app_idx ON public.target_app_database_schemas USING btree (target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: topics_company_parent_slug_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX topics_company_parent_slug_active_idx ON public.folders USING btree (company_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug) WHERE (deleted_at IS NULL);


--
-- Name: trigger_execution_logs_execution_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trigger_execution_logs_execution_idx ON public.trigger_execution_logs USING btree (execution_id);


--
-- Name: trigger_execution_logs_orchestration_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trigger_execution_logs_orchestration_idx ON public.trigger_execution_logs USING btree (orchestration_id);


--
-- Name: trigger_execution_logs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trigger_execution_logs_status_idx ON public.trigger_execution_logs USING btree (status);


--
-- Name: trigger_execution_logs_trigger_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trigger_execution_logs_trigger_idx ON public.trigger_execution_logs USING btree (trigger_id);


--
-- Name: trigger_execution_logs_triggered_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX trigger_execution_logs_triggered_at_idx ON public.trigger_execution_logs USING btree (triggered_at);


--
-- Name: uq_email_sender_primary_per_scope; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_email_sender_primary_per_scope ON public.email_sender_credentials USING btree (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE ((is_primary = true) AND (is_active = true));


--
-- Name: user_company_roles_company_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_company_roles_company_id_idx ON public.user_company_roles USING btree (company_id);


--
-- Name: user_company_roles_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_company_roles_deleted_at_idx ON public.user_company_roles USING btree (deleted_at);


--
-- Name: user_company_roles_role_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_company_roles_role_id_idx ON public.user_company_roles USING btree (role_id);


--
-- Name: user_module_permissions_deleted_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_module_permissions_deleted_at_idx ON public.user_module_permissions USING btree (deleted_at);


--
-- Name: user_module_permissions_module_key_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_module_permissions_module_key_idx ON public.user_module_permissions USING btree (module_key);


--
-- Name: user_module_permissions_user_company_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_module_permissions_user_company_idx ON public.user_module_permissions USING btree (user_id, company_id) WHERE (deleted_at IS NULL);


--
-- Name: user_sessions_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_expires_at_idx ON public.user_sessions USING btree (expires_at);


--
-- Name: user_sessions_user_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_sessions_user_id_idx ON public.user_sessions USING btree (user_id);


--
-- Name: user_target_app_access_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_target_app_access_active_idx ON public.user_target_app_access USING btree (user_id, target_app_id) WHERE (deleted_at IS NULL);


--
-- Name: user_target_app_access_target_app_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_target_app_access_target_app_idx ON public.user_target_app_access USING btree (target_app_id);


--
-- Name: user_target_app_access_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_target_app_access_user_idx ON public.user_target_app_access USING btree (user_id);


--
-- Name: user_topic_permissions_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX user_topic_permissions_active_idx ON public.user_topic_permissions USING btree (user_id, topic_id) WHERE (deleted_at IS NULL);


--
-- Name: users_updated_by_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX users_updated_by_idx ON public.users USING btree (updated_by);


--
-- Name: chat_attachments chat_attachments_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chat_attachments_set_updated_at BEFORE UPDATE ON public.chat_attachments FOR EACH ROW EXECUTE FUNCTION public.trg_chat_attachments_updated_at();


--
-- Name: chatbot_embed_packages chatbot_embed_packages_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER chatbot_embed_packages_set_updated_at BEFORE UPDATE ON public.chatbot_embed_packages FOR EACH ROW EXECUTE FUNCTION public.trg_chatbot_embed_packages_updated_at();


--
-- Name: email_credentials trigger_email_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_email_credentials_updated_at BEFORE UPDATE ON public.email_credentials FOR EACH ROW EXECUTE FUNCTION public.update_email_credentials_updated_at();


--
-- Name: email_sender_credentials trigger_email_sender_credentials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_email_sender_credentials_updated_at BEFORE UPDATE ON public.email_sender_credentials FOR EACH ROW EXECUTE FUNCTION public.update_email_sender_credentials_updated_at();


--
-- Name: ai_embedding_provider_configs ai_embedding_provider_configs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embedding_provider_configs
    ADD CONSTRAINT ai_embedding_provider_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ai_embedding_provider_configs ai_embedding_provider_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embedding_provider_configs
    ADD CONSTRAINT ai_embedding_provider_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_embedding_provider_configs ai_embedding_provider_configs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_embedding_provider_configs
    ADD CONSTRAINT ai_embedding_provider_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_llm_provider_configs ai_llm_provider_configs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_llm_provider_configs
    ADD CONSTRAINT ai_llm_provider_configs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: ai_llm_provider_configs ai_llm_provider_configs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_llm_provider_configs
    ADD CONSTRAINT ai_llm_provider_configs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_llm_provider_configs ai_llm_provider_configs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_llm_provider_configs
    ADD CONSTRAINT ai_llm_provider_configs_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_planner_pending_requests ai_planner_pending_requests_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_pending_requests
    ADD CONSTRAINT ai_planner_pending_requests_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: ai_planner_pending_requests ai_planner_pending_requests_draft_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_pending_requests
    ADD CONSTRAINT ai_planner_pending_requests_draft_orchestration_id_fkey FOREIGN KEY (draft_orchestration_id) REFERENCES public.orchestrations(id) ON DELETE SET NULL;


--
-- Name: ai_planner_pending_requests ai_planner_pending_requests_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_pending_requests
    ADD CONSTRAINT ai_planner_pending_requests_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ai_planner_pending_requests ai_planner_pending_requests_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_pending_requests
    ADD CONSTRAINT ai_planner_pending_requests_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: ai_planner_sessions ai_planner_sessions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_sessions
    ADD CONSTRAINT ai_planner_sessions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: ai_planner_sessions ai_planner_sessions_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_planner_sessions
    ADD CONSTRAINT ai_planner_sessions_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: api_trigger_rate_limit_windows api_trigger_rate_limit_windows_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_trigger_rate_limit_windows
    ADD CONSTRAINT api_trigger_rate_limit_windows_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: api_trigger_request_nonces api_trigger_request_nonces_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_trigger_request_nonces
    ADD CONSTRAINT api_trigger_request_nonces_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: chat_attachment_rate_limit_windows chat_attachment_rate_limit_windows_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachment_rate_limit_windows
    ADD CONSTRAINT chat_attachment_rate_limit_windows_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chat_attachments chat_attachments_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: chat_attachments chat_attachments_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_attachments
    ADD CONSTRAINT chat_attachments_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chat_query_feedback chat_query_feedback_query_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_feedback
    ADD CONSTRAINT chat_query_feedback_query_id_fkey FOREIGN KEY (query_id) REFERENCES public.chat_query_telemetry(id) ON DELETE CASCADE;


--
-- Name: chat_query_feedback chat_query_feedback_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_feedback
    ADD CONSTRAINT chat_query_feedback_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: chat_query_telemetry chat_query_telemetry_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_telemetry
    ADD CONSTRAINT chat_query_telemetry_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: chat_query_telemetry chat_query_telemetry_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_query_telemetry
    ADD CONSTRAINT chat_query_telemetry_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: chatbot_action_mode_events chatbot_action_mode_events_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_action_mode_events
    ADD CONSTRAINT chatbot_action_mode_events_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: chatbot_action_mode_events chatbot_action_mode_events_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_action_mode_events
    ADD CONSTRAINT chatbot_action_mode_events_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: chatbot_api_key_environments chatbot_api_key_environments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_key_environments
    ADD CONSTRAINT chatbot_api_key_environments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_api_key_environments chatbot_api_key_environments_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_key_environments
    ADD CONSTRAINT chatbot_api_key_environments_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chatbot_api_key_environments chatbot_api_key_environments_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_key_environments
    ADD CONSTRAINT chatbot_api_key_environments_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_api_keys chatbot_api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_api_keys chatbot_api_keys_environment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.chatbot_api_key_environments(id) ON DELETE RESTRICT;


--
-- Name: chatbot_api_keys chatbot_api_keys_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id);


--
-- Name: chatbot_api_keys chatbot_api_keys_rotated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_rotated_by_fkey FOREIGN KEY (rotated_by) REFERENCES public.users(id);


--
-- Name: chatbot_api_keys chatbot_api_keys_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.users(id);


--
-- Name: chatbot_api_keys chatbot_api_keys_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chatbot_api_keys chatbot_api_keys_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_api_keys
    ADD CONSTRAINT chatbot_api_keys_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_embed_packages chatbot_embed_packages_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_embed_packages
    ADD CONSTRAINT chatbot_embed_packages_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: chatbot_embed_packages chatbot_embed_packages_environment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_embed_packages
    ADD CONSTRAINT chatbot_embed_packages_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.chatbot_api_key_environments(id) ON DELETE RESTRICT;


--
-- Name: chatbot_embed_packages chatbot_embed_packages_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_embed_packages
    ADD CONSTRAINT chatbot_embed_packages_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chatbot_embed_packages chatbot_embed_packages_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_embed_packages
    ADD CONSTRAINT chatbot_embed_packages_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: chatbot_intent_gate_decisions chatbot_intent_gate_decisions_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_decisions
    ADD CONSTRAINT chatbot_intent_gate_decisions_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE SET NULL;


--
-- Name: chatbot_intent_gate_decisions chatbot_intent_gate_decisions_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_decisions
    ADD CONSTRAINT chatbot_intent_gate_decisions_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: chatbot_intent_gate_feedback chatbot_intent_gate_feedback_decision_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_feedback
    ADD CONSTRAINT chatbot_intent_gate_feedback_decision_id_fkey FOREIGN KEY (decision_id) REFERENCES public.chatbot_intent_gate_decisions(id) ON DELETE CASCADE;


--
-- Name: chatbot_intent_gate_feedback chatbot_intent_gate_feedback_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_intent_gate_feedback
    ADD CONSTRAINT chatbot_intent_gate_feedback_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: chatbot_lifecycle_settings chatbot_lifecycle_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_lifecycle_settings
    ADD CONSTRAINT chatbot_lifecycle_settings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_lifecycle_settings chatbot_lifecycle_settings_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_lifecycle_settings
    ADD CONSTRAINT chatbot_lifecycle_settings_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: chatbot_lifecycle_settings chatbot_lifecycle_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_lifecycle_settings
    ADD CONSTRAINT chatbot_lifecycle_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chatbot_trigger_sessions chatbot_trigger_sessions_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_trigger_sessions
    ADD CONSTRAINT chatbot_trigger_sessions_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE SET NULL;


--
-- Name: chatbot_trigger_sessions chatbot_trigger_sessions_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_trigger_sessions
    ADD CONSTRAINT chatbot_trigger_sessions_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: chatbot_trigger_sessions chatbot_trigger_sessions_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_trigger_sessions
    ADD CONSTRAINT chatbot_trigger_sessions_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: chunk_embeddings chunk_embeddings_chunk_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunk_embeddings
    ADD CONSTRAINT chunk_embeddings_chunk_id_fkey FOREIGN KEY (chunk_id) REFERENCES public.document_chunks(id) ON DELETE CASCADE;


--
-- Name: chunk_embeddings chunk_embeddings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunk_embeddings
    ADD CONSTRAINT chunk_embeddings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: chunk_embeddings chunk_embeddings_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chunk_embeddings
    ADD CONSTRAINT chunk_embeddings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;


--
-- Name: companies companies_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: companies companies_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: company_target_applications company_target_applications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_target_applications
    ADD CONSTRAINT company_target_applications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_target_applications company_target_applications_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_target_applications
    ADD CONSTRAINT company_target_applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: company_target_applications company_target_applications_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_target_applications
    ADD CONSTRAINT company_target_applications_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: conversation_messages conversation_messages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: conversation_messages conversation_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversation_messages
    ADD CONSTRAINT conversation_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: conversations conversations_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.conversations
    ADD CONSTRAINT conversations_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_chunks document_chunks_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_chunks document_chunks_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;


--
-- Name: document_chunks document_chunks_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_chunks
    ADD CONSTRAINT document_chunks_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: document_pages document_pages_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_pages
    ADD CONSTRAINT document_pages_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_pages document_pages_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_pages
    ADD CONSTRAINT document_pages_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;


--
-- Name: document_parsed_contents document_parsed_contents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parsed_contents
    ADD CONSTRAINT document_parsed_contents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_parsed_contents document_parsed_contents_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_parsed_contents
    ADD CONSTRAINT document_parsed_contents_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;


--
-- Name: document_role_permissions document_role_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_role_permissions document_role_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_role_permissions document_role_permissions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_role_permissions document_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: document_role_permissions document_role_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_role_permissions
    ADD CONSTRAINT document_role_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_user_permissions document_user_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_user_permissions document_user_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_user_permissions document_user_permissions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_user_permissions document_user_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_user_permissions document_user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_user_permissions
    ADD CONSTRAINT document_user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: document_versions document_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: document_versions document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_versions document_versions_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: document_visual_assets document_visual_assets_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_assets
    ADD CONSTRAINT document_visual_assets_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_visual_assets document_visual_assets_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_assets
    ADD CONSTRAINT document_visual_assets_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: document_visual_insights document_visual_insights_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_insights
    ADD CONSTRAINT document_visual_insights_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.document_visual_assets(id) ON DELETE CASCADE;


--
-- Name: document_visual_insights document_visual_insights_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_insights
    ADD CONSTRAINT document_visual_insights_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: document_visual_insights document_visual_insights_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_visual_insights
    ADD CONSTRAINT document_visual_insights_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: documents documents_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: documents documents_source_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_source_guide_id_fkey FOREIGN KEY (source_guide_id) REFERENCES public.guided_workflow_guides(id) ON DELETE SET NULL;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: email_credentials email_credentials_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_credentials
    ADD CONSTRAINT email_credentials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: email_credentials email_credentials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_credentials
    ADD CONSTRAINT email_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_credentials email_credentials_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_credentials
    ADD CONSTRAINT email_credentials_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: email_credentials email_credentials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_credentials
    ADD CONSTRAINT email_credentials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_sender_credentials email_sender_credentials_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sender_credentials
    ADD CONSTRAINT email_sender_credentials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: email_sender_credentials email_sender_credentials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sender_credentials
    ADD CONSTRAINT email_sender_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_sender_credentials email_sender_credentials_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sender_credentials
    ADD CONSTRAINT email_sender_credentials_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: email_sender_credentials email_sender_credentials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sender_credentials
    ADD CONSTRAINT email_sender_credentials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_trigger_messages email_trigger_messages_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_trigger_messages
    ADD CONSTRAINT email_trigger_messages_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE SET NULL;


--
-- Name: email_trigger_messages email_trigger_messages_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_trigger_messages
    ADD CONSTRAINT email_trigger_messages_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: email_trigger_messages email_trigger_messages_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_trigger_messages
    ADD CONSTRAINT email_trigger_messages_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: employee_activation_tokens employee_activation_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_activation_tokens
    ADD CONSTRAINT employee_activation_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: roles fk_roles_company_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT fk_roles_company_id FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: folder_document_role_permissions folder_document_role_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: folder_document_role_permissions folder_document_role_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folder_document_role_permissions folder_document_role_permissions_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folder_document_role_permissions folder_document_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: folder_document_role_permissions folder_document_role_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_role_permissions
    ADD CONSTRAINT folder_document_role_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folder_document_user_permissions folder_document_user_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: folder_document_user_permissions folder_document_user_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folder_document_user_permissions folder_document_user_permissions_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: folder_document_user_permissions folder_document_user_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folder_document_user_permissions folder_document_user_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_document_user_permissions
    ADD CONSTRAINT folder_document_user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: folder_target_apps folder_target_apps_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: folder_target_apps folder_target_apps_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: folder_target_apps folder_target_apps_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE RESTRICT;


--
-- Name: folder_target_apps folder_target_apps_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folder_target_apps
    ADD CONSTRAINT folder_target_apps_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: folders folders_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: guided_workflow_guides guided_workflow_guides_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_guides guided_workflow_guides_parent_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_parent_version_id_fkey FOREIGN KEY (parent_version_id) REFERENCES public.guided_workflow_guides(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_guides guided_workflow_guides_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_guides guided_workflow_guides_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.guided_workflow_topics(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_guides guided_workflow_guides_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_guides
    ADD CONSTRAINT guided_workflow_guides_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_healing_audit guided_workflow_healing_audit_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_audit
    ADD CONSTRAINT guided_workflow_healing_audit_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_healing_audit guided_workflow_healing_audit_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_audit
    ADD CONSTRAINT guided_workflow_healing_audit_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.guided_workflow_guides(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_healing_suggestions guided_workflow_healing_suggestions_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_suggestions
    ADD CONSTRAINT guided_workflow_healing_suggestions_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_healing_suggestions guided_workflow_healing_suggestions_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_suggestions
    ADD CONSTRAINT guided_workflow_healing_suggestions_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_healing_suggestions guided_workflow_healing_suggestions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_healing_suggestions
    ADD CONSTRAINT guided_workflow_healing_suggestions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.guided_workflow_guides(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_recorded_actions guided_workflow_recorded_actions_recording_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recorded_actions
    ADD CONSTRAINT guided_workflow_recorded_actions_recording_session_id_fkey FOREIGN KEY (recording_session_id) REFERENCES public.guided_workflow_recording_sessions(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_recorded_actions guided_workflow_recorded_actions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recorded_actions
    ADD CONSTRAINT guided_workflow_recorded_actions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.guided_workflow_topics(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_recording_sessions guided_workflow_recording_ses_company_target_application_i_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recording_sessions
    ADD CONSTRAINT guided_workflow_recording_ses_company_target_application_i_fkey FOREIGN KEY (company_target_application_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_recording_sessions guided_workflow_recording_sessions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recording_sessions
    ADD CONSTRAINT guided_workflow_recording_sessions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_recording_sessions guided_workflow_recording_sessions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_recording_sessions
    ADD CONSTRAINT guided_workflow_recording_sessions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_revoked_recorder_tokens guided_workflow_revoked_recorder_tokens_revoked_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_revoked_recorder_tokens
    ADD CONSTRAINT guided_workflow_revoked_recorder_tokens_revoked_by_fkey FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_revoked_recorder_tokens guided_workflow_revoked_recorder_tokens_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_revoked_recorder_tokens
    ADD CONSTRAINT guided_workflow_revoked_recorder_tokens_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.guided_workflow_topics(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_topics guided_workflow_topics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_topics guided_workflow_topics_guide_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_guide_id_fkey FOREIGN KEY (guide_id) REFERENCES public.guided_workflow_guides(id) ON DELETE SET NULL;


--
-- Name: guided_workflow_topics guided_workflow_topics_recording_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_recording_session_id_fkey FOREIGN KEY (recording_session_id) REFERENCES public.guided_workflow_recording_sessions(id) ON DELETE CASCADE;


--
-- Name: guided_workflow_topics guided_workflow_topics_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.guided_workflow_topics
    ADD CONSTRAINT guided_workflow_topics_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: ingestion_credentials ingestion_credentials_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_credentials
    ADD CONSTRAINT ingestion_credentials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: ingestion_credentials ingestion_credentials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_credentials
    ADD CONSTRAINT ingestion_credentials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: ingestion_source_items ingestion_source_items_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_source_items
    ADD CONSTRAINT ingestion_source_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;


--
-- Name: ingestion_source_items ingestion_source_items_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_source_items
    ADD CONSTRAINT ingestion_source_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.ingestion_sources(id) ON DELETE CASCADE;


--
-- Name: ingestion_sources ingestion_sources_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sources
    ADD CONSTRAINT ingestion_sources_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: ingestion_sources ingestion_sources_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sources
    ADD CONSTRAINT ingestion_sources_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: ingestion_sources ingestion_sources_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sources
    ADD CONSTRAINT ingestion_sources_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE RESTRICT;


--
-- Name: ingestion_sources ingestion_sources_secret_reference_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sources
    ADD CONSTRAINT ingestion_sources_secret_reference_fk FOREIGN KEY (secret_reference) REFERENCES public.ingestion_credentials(id) ON DELETE SET NULL;


--
-- Name: ingestion_sync_runs ingestion_sync_runs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ingestion_sync_runs
    ADD CONSTRAINT ingestion_sync_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.ingestion_sources(id) ON DELETE CASCADE;


--
-- Name: internal_notifications internal_notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.internal_notifications
    ADD CONSTRAINT internal_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: modules modules_parent_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.modules
    ADD CONSTRAINT modules_parent_key_fkey FOREIGN KEY (parent_key) REFERENCES public.modules(key) ON DELETE SET NULL;


--
-- Name: orchestration_approvals orchestration_approvals_execution_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_approvals
    ADD CONSTRAINT orchestration_approvals_execution_fk FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE CASCADE;


--
-- Name: orchestration_approvals orchestration_approvals_node_execution_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_approvals
    ADD CONSTRAINT orchestration_approvals_node_execution_fk FOREIGN KEY (node_execution_id) REFERENCES public.orchestration_node_executions(id) ON DELETE CASCADE;


--
-- Name: orchestration_approvals orchestration_approvals_responded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_approvals
    ADD CONSTRAINT orchestration_approvals_responded_by_fkey FOREIGN KEY (responded_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestration_clarifications orchestration_clarifications_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;


--
-- Name: orchestration_clarifications orchestration_clarifications_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE CASCADE;


--
-- Name: orchestration_clarifications orchestration_clarifications_node_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_node_execution_id_fkey FOREIGN KEY (node_execution_id) REFERENCES public.orchestration_node_executions(id) ON DELETE CASCADE;


--
-- Name: orchestration_clarifications orchestration_clarifications_node_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_node_id_fkey FOREIGN KEY (node_id) REFERENCES public.orchestration_nodes(id) ON DELETE CASCADE;


--
-- Name: orchestration_clarifications orchestration_clarifications_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_clarifications
    ADD CONSTRAINT orchestration_clarifications_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: orchestration_connections orchestration_connections_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_connections
    ADD CONSTRAINT orchestration_connections_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_connections orchestration_connections_source_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_connections
    ADD CONSTRAINT orchestration_connections_source_fk FOREIGN KEY (source_node_id) REFERENCES public.orchestration_nodes(id) ON DELETE CASCADE;


--
-- Name: orchestration_connections orchestration_connections_target_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_connections
    ADD CONSTRAINT orchestration_connections_target_fk FOREIGN KEY (target_node_id) REFERENCES public.orchestration_nodes(id) ON DELETE CASCADE;


--
-- Name: orchestration_embeddings orchestration_embeddings_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_embeddings
    ADD CONSTRAINT orchestration_embeddings_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: orchestration_embeddings orchestration_embeddings_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_embeddings
    ADD CONSTRAINT orchestration_embeddings_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_executions orchestration_executions_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_executions
    ADD CONSTRAINT orchestration_executions_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_node_executions orchestration_node_executions_execution_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_node_executions
    ADD CONSTRAINT orchestration_node_executions_execution_fk FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE CASCADE;


--
-- Name: orchestration_nodes orchestration_nodes_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_nodes
    ADD CONSTRAINT orchestration_nodes_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_triggers orchestration_triggers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestration_triggers orchestration_triggers_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_triggers orchestration_triggers_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestration_triggers orchestration_triggers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_triggers
    ADD CONSTRAINT orchestration_triggers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestration_versions orchestration_versions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_versions
    ADD CONSTRAINT orchestration_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestration_versions orchestration_versions_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestration_versions
    ADD CONSTRAINT orchestration_versions_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: orchestrations orchestrations_company_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_company_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: orchestrations orchestrations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestrations orchestrations_published_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_published_by_fkey FOREIGN KEY (published_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orchestrations orchestrations_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE SET NULL;


--
-- Name: orchestrations orchestrations_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orchestrations
    ADD CONSTRAINT orchestrations_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: processing_jobs processing_jobs_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: processing_jobs processing_jobs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processing_jobs
    ADD CONSTRAINT processing_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE RESTRICT;


--
-- Name: role_module_permissions role_module_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_module_permissions
    ADD CONSTRAINT role_module_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_module_permissions role_module_permissions_module_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_module_permissions
    ADD CONSTRAINT role_module_permissions_module_key_fkey FOREIGN KEY (module_key) REFERENCES public.modules(key) ON DELETE CASCADE;


--
-- Name: role_module_permissions role_module_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_module_permissions
    ADD CONSTRAINT role_module_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_module_permissions role_module_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_module_permissions
    ADD CONSTRAINT role_module_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_topic_permissions role_topic_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_topic_permissions
    ADD CONSTRAINT role_topic_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: role_topic_permissions role_topic_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_topic_permissions
    ADD CONSTRAINT role_topic_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: role_topic_permissions role_topic_permissions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_topic_permissions
    ADD CONSTRAINT role_topic_permissions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: role_topic_permissions role_topic_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_topic_permissions
    ADD CONSTRAINT role_topic_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: roles roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: roles roles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: schedule_executions schedule_executions_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_executions
    ADD CONSTRAINT schedule_executions_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE SET NULL;


--
-- Name: schedule_executions schedule_executions_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_executions
    ADD CONSTRAINT schedule_executions_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: schedule_executions schedule_executions_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedule_executions
    ADD CONSTRAINT schedule_executions_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: step_executions step_executions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_executions
    ADD CONSTRAINT step_executions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT;


--
-- Name: step_executions step_executions_workflow_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_executions
    ADD CONSTRAINT step_executions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.guided_workflow_guides(id) ON DELETE CASCADE;


--
-- Name: step_executions step_executions_workflow_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.step_executions
    ADD CONSTRAINT step_executions_workflow_version_id_fkey FOREIGN KEY (workflow_version_id) REFERENCES public.guided_workflow_guides(id) ON DELETE SET NULL;


--
-- Name: target_app_database_schemas target_app_database_schemas_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_app_database_schemas
    ADD CONSTRAINT target_app_database_schemas_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: target_app_database_schemas target_app_database_schemas_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_app_database_schemas
    ADD CONSTRAINT target_app_database_schemas_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: target_app_database_schemas target_app_database_schemas_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.target_app_database_schemas
    ADD CONSTRAINT target_app_database_schemas_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folders topics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT topics_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: folders topics_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT topics_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: trigger_execution_logs trigger_execution_logs_execution_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_execution_fk FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE SET NULL;


--
-- Name: trigger_execution_logs trigger_execution_logs_execution_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_execution_id_fkey FOREIGN KEY (execution_id) REFERENCES public.orchestration_executions(id) ON DELETE SET NULL;


--
-- Name: trigger_execution_logs trigger_execution_logs_orchestration_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_orchestration_fk FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: trigger_execution_logs trigger_execution_logs_orchestration_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_orchestration_id_fkey FOREIGN KEY (orchestration_id) REFERENCES public.orchestrations(id) ON DELETE CASCADE;


--
-- Name: trigger_execution_logs trigger_execution_logs_trigger_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_trigger_fk FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: trigger_execution_logs trigger_execution_logs_trigger_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.trigger_execution_logs
    ADD CONSTRAINT trigger_execution_logs_trigger_id_fkey FOREIGN KEY (trigger_id) REFERENCES public.orchestration_triggers(id) ON DELETE CASCADE;


--
-- Name: user_company_roles user_company_roles_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_company_roles user_company_roles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_company_roles user_company_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: user_company_roles user_company_roles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_company_roles user_company_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_company_roles
    ADD CONSTRAINT user_company_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_lifecycle_events user_lifecycle_events_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_events
    ADD CONSTRAINT user_lifecycle_events_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;


--
-- Name: user_lifecycle_events user_lifecycle_events_performed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_events
    ADD CONSTRAINT user_lifecycle_events_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_lifecycle_events user_lifecycle_events_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lifecycle_events
    ADD CONSTRAINT user_lifecycle_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_module_permissions user_module_permissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_module_permissions user_module_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_module_permissions user_module_permissions_module_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_module_key_fkey FOREIGN KEY (module_key) REFERENCES public.modules(key) ON DELETE CASCADE;


--
-- Name: user_module_permissions user_module_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_module_permissions user_module_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_module_permissions
    ADD CONSTRAINT user_module_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_target_app_access user_target_app_access_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_target_app_access user_target_app_access_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_target_app_access user_target_app_access_target_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_target_app_id_fkey FOREIGN KEY (target_app_id) REFERENCES public.company_target_applications(id) ON DELETE CASCADE;


--
-- Name: user_target_app_access user_target_app_access_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_target_app_access user_target_app_access_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_target_app_access
    ADD CONSTRAINT user_target_app_access_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_topic_permissions user_topic_permissions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_topic_permissions
    ADD CONSTRAINT user_topic_permissions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_topic_permissions user_topic_permissions_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_topic_permissions
    ADD CONSTRAINT user_topic_permissions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: user_topic_permissions user_topic_permissions_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_topic_permissions
    ADD CONSTRAINT user_topic_permissions_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_topic_permissions user_topic_permissions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_topic_permissions
    ADD CONSTRAINT user_topic_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: users users_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--

--
-- PostgreSQL database dump
--

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: modules; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (1, 'Overview', '/control-panel', 10, '2026-07-08 13:10:01.587413+00', NULL);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (4, 'Content Manager', '/control-panel/content-structure', 50, '2026-07-08 13:10:01.695102+00', NULL);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (6, 'Guided Workflows', '/control-panel/guided-workflows', 45, '2026-07-08 13:10:02.305656+00', NULL);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (10, 'Orchestration Designer', '/control-panel/orchestration-designer', 50, '2026-07-08 13:10:03.136451+00', NULL);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (2, 'Administration', '#', 20, '2026-07-08 13:10:01.587413+00', NULL);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (12, 'Company & Role Setup', '/control-panel/administration/company-role-setup', 21, '2026-07-08 13:57:33.60382+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (3, 'User Management', '/control-panel/administration/user-management', 22, '2026-07-08 13:10:01.587413+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (5, 'AI Configuration', '/control-panel/administration/ai-configuration', 23, '2026-07-08 13:10:02.186083+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (7, 'Workflow Training Setup', '/control-panel/administration/training-setup', 46, '2026-07-08 13:10:03.136451+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (8, 'Workflow Self-healing Review', '/control-panel/administration/self-healing-review', 47, '2026-07-08 13:10:03.136451+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (11, 'Email Credentials', '/control-panel/administration/email-credentials', 70, '2026-07-08 13:10:03.18319+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (13, 'Triggers Monitoring', '/control-panel/triggers-monitoring', 49, '2026-07-08 14:57:46.442839+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (15, 'Chatbot Settings', '/control-panel/administration/chatbot-settings', 51, '2026-07-14 11:00:07.054984+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (14, 'Chatbot Analytics', '/control-panel/administration/search-analytics', 50, '2026-07-13 14:51:01.923978+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (16, 'Database Schema Manager', '/control-panel/administration/database-schema', 55, '2026-07-18 05:23:32.433924+00', 2);
INSERT INTO public.modules (key, name, href, sort_order, created_at, parent_key) VALUES (17, 'Pending AI Plans', '/control-panel/pending-ai-plans', 56, '2026-07-27 10:00:57.161727+00', 2);


--
-- PostgreSQL database dump complete
--

