-- Redirects the tables below to reference company_target_applications(id)
-- directly instead of guided_workflow_target_apps(id). guided_workflow_target_apps
-- is a settings-extension table (recorder allowed-origins + player config) that
-- should only be populated lazily when a guided workflow is actually recorded
-- (see ensureGuidedWorkflowTargetApp in lib/admin/guided-workflows.ts), not
-- eagerly whenever a target app is created.
--
-- Also reverts migration 113's regression on chatbot_action_mode_events, which
-- had (incorrectly) repointed it at guided_workflow_target_apps instead of
-- company_target_applications.

-- Helper: find and drop the existing FK from <table>.<column> to
-- guided_workflow_target_apps(id), regardless of constraint name (migration 055
-- proved at least one uses a non-default name: orchestrations_target_app_fk).
CREATE OR REPLACE FUNCTION _migration_127_drop_gta_fk(p_table text, p_column text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname
  INTO v_conname
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = rel.relnamespace
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY(con.conkey)
  WHERE con.contype = 'f'
    AND ns.nspname = 'public'
    AND rel.relname = p_table
    AND att.attname = p_column
    AND con.confrelid = 'public.guided_workflow_target_apps'::regclass
    AND array_length(con.conkey, 1) = 1;

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_conname);
  END IF;
END;
$$;

-- ============================================================
-- 1) folder_target_apps (NOT NULL, ON DELETE RESTRICT)
-- ============================================================
SELECT _migration_127_drop_gta_fk('folder_target_apps', 'target_app_id');

UPDATE folder_target_apps t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE folder_target_apps
  ADD CONSTRAINT folder_target_apps_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE RESTRICT;

-- ============================================================
-- 2) user_target_app_access (NOT NULL, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('user_target_app_access', 'target_app_id');

UPDATE user_target_app_access t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE user_target_app_access
  ADD CONSTRAINT user_target_app_access_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 3) chatbot_lifecycle_settings (NOT NULL, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('chatbot_lifecycle_settings', 'target_app_id');

UPDATE chatbot_lifecycle_settings t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE chatbot_lifecycle_settings
  ADD CONSTRAINT chatbot_lifecycle_settings_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 4) orchestration_clarifications (nullable, ON DELETE SET NULL)
-- ============================================================
SELECT _migration_127_drop_gta_fk('orchestration_clarifications', 'target_app_id');

UPDATE orchestration_clarifications t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE orchestration_clarifications
  ADD CONSTRAINT orchestration_clarifications_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE SET NULL;

-- ============================================================
-- 5) email_sender_credentials (nullable, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('email_sender_credentials', 'target_app_id');

UPDATE email_sender_credentials t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE email_sender_credentials
  ADD CONSTRAINT email_sender_credentials_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 6) chatbot_api_keys (NOT NULL) — deliberate fix: ON DELETE SET NULL was
--    already impossible on a NOT NULL column; changing to ON DELETE CASCADE.
-- ============================================================
SELECT _migration_127_drop_gta_fk('chatbot_api_keys', 'target_app_id');

UPDATE chatbot_api_keys t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE chatbot_api_keys
  ADD CONSTRAINT chatbot_api_keys_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 7) chatbot_embed_packages (NOT NULL, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('chatbot_embed_packages', 'target_app_id');

UPDATE chatbot_embed_packages t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE chatbot_embed_packages
  ADD CONSTRAINT chatbot_embed_packages_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 8) chatbot_api_key_environments (NOT NULL, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('chatbot_api_key_environments', 'target_app_id');

UPDATE chatbot_api_key_environments t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE chatbot_api_key_environments
  ADD CONSTRAINT chatbot_api_key_environments_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 9) email_credentials (nullable, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('email_credentials', 'target_app_id');

UPDATE email_credentials t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE email_credentials
  ADD CONSTRAINT email_credentials_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 10) chatbot_action_mode_events — revert migration 113's regression.
--     (nullable, ON DELETE SET NULL, back to company_target_applications
--     as originally defined in migration 097)
-- ============================================================
SELECT _migration_127_drop_gta_fk('chatbot_action_mode_events', 'target_app_id');

UPDATE chatbot_action_mode_events t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE chatbot_action_mode_events
  ADD CONSTRAINT chatbot_action_mode_events_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE SET NULL;

-- ============================================================
-- 11) target_app_database_schemas (NOT NULL, ON DELETE CASCADE)
-- ============================================================
SELECT _migration_127_drop_gta_fk('target_app_database_schemas', 'target_app_id');

UPDATE target_app_database_schemas t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE target_app_database_schemas
  ADD CONSTRAINT target_app_database_schemas_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE CASCADE;

-- ============================================================
-- 12) orchestrations (nullable, ON DELETE SET NULL). Original constraint name
--     was the non-default 'orchestrations_target_app_fk' (migration 055) —
--     the helper discovers it dynamically rather than assuming that name.
-- ============================================================
SELECT _migration_127_drop_gta_fk('orchestrations', 'target_app_id');

UPDATE orchestrations t
SET target_app_id = cta.id
FROM guided_workflow_target_apps gta
INNER JOIN company_target_applications cta ON cta.id = gta.target_app_id
WHERE t.target_app_id = gta.id;

ALTER TABLE orchestrations
  ADD CONSTRAINT orchestrations_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE SET NULL;

-- Clean up helper.
DROP FUNCTION _migration_127_drop_gta_fk(text, text);
