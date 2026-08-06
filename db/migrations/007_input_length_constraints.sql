-- Defense-in-depth limits for user-controlled descriptive fields. NOT VALID
-- keeps deployment compatible with legacy oversized rows while enforcing each
-- constraint for all new and subsequently updated rows.

ALTER TABLE public.companies
  ADD CONSTRAINT companies_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT companies_slug_length_check CHECK (char_length(slug) <= 100) NOT VALID;

ALTER TABLE public.roles
  ADD CONSTRAINT roles_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT roles_description_length_check CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID;

ALTER TABLE public.company_target_applications
  ADD CONSTRAINT company_target_apps_name_length_check CHECK (char_length(name) <= 200) NOT VALID;

ALTER TABLE public.target_app_environments
  ADD CONSTRAINT target_app_environments_name_length_check CHECK (char_length(name) <= 32) NOT VALID,
  ADD CONSTRAINT target_app_environments_normalized_name_length_check CHECK (char_length(normalized_name) <= 32) NOT VALID,
  ADD CONSTRAINT target_app_environments_url_length_check CHECK (char_length(url) <= 2048) NOT VALID;

ALTER TABLE public.users
  ADD CONSTRAINT users_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT users_email_length_check CHECK (char_length(email) <= 320) NOT VALID,
  ADD CONSTRAINT users_employee_code_length_check CHECK (employee_code IS NULL OR char_length(employee_code) <= 100) NOT VALID,
  ADD CONSTRAINT users_phone_length_check CHECK (phone IS NULL OR char_length(phone) <= 50) NOT VALID;

ALTER TABLE public.folders
  ADD CONSTRAINT folders_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT folders_slug_length_check CHECK (char_length(slug) <= 100) NOT VALID,
  ADD CONSTRAINT folders_description_length_check CHECK (description IS NULL OR char_length(description) <= 5000) NOT VALID;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT documents_filename_length_check CHECK (char_length(original_filename) <= 255) NOT VALID,
  ADD CONSTRAINT documents_external_url_length_check CHECK (external_source_url IS NULL OR char_length(external_source_url) <= 2048) NOT VALID;

ALTER TABLE public.guided_workflow_topics
  ADD CONSTRAINT guided_workflow_topics_title_length_check CHECK (char_length(title) <= 200) NOT VALID,
  ADD CONSTRAINT guided_workflow_topics_description_length_check CHECK (char_length(description) <= 5000) NOT VALID;

ALTER TABLE public.guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_title_length_check CHECK (char_length(title) <= 200) NOT VALID,
  ADD CONSTRAINT guided_workflow_guides_description_length_check CHECK (char_length(description) <= 5000) NOT VALID,
  ADD CONSTRAINT guided_workflow_guides_version_notes_length_check CHECK (version_notes IS NULL OR char_length(version_notes) <= 5000) NOT VALID;

ALTER TABLE public.guided_workflow_recording_sessions
  ADD CONSTRAINT guided_workflow_sessions_title_length_check CHECK (char_length(title) <= 200) NOT VALID;

ALTER TABLE public.orchestrations
  ADD CONSTRAINT orchestrations_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT orchestrations_description_length_check CHECK (description IS NULL OR char_length(description) <= 5000) NOT VALID;

ALTER TABLE public.orchestration_nodes
  ADD CONSTRAINT orchestration_nodes_label_length_check CHECK (char_length(label) <= 200) NOT VALID,
  ADD CONSTRAINT orchestration_nodes_display_description_length_check CHECK (display_description IS NULL OR char_length(display_description) <= 2000) NOT VALID;

ALTER TABLE public.orchestration_triggers
  ADD CONSTRAINT orchestration_triggers_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT orchestration_triggers_description_length_check CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID,
  ADD CONSTRAINT orchestration_triggers_endpoint_slug_length_check CHECK (endpoint_slug IS NULL OR char_length(endpoint_slug) <= 100) NOT VALID;

ALTER TABLE public.email_credentials
  ADD CONSTRAINT email_credentials_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT email_credentials_address_length_check CHECK (char_length(email_address) <= 320) NOT VALID,
  ADD CONSTRAINT email_credentials_host_length_check CHECK (imap_host IS NULL OR char_length(imap_host) <= 255) NOT VALID,
  ADD CONSTRAINT email_credentials_description_length_check CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID;

ALTER TABLE public.email_sender_credentials
  ADD CONSTRAINT email_sender_credentials_name_length_check CHECK (char_length(name) <= 200) NOT VALID,
  ADD CONSTRAINT email_sender_credentials_description_length_check CHECK (description IS NULL OR char_length(description) <= 2000) NOT VALID,
  ADD CONSTRAINT email_sender_credentials_from_name_length_check CHECK (from_name IS NULL OR char_length(from_name) <= 200) NOT VALID,
  ADD CONSTRAINT email_sender_credentials_from_email_length_check CHECK (char_length(from_email) <= 320) NOT VALID,
  ADD CONSTRAINT email_sender_credentials_host_length_check CHECK (smtp_host IS NULL OR char_length(smtp_host) <= 255) NOT VALID;

ALTER TABLE public.ingestion_credentials
  ADD CONSTRAINT ingestion_credentials_name_length_check CHECK (char_length(name) <= 200) NOT VALID;

ALTER TABLE public.ingestion_sources
  ADD CONSTRAINT ingestion_sources_name_length_check CHECK (char_length(name) <= 200) NOT VALID;

ALTER TABLE public.target_app_database_schemas
  ADD CONSTRAINT database_schemas_name_length_check CHECK (char_length(database_name) <= 200) NOT VALID,
  ADD CONSTRAINT database_schemas_description_length_check CHECK (database_description IS NULL OR char_length(database_description) <= 5000) NOT VALID;
