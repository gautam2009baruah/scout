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
