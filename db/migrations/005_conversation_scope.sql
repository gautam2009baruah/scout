-- Bind chatbot conversation context to the target application and
-- environment that authenticated it. Existing rows remain unscoped and are
-- not eligible for scoped chatbot continuation.
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS target_app_id uuid REFERENCES public.company_target_applications(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS environment_id uuid REFERENCES public.target_app_environments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS conversations_tenant_scope_idx
  ON public.conversations (company_id, target_app_id, environment_id, external_user_id, updated_at DESC);

-- Defense-in-depth tenant hierarchy guards. UUID foreign keys alone prove
-- that a parent exists; these triggers also prove it belongs to the same
-- company and that an environment belongs to the selected target app.
CREATE OR REPLACE FUNCTION public.enforce_company_target_environment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  environment_id_value uuid := NULLIF(to_jsonb(NEW) ->> 'environment_id', '')::uuid;
BEGIN
  IF NEW.target_app_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_target_applications cta
    WHERE cta.id = NEW.target_app_id
      AND cta.company_id = NEW.company_id
      AND cta.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'target application does not belong to company' USING ERRCODE = '23514';
  END IF;

  IF environment_id_value IS NOT NULL AND (
    NEW.target_app_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.target_app_environments env
      WHERE env.id = environment_id_value
        AND env.target_app_id = NEW.target_app_id
    )
  ) THEN
    RAISE EXCEPTION 'environment does not belong to target application' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orchestrations_tenant_scope_guard ON public.orchestrations;
CREATE TRIGGER orchestrations_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id ON public.orchestrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();

DROP TRIGGER IF EXISTS ai_embedding_configs_tenant_scope_guard ON public.ai_embedding_provider_configs;
CREATE TRIGGER ai_embedding_configs_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id, environment_id ON public.ai_embedding_provider_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();

DROP TRIGGER IF EXISTS ai_llm_configs_tenant_scope_guard ON public.ai_llm_provider_configs;
CREATE TRIGGER ai_llm_configs_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id, environment_id ON public.ai_llm_provider_configs
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();

DROP TRIGGER IF EXISTS email_credentials_tenant_scope_guard ON public.email_credentials;
CREATE TRIGGER email_credentials_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id ON public.email_credentials
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();

DROP TRIGGER IF EXISTS email_sender_credentials_tenant_scope_guard ON public.email_sender_credentials;
CREATE TRIGGER email_sender_credentials_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id ON public.email_sender_credentials
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();

DROP TRIGGER IF EXISTS conversations_tenant_scope_guard ON public.conversations;
CREATE TRIGGER conversations_tenant_scope_guard
BEFORE INSERT OR UPDATE OF company_id, target_app_id, environment_id ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.enforce_company_target_environment_scope();
