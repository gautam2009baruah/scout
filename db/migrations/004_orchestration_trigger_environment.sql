-- Email Trigger nodes can now poll different inbox(es) per environment
-- (config.emailCredentialIdsByEnvironment on the trigger node, synced at
-- publish time into one or more orchestration_triggers rows — see
-- lib/orchestrations/db.ts). Each fanned-out row needs to record which
-- environment it's polling for so the poller can match it against the
-- orchestration's released environments, and so a matched email's
-- execution can carry that environment forward as triggerData.environmentId
-- for downstream nodes (e.g. a Notification node picking its own
-- per-environment sender). NULL means the legacy, un-scoped single-inbox
-- row (backward compatible with configs that haven't adopted per-environment
-- inboxes yet).

ALTER TABLE public.orchestration_triggers
  ADD COLUMN environment_id uuid REFERENCES public.target_app_environments(id) ON DELETE CASCADE;

CREATE INDEX orchestration_triggers_environment_idx
  ON public.orchestration_triggers (environment_id);
