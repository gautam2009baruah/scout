-- Consolidated bootstrap migration for a fresh deployment.
-- Replays the schema DDL from the existing migration history and seeds modules.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  is_admin_role boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS roles_global_name_unique
  ON roles (name)
  WHERE company_id IS NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_admin_role boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  name text NOT NULL,
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'disabled')),
  last_login_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_company_id_idx ON users (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_role_id_idx ON users (role_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS companies_created_by_idx ON companies (created_by);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS roles_company_id_idx ON roles (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS roles_created_by_idx ON roles (created_by);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_code text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS can_view_chatbot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS users_company_employee_code_unique
  ON users (company_id, employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_company_status_idx ON users (company_id, status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_company_email_idx ON users (company_id, lower(email));

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_company_name_idx ON users (company_id, lower(name));

CREATE TABLE IF NOT EXISTS IF NOT EXISTS employee_activation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS employee_activation_tokens_user_id_idx
  ON employee_activation_tokens (user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS employee_activation_tokens_expires_at_idx
  ON employee_activation_tokens (expires_at);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS email_outbox_status_created_at_idx
  ON email_outbox (status, created_at);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS companies_deleted_at_idx ON companies (deleted_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS roles_deleted_at_idx ON roles (deleted_at);

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS companies_updated_by_idx ON companies (updated_by);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS roles_updated_by_idx ON roles (updated_by);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS users_updated_by_idx ON users (updated_by);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_admin_role boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS modules (
  key integer PRIMARY KEY,
  name text NOT NULL,
  href text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS role_module_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_key)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS role_module_permissions_module_key_idx
  ON role_module_permissions (module_key);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS user_module_permissions (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key integer NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow', 'deny')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_module_permissions_module_key_idx
  ON user_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_module_permissions_deleted_at_idx
  ON user_module_permissions (deleted_at);

ALTER TABLE role_module_permissions
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS role_module_permissions_deleted_at_idx
  ON role_module_permissions (deleted_at);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS user_company_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_company_roles_company_id_idx
  ON user_company_roles (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_company_roles_role_id_idx
  ON user_company_roles (role_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_company_roles_deleted_at_idx
  ON user_company_roles (deleted_at);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE RESTRICT,
  parent_id uuid REFERENCES topics(id) ON DELETE RESTRICT,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT topics_no_self_parent CHECK (id <> parent_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS topics_company_parent_slug_active_idx
ON topics (company_id, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), slug)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS topics_parent_idx ON topics(parent_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS topics_company_idx ON topics(company_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS role_topic_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS role_topic_permissions_active_idx
ON role_topic_permissions(role_id, topic_id)
WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS user_topic_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS user_topic_permissions_active_idx
ON user_topic_permissions(user_id, topic_id)
WHERE deleted_at IS NULL;

ALTER TABLE topics
ADD COLUMN IF NOT EXISTS role_access_all boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS user_access_all boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_sessions_user_id_idx ON user_sessions (user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_sessions_expires_at_idx ON user_sessions (expires_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS role_module_permissions_module_key_idx
  ON role_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS role_module_permissions_deleted_at_idx
  ON role_module_permissions (deleted_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_module_permissions_module_key_idx
  ON user_module_permissions (module_key);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_module_permissions_deleted_at_idx
  ON user_module_permissions (deleted_at);

ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS is_admin_role boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS roles_company_name_unique
  ON roles (company_id, lower(name))
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS roles_global_name_unique
  ON roles (lower(name))
  WHERE company_id IS NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  name text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('pdf', 'docx', 'txt', 'csv', 'xlsx', 'pptx')),
  mime_type text,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  checksum text NOT NULL,
  storage_path text,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status document_status NOT NULL DEFAULT 'uploaded',
  uploaded_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_company_id_idx ON documents (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_folder_id_idx ON documents (folder_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_status_idx ON documents (status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_file_type_idx ON documents (file_type);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS documents_company_checksum_active_unique
  ON documents (company_id, checksum)
  WHERE status <> 'deleted';

CREATE TABLE IF NOT EXISTS IF NOT EXISTS processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  job_type processing_job_type NOT NULL,
  status processing_job_status NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS processing_jobs_company_id_idx ON processing_jobs (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS processing_jobs_document_id_idx ON processing_jobs (document_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS processing_jobs_status_created_at_idx ON processing_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS processing_jobs_job_type_idx ON processing_jobs (job_type);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS processing_jobs_document_job_type_active_unique
  ON processing_jobs (document_id, job_type)
  WHERE status IN ('pending', 'running', 'retrying');

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_parsed_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  parsed_file_path text NOT NULL,
  page_count integer NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_parsed_contents_company_id_idx
  ON document_parsed_contents (company_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  page_number integer NOT NULL CHECK (page_number > 0),
  character_count integer NOT NULL DEFAULT 0 CHECK (character_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, page_number)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_pages_company_id_idx ON document_pages (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_pages_document_id_idx ON document_pages (document_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  chunk_index integer NOT NULL CHECK (chunk_index >= 0),
  content text NOT NULL,
  page_number integer NOT NULL CHECK (page_number > 0),
  section_title text,
  token_count integer NOT NULL DEFAULT 0 CHECK (token_count >= 0),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_chunks_company_id_idx ON document_chunks (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_chunks_document_id_idx ON document_chunks (document_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_chunks_folder_id_idx ON document_chunks (folder_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_chunks_page_number_idx ON document_chunks (document_id, page_number);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chunk_embeddings_company_id_idx ON chunk_embeddings (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chunk_embeddings_document_id_idx ON chunk_embeddings (document_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chunk_embeddings_chunk_id_idx ON chunk_embeddings (chunk_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (document_id, role_id)
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (document_id, user_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_role_permissions_document_id_idx ON document_role_permissions (document_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_role_permissions_role_id_idx ON document_role_permissions (role_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_user_permissions_document_id_idx ON document_user_permissions (document_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_user_permissions_user_id_idx ON document_user_permissions (user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS folder_document_role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, role_id)
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS folder_document_user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, user_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_document_role_permissions_folder_id_idx ON folder_document_role_permissions (folder_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_document_role_permissions_role_id_idx ON folder_document_role_permissions (role_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_document_user_permissions_folder_id_idx ON folder_document_user_permissions (folder_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_document_user_permissions_user_id_idx ON folder_document_user_permissions (user_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_chunks_content_fts_idx
ON document_chunks
USING gin (to_tsvector('simple', content));

CREATE TABLE IF NOT EXISTS IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  message_count integer NOT NULL DEFAULT 0 CHECK (message_count >= 0),
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS conversation_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_company_id_idx ON conversations (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_user_id_idx ON conversations (user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_status_idx ON conversations (status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_last_message_at_idx ON conversations (last_message_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_created_at_idx ON conversations (created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_company_user_status_last_message_idx
  ON conversations (company_id, user_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversation_messages_company_id_idx ON conversation_messages (company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversation_messages_conversation_id_idx ON conversation_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversation_messages_created_at_idx ON conversation_messages (created_at DESC);

ALTER TABLE chunk_embeddings
  ADD COLUMN IF NOT EXISTS embedding_provider text NOT NULL DEFAULT 'local_bge',
  ADD COLUMN IF NOT EXISTS embedding_dimension integer NOT NULL DEFAULT 384;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS chunk_embeddings_chunk_provider_model_unique
  ON chunk_embeddings (chunk_id, embedding_provider, embedding_model);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ai_provider_config (
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

ALTER TABLE ai_provider_config
  ALTER COLUMN embedding_model SET DEFAULT 'nomic-embed-text',
  ALTER COLUMN embedding_dimension SET DEFAULT 768;

ALTER TABLE ai_provider_config
  ALTER COLUMN llm_model SET DEFAULT 'qwen3:0.6b';

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ai_embedding_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('local_bge', 'openai', 'gemini', 'custom')),
  model text NOT NULL DEFAULT '',
  dimension integer CHECK (dimension IS NULL OR dimension > 0),
  endpoint text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ai_llm_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('ollama', 'openai', 'gemini', 'anthropic', 'custom', 'mock')),
  model text NOT NULL DEFAULT '',
  endpoint text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider)
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_embedding_provider_configs_one_active
  ON ai_embedding_provider_configs (is_active)
  WHERE is_active;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_llm_provider_configs_one_active
  ON ai_llm_provider_configs (is_active)
  WHERE is_active;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS storage_mode document_storage_mode NOT NULL DEFAULT 'managed_upload',
  ADD COLUMN IF NOT EXISTS external_source_url text,
  ADD COLUMN IF NOT EXISTS external_source_reference text,
  ADD COLUMN IF NOT EXISTS source_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_storage_mode_idx ON documents (storage_mode);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_external_source_url_idx ON documents (external_source_url);

ALTER TABLE document_parsed_contents
  ADD COLUMN IF NOT EXISTS retention_mode text NOT NULL DEFAULT 'stored'
  CHECK (retention_mode IN ('stored', 'temporary'));

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_guides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  recorded_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  steps_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_guides_company_status_idx
  ON guided_workflow_guides (company_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_target_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  name text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  allowed_origins_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_target_apps_company_idx
  ON guided_workflow_target_apps (company_id, name);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_recording_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  guide_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  title text NOT NULL,
  status guided_workflow_recording_status NOT NULL DEFAULT 'ready',
  recorder_token_hash text NOT NULL UNIQUE,
  actions_count integer NOT NULL DEFAULT 0 CHECK (actions_count >= 0),
  started_at timestamptz,
  stopped_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recording_sessions_company_idx
  ON guided_workflow_recording_sessions (company_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  recording_session_id uuid NOT NULL REFERENCES guided_workflow_recording_sessions(id) ON DELETE CASCADE,
  action_index integer NOT NULL CHECK (action_index >= 0),
  action_json jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recording_session_id, action_index)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions_session_idx
  ON guided_workflow_recorded_actions (recording_session_id, action_index);

ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recording_session_id uuid REFERENCES guided_workflow_recording_sessions(id) ON DELETE SET NULL;

ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS recorder_config_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_status_check
  CHECK (status IN ('unpublished', 'draft', 'published'));

ALTER TABLE guided_workflow_guides
  ALTER COLUMN status SET DEFAULT 'unpublished';

ALTER TABLE guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_status_check
  CHECK (status IN ('draft', 'published'));

ALTER TABLE guided_workflow_guides
  ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS guide_phase text NOT NULL DEFAULT 'main';

ALTER TABLE guided_workflow_recorded_actions
  ADD CONSTRAINT guided_workflow_recorded_actions_guide_phase_check
  CHECK (guide_phase IN ('entry', 'main'));

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions_phase_idx
  ON guided_workflow_recorded_actions (recording_session_id, guide_phase, action_index);

ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS is_main_step boolean;

ALTER TABLE guided_workflow_recorded_actions
  ALTER COLUMN is_main_step SET DEFAULT true,
  ALTER COLUMN is_main_step SET NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions_main_step_idx
  ON guided_workflow_recorded_actions (recording_session_id, is_main_step, action_index);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  recording_session_id uuid NOT NULL REFERENCES guided_workflow_recording_sessions(id) ON DELETE CASCADE,
  guide_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  recorder_token_hash text NOT NULL UNIQUE,
  recorder_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  actions_count integer NOT NULL DEFAULT 0 CHECK (actions_count >= 0),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_topics_session_order_idx
  ON guided_workflow_topics (recording_session_id, sort_order, created_at);

ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE SET NULL;

ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE CASCADE;

ALTER TABLE guided_workflow_recorded_actions
  ALTER COLUMN topic_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions_topic_action_idx
  ON guided_workflow_recorded_actions (topic_id, action_index);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recorded_actions_topic_action_idx
  ON guided_workflow_recorded_actions (topic_id, action_index);

ALTER TABLE guided_workflow_guides
  ADD COLUMN IF NOT EXISTS pre_workflow_confirmation_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pre_workflow_confirmation_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_suggestions_workflow_status_idx
  ON guided_workflow_healing_suggestions (workflow_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_suggestions_company_pending_idx
  ON guided_workflow_healing_suggestions (company_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_suggestions_step_idx
  ON guided_workflow_healing_suggestions (workflow_id, step_id, status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_audit_workflow_created_idx
  ON guided_workflow_healing_audit (workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_audit_company_created_idx
  ON guided_workflow_healing_audit (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_guides_parent_version_idx
  ON guided_workflow_guides (parent_version_id, version DESC)
  WHERE parent_version_id IS NOT NULL;

ALTER TABLE guided_workflow_healing_suggestions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS healing_suggestions_not_deleted_idx
  ON guided_workflow_healing_suggestions (company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE guided_workflow_healing_audit
  ADD CONSTRAINT guided_workflow_healing_audit_event_type_check
  CHECK (event_type IN ('attempt', 'success', 'failure', 'approved', 'rejected', 'manual_edit', 'deleted'));

ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS analytics_logging_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  workflow_version integer,
  user_id text,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS step_executions (
  id uuid PRIMARY KEY,
  workflow_execution_id uuid NOT NULL REFERENCES workflow_executions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  step_id text NOT NULL,
  step_order integer,
  action_type text,
  status text NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'completed', 'failed', 'abandoned')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  error_message text,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
  step_execution_id uuid REFERENCES step_executions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  workflow_id uuid NOT NULL REFERENCES guided_workflow_guides(id) ON DELETE CASCADE,
  workflow_version_id uuid REFERENCES guided_workflow_guides(id) ON DELETE SET NULL,
  user_id text,
  step_id text,
  action_type text,
  event_type text NOT NULL CHECK (event_type IN (
    'workflow_start',
    'step_start',
    'step_completed',
    'step_failed',
    'workflow_completed',
    'workflow_failed',
    'workflow_abandoned',
    'healing_attempted',
    'healing_succeeded',
    'ai_provider_called'
  )),
  status text,
  duration_ms integer,
  error_message text,
  healing_used boolean NOT NULL DEFAULT false,
  ai_used boolean NOT NULL DEFAULT false,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS workflow_executions_company_started_idx
  ON workflow_executions (company_id, started_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS workflow_executions_workflow_status_idx
  ON workflow_executions (workflow_id, status, started_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS step_executions_workflow_step_status_idx
  ON step_executions (workflow_id, step_id, status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS analytics_events_workflow_type_created_idx
  ON analytics_events (workflow_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS analytics_events_company_created_idx
  ON analytics_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS step_executions_status_started_idx
  ON step_executions (status, started_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS step_executions_workflow_execution_started_idx
  ON step_executions (workflow_execution_id, started_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestrations_company_idx ON orchestrations(company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestrations_status_idx ON orchestrations(status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_nodes_orchestration_idx ON orchestration_nodes(orchestration_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_nodes_type_idx ON orchestration_nodes(node_type);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_connections_orchestration_idx ON orchestration_connections(orchestration_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_connections_source_idx ON orchestration_connections(source_node_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_connections_target_idx ON orchestration_connections(target_node_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_executions_orchestration_idx ON orchestration_executions(orchestration_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_executions_status_idx ON orchestration_executions(status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_executions_started_idx ON orchestration_executions(started_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_node_executions_execution_idx ON orchestration_node_executions(execution_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_node_executions_status_idx ON orchestration_node_executions(status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_node_executions_started_idx ON orchestration_node_executions(started_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_approvals_execution_idx ON orchestration_approvals(execution_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_approvals_approver_idx ON orchestration_approvals(approver_email);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_approvals_status_idx ON orchestration_approvals(status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_versions_orchestration_idx ON orchestration_versions(orchestration_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_versions_version_idx ON orchestration_versions(orchestration_id, version);

ALTER TABLE documents ADD CONSTRAINT documents_file_type_check CHECK (
  file_type IN ('pdf','docx','pptx','xlsx','csv','txt','md','html','json','xml','epub','png','jpg','jpeg','webp','tiff','zip')
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ingestion_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('upload','web_url','crawler','sitemap','rss','google_drive','sharepoint')),
  name text NOT NULL,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_reference uuid,
  sync_cursor text,
  last_synced_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('running','completed','partial','failed')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ingestion_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('running','completed','partial','failed')),
  cursor_before text,
  cursor_after text,
  discovered_count integer NOT NULL DEFAULT 0,
  processed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  error_json jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ingestion_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('google_drive','sharepoint','web')),
  name text NOT NULL,
  auth_type text NOT NULL CHECK (auth_type IN ('oauth_client','service_account','access_token','api_key','basic','anonymous')),
  public_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ciphertext text,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, provider, name)
);

ALTER TABLE ingestion_sources
  ALTER COLUMN secret_reference TYPE uuid USING secret_reference::uuid;

ALTER TABLE ingestion_sources
  ADD CONSTRAINT ingestion_sources_secret_reference_fk
  FOREIGN KEY (secret_reference) REFERENCES ingestion_credentials(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS ingestion_credentials_company_provider_idx ON ingestion_credentials(company_id, provider);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS ingestion_source_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES ingestion_sources(id) ON DELETE CASCADE,
  remote_id text NOT NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  remote_version text,
  content_checksum text,
  source_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at_source timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, remote_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS ingestion_sources_folder_idx ON ingestion_sources(folder_id, enabled);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS ingestion_sync_runs_source_idx ON ingestion_sync_runs(source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS folder_target_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE RESTRICT,
  folder_id uuid NOT NULL REFERENCES topics(id) ON DELETE RESTRICT,
  target_app_id uuid NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (folder_id, target_app_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_target_apps_folder_active_idx
  ON folder_target_apps(folder_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS folder_target_apps_target_active_idx
  ON folder_target_apps(target_app_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_credentials_provider ON email_credentials(provider);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_credentials_active ON email_credentials(is_active);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_triggers_trigger ON webhook_triggers(trigger_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_triggers_token ON webhook_triggers(webhook_token);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_triggers_active ON webhook_triggers(is_active);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_deliveries_orchestration ON webhook_deliveries(orchestration_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_deliveries_execution ON webhook_deliveries(execution_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_cred_target_apps_target 
  ON email_credential_target_apps(target_app_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS company_target_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  base_url text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS company_target_applications_company_idx
  ON company_target_applications (company_id, name)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS company_target_applications_company_name_unique
  ON company_target_applications (company_id, lower(name))
  WHERE deleted_at IS NULL;

ALTER TABLE roles 
ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE roles 
ADD CONSTRAINT roles_company_id_name_unique UNIQUE(company_id, name);

ALTER TABLE roles 
ADD CONSTRAINT fk_roles_company_id FOREIGN KEY (company_id) 
  REFERENCES companies(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_roles_company_id 
  ON roles(company_id);

ALTER TABLE user_company_roles
  ADD CONSTRAINT user_company_roles_role_id_fkey
    FOREIGN KEY (role_id)
    REFERENCES roles(id)
    ON DELETE CASCADE;

ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'inactive', 'deleted'));

CREATE TABLE IF NOT EXISTS IF NOT EXISTS user_lifecycle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('inactivated', 'deleted')),
  from_status TEXT,
  to_status TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_user_lifecycle_events_user
  ON user_lifecycle_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_user_lifecycle_events_company
  ON user_lifecycle_events(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_user_lifecycle_events_performed_by
  ON user_lifecycle_events(performed_by, created_at DESC);

ALTER TABLE user_company_roles
  ADD CONSTRAINT user_company_roles_status_check
  CHECK (status IN ('active', 'inactive'));

ALTER TABLE users
  ADD CONSTRAINT users_status_check
  CHECK (status IN ('active', 'invited', 'deleted'));

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_user_company_roles_status
  ON user_company_roles(company_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE user_module_permissions
  ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE user_module_permissions
  ADD CONSTRAINT user_module_permissions_pkey PRIMARY KEY (user_id, company_id, module_key);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS user_module_permissions_user_company_idx
  ON user_module_permissions (user_id, company_id)
  WHERE deleted_at IS NULL;

ALTER TABLE ai_embedding_provider_configs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE ai_llm_provider_configs
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS ai_embedding_provider_configs_company_idx
  ON ai_embedding_provider_configs (company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS ai_llm_provider_configs_company_idx
  ON ai_llm_provider_configs (company_id)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_embedding_provider_configs_one_primary_per_company
  ON ai_embedding_provider_configs (company_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_llm_provider_configs_one_primary_per_company
  ON ai_llm_provider_configs (company_id)
  WHERE is_primary = true AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_embedding_provider_configs_company_provider_model_unique
  ON ai_embedding_provider_configs (company_id, provider, model)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS ai_llm_provider_configs_company_provider_model_unique
  ON ai_llm_provider_configs (company_id, provider, model)
  WHERE deleted_at IS NULL;

ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS company_target_application_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recording_sessions_company_target_app_idx
  ON guided_workflow_recording_sessions (company_target_application_id);

ALTER TABLE guided_workflow_recording_sessions
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recording_sessions_deleted_idx
  ON guided_workflow_recording_sessions (company_id, deleted_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_topics_deleted_idx
  ON guided_workflow_topics (recording_session_id, deleted_at, sort_order, created_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_recording_sessions_company_target_app_active_idx
  ON guided_workflow_recording_sessions (company_target_application_id, deleted_at, updated_at DESC);

ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS recording_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS guided_workflow_revoked_recorder_tokens (
  token_hash text PRIMARY KEY,
  topic_id uuid REFERENCES guided_workflow_topics(id) ON DELETE CASCADE,
  revoked_reason text NOT NULL DEFAULT 'Recording was halted by an administrator.',
  revoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_revoked_tokens_topic_idx
  ON guided_workflow_revoked_recorder_tokens (topic_id, revoked_at DESC);

ALTER TABLE guided_workflow_revoked_recorder_tokens
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_revoked_tokens_revoked_by_idx
  ON guided_workflow_revoked_recorder_tokens (revoked_by);

ALTER TABLE orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_trigger_type_check
  CHECK (trigger_type IN ('manual', 'chatbot', 'email', 'schedule', 'http_api'));

ALTER TABLE orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_trigger_type_check
  CHECK (trigger_type IN ('manual', 'chatbot', 'email', 'schedule', 'http_api'));

ALTER TABLE orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_status_check
  CHECK (status IN ('active', 'inactive', 'error', 'suspended', 'revoked'));

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_triggers_http_api_slug_uidx
  ON orchestration_triggers (lower(endpoint_slug))
  WHERE trigger_type = 'http_api' AND endpoint_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS api_trigger_request_nonces_expires_idx
  ON api_trigger_request_nonces (expires_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS api_trigger_rate_limit_windows_updated_idx
  ON api_trigger_rate_limit_windows (updated_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_internal_notifications_expires_at
  ON internal_notifications(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_internal_notifications_persistent_until_read
  ON internal_notifications(persistent_until_read)
  WHERE persistent_until_read = TRUE;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_company_created_idx
  ON chat_query_telemetry (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_company_target_created_idx
  ON chat_query_telemetry (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_user_created_idx
  ON chat_query_telemetry (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_status_created_idx
  ON chat_query_telemetry (answer_status, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_conversation_idx
  ON chat_query_telemetry (conversation_id, created_at DESC)
  WHERE conversation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chat_query_feedback (
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

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_feedback_company_created_idx
  ON chat_query_feedback (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_feedback_company_target_created_idx
  ON chat_query_feedback (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_feedback_feedback_created_idx
  ON chat_query_feedback (feedback, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_versions_document_version_idx
  ON document_versions (document_id, version_number DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_versions_company_created_idx
  ON document_versions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_versions_folder_created_idx
  ON document_versions (folder_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_assets_document_version_idx
  ON document_visual_assets (document_id, version_number, page_number);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_assets_company_created_idx
  ON document_visual_assets (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_assets_asset_type_idx
  ON document_visual_assets (asset_type, created_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS document_visual_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  asset_id uuid NOT NULL REFERENCES document_visual_assets(id) ON DELETE CASCADE,
  extracted_text text NOT NULL,
  confidence numeric(4, 3) NOT NULL DEFAULT 0.6,
  citation_preview text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_insights_document_version_idx
  ON document_visual_insights (document_id, version_number, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_insights_company_created_idx
  ON document_visual_insights (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_insights_asset_idx
  ON document_visual_insights (asset_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS document_visual_insights_text_fts_idx
  ON document_visual_insights
  USING gin (to_tsvector('simple', extracted_text));

CREATE INDEX IF NOT EXISTS IF NOT EXISTS documents_company_storage_status_updated_idx
  ON documents (company_id, storage_mode, status, updated_at DESC)
  WHERE status <> 'deleted';

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_api_keys_company_active_idx
  ON chatbot_api_keys (company_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_api_keys_expires_idx
  ON chatbot_api_keys (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chatbot_lifecycle_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  max_context_messages integer NOT NULL DEFAULT 20 CHECK (max_context_messages BETWEEN 10 AND 30),
  max_context_tokens integer NOT NULL DEFAULT 5000 CHECK (max_context_tokens BETWEEN 3000 AND 8000),
  inactivity_timeout_seconds integer NOT NULL DEFAULT 1800 CHECK (inactivity_timeout_seconds BETWEEN 60 AND 604800),
  reset_on_logout_event boolean NOT NULL DEFAULT true,
  reset_on_user_change boolean NOT NULL DEFAULT true,
  reset_on_target_app_change boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_lifecycle_settings_company_target_scope_unique
  ON chatbot_lifecycle_settings (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_lifecycle_settings_company_idx
  ON chatbot_lifecycle_settings (company_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_lifecycle_settings_target_app_idx
  ON chatbot_lifecycle_settings (target_app_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_decisions_company_created_idx
  ON chatbot_intent_gate_decisions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_decisions_company_target_created_idx
  ON chatbot_intent_gate_decisions (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_decisions_user_created_idx
  ON chatbot_intent_gate_decisions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_decisions_low_confidence_idx
  ON chatbot_intent_gate_decisions (low_confidence, created_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES chatbot_intent_gate_decisions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (
    feedback_type IN (
      'true_positive',
      'false_positive',
      'false_negative',
      'true_negative',
      'user_override_action',
      'user_override_chat'
    )
  ),
  user_choice text NOT NULL CHECK (user_choice IN ('action', 'chat', 'run_workflow', 'continue_chat')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, user_id)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_feedback_company_created_idx
  ON chatbot_intent_gate_feedback (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_feedback_feedback_type_idx
  ON chatbot_intent_gate_feedback (feedback_type, created_at DESC);

ALTER TABLE guided_workflow_topics
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS IF NOT EXISTS orchestration_clarifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid NOT NULL REFERENCES orchestration_executions(id) ON DELETE CASCADE,
  node_execution_id uuid NOT NULL REFERENCES orchestration_node_executions(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES orchestration_nodes(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES guided_workflow_target_apps(id) ON DELETE SET NULL,
  output_variable text NOT NULL,
  partial_output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt text NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  response_text text,
  response_json jsonb
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_clarifications_conversation_status_expires_idx
  ON orchestration_clarifications (conversation_id, status, expires_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_clarifications_execution_status_idx
  ON orchestration_clarifications (execution_id, status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS orchestration_clarifications_company_created_idx
  ON orchestration_clarifications (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chatbot_action_mode_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('action_mode_invoked', 'action_mode_auto_reset')),
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_action_mode_events_company_created_idx
  ON chatbot_action_mode_events (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_action_mode_events_user_created_idx
  ON chatbot_action_mode_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_action_mode_events_type_created_idx
  ON chatbot_action_mode_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_sender_credentials_company
  ON email_sender_credentials(company_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_sender_credentials_target_app
  ON email_sender_credentials(target_app_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_sender_credentials_active
  ON email_sender_credentials(company_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS uq_email_sender_primary_per_scope
  ON email_sender_credentials(company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_primary = true AND is_active = true;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_company_env
  ON chatbot_api_keys(company_id, environment);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_status
  ON chatbot_api_keys(status);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS companies_enforce_chatbot_key_environment_idx
  ON companies(enforce_chatbot_key_environment);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_company_environment_active
  ON chatbot_api_keys(company_id, environment)
  WHERE status = 'active' AND is_active = true;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_target_app
  ON chatbot_api_keys(target_app_id);

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chatbot_api_key_environments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  normalized_name text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_key_environments_company
  ON chatbot_api_key_environments(company_id, name);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_last_used_at
  ON chatbot_api_keys(last_used_at);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_strict_environment_enforcement
  ON chatbot_api_keys(strict_environment_enforcement)
  WHERE strict_environment_enforcement = true;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS chatbot_embed_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id UUID NOT NULL REFERENCES guided_workflow_target_apps(id) ON DELETE CASCADE,
  environment VARCHAR(32) NOT NULL,
  api_key_plaintext TEXT NOT NULL,
  api_key_prefix VARCHAR(32) NOT NULL,
  user_id_placeholder VARCHAR(255) NOT NULL,
  scout_url TEXT NOT NULL,
  api_url TEXT NOT NULL,
  assistant_name VARCHAR(255) NOT NULL,
  created_by UUID NULL REFERENCES users(id),
  updated_by UUID NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_embed_packages_company_target_app
  ON chatbot_embed_packages(company_id, target_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_embed_packages_company_environment
  ON chatbot_embed_packages(company_id, environment)
  WHERE deleted_at IS NULL;

ALTER TABLE chatbot_embed_packages
  ADD COLUMN IF NOT EXISTS require_user_guid boolean NOT NULL DEFAULT false;

ALTER TABLE guided_workflow_target_apps
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE guided_workflow_target_apps
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES company_target_applications(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_target_apps_target_app_idx
  ON guided_workflow_target_apps (target_app_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS guided_workflow_target_apps_target_app_active_idx
  ON guided_workflow_target_apps(target_app_id)
  WHERE deleted_at IS NULL;

ALTER TABLE chatbot_api_keys
  ALTER COLUMN target_app_id SET NOT NULL,
  ALTER COLUMN environment_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_target_env_active
  ON chatbot_api_keys(target_app_id, environment_id)
  WHERE status = 'active' AND is_active = true;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_keys_environment_id
  ON chatbot_api_keys(environment_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_target_created_idx
  ON chat_query_telemetry (target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_feedback_target_created_idx
  ON chat_query_feedback (target_app_id, created_at DESC);

ALTER TABLE chatbot_embed_packages
  ALTER COLUMN environment_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_embed_packages_target_app
  ON chatbot_embed_packages(target_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_embed_packages_environment_id
  ON chatbot_embed_packages(environment_id)
  WHERE deleted_at IS NULL;

ALTER TABLE chatbot_lifecycle_settings
  ALTER COLUMN target_app_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_lifecycle_settings_target_scope_unique
  ON chatbot_lifecycle_settings (target_app_id)
  WHERE deleted_at IS NULL;

ALTER TABLE chatbot_api_key_environments
  ADD CONSTRAINT chatbot_api_key_environments_target_app_id_normalized_name_key
  UNIQUE (target_app_id, normalized_name);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_chatbot_api_key_environments_target_app
  ON chatbot_api_key_environments(target_app_id, name);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_credentials_target_app
  ON email_credentials(target_app_id);

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS idx_email_credentials_unique_per_app
  ON email_credentials(company_id, target_app_id, email_address, provider, COALESCE(imap_host, ''))
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_company_external_user_status_last_message_idx
  ON conversations (company_id, external_user_id, status, last_message_at DESC)
  WHERE external_user_id IS NOT NULL;

ALTER TABLE chat_query_telemetry
  ADD COLUMN IF NOT EXISTS external_user_id text;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_external_user_created_idx
  ON chat_query_telemetry (external_user_id, created_at DESC)
  WHERE external_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS conversations_company_external_user_status_last_message_idx
  ON conversations (company_id, external_user_id, status, last_message_at DESC)
  WHERE external_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chat_query_telemetry_external_user_created_idx
  ON chat_query_telemetry (external_user_id, created_at DESC)
  WHERE external_user_id IS NOT NULL;

ALTER TABLE chat_query_feedback
  ADD CONSTRAINT chat_query_feedback_query_id_external_user_id_key
  UNIQUE (query_id, external_user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_intent_gate_decisions_external_user_created_idx
  ON chatbot_intent_gate_decisions (external_user_id, created_at DESC);

ALTER TABLE chatbot_intent_gate_feedback
  ADD CONSTRAINT chatbot_intent_gate_feedback_decision_id_external_user_id_key
  UNIQUE (decision_id, external_user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS chatbot_action_mode_events_external_user_created_idx
  ON chatbot_action_mode_events (external_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS target_app_database_schemas_company_idx
  ON target_app_database_schemas (target_app_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS target_app_database_schemas_lookup_idx
  ON target_app_database_schemas (target_app_id, database_name, version DESC)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS IF NOT EXISTS target_app_database_schemas_active_unique
  ON target_app_database_schemas (target_app_id, database_name)
  WHERE is_active = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS IF NOT EXISTS target_app_database_schemas_target_app_idx
  ON target_app_database_schemas (target_app_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS IF NOT EXISTS password_reset_tokens_expires_at_idx
  ON password_reset_tokens (expires_at);

-- Seed the required modules table data for the admin UI.
INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES
  ('home', 'Home', '/admin', 1, NULL),
  ('users', 'Users', '/admin/users', 2, NULL),
  ('roles', 'Roles', '/admin/roles', 3, NULL),
  ('companies', 'Companies', '/admin/companies', 4, NULL)
ON CONFLICT (key) DO NOTHING;
