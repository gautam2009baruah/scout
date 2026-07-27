-- AI Planner (Step 9): "Allow [requester] to re-run this from chat" checkbox
-- bookkeeping. Purely descriptive/audit metadata — does NOT grant the
-- requester builder/edit access, and does NOT scope future AI Planner
-- matching to only this requester (Step 3b's matching stays company/target-app
-- scoped to any external user, per its own design — see
-- lib/orchestrations/planner/matching.ts).
ALTER TABLE orchestrations
  ADD COLUMN IF NOT EXISTS originating_external_user_id text;

COMMENT ON COLUMN orchestrations.originating_external_user_id IS
  'The external_user_id whose AI Planner request this orchestration was approved from, when the reviewing admin opted to make it re-runnable from chat. Audit/provenance only — confers no access and does not narrow future matching to this specific user.';
