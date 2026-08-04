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


-- Promoting a version to a production-flagged environment now prunes old
-- generations (lib/orchestrations/db.ts's pruneOldOrchestrationVersions /
-- lib/admin/guided-workflows.ts's pruneOldGuideVersions): only the promoted
-- major version and the 3 majors before it are kept, unless an older
-- version is still actively pinned by some environment's release, in which
-- case it's kept regardless of age. Pruning is a soft delete — the row and
-- its snapshot/steps are never physically removed, just hidden from version
-- pickers and no longer promotable.

ALTER TABLE public.orchestration_versions
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);

ALTER TABLE public.guided_workflow_guide_versions
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN deleted_by uuid REFERENCES public.users(id);

-- guided_workflow_guide_versions snapshots steps_json/title/description on
-- publish but never recorded_actions_json — the raw recording data_capture
-- steps use for auto-fill matching (see lib/orchestrations/nodes/workflow-node.ts,
-- app/api/orchestrations/execute/[executionId]/route.ts). Pinning a guide
-- version per environment (Workflow node's guideVersionByEnvironment) without
-- also snapshotting recordings would leave auto-fill silently using live,
-- possibly mismatched data even when steps are correctly version-pinned.
--
-- Existing rows default to empty — historical versions predating this simply
-- have no recorded-actions snapshot; only new publishes going forward
-- capture it.

ALTER TABLE public.guided_workflow_guide_versions
  ADD COLUMN recorded_actions_json jsonb NOT NULL DEFAULT '[]'::jsonb;