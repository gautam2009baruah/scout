-- Replaces migration 133's mechanism: uniqueness of "the AI Planner drafting
-- entry point" moves from a whole-orchestration boolean flag (set by a
-- silent auto-provisioning stub) to a per-node checkbox inside a new
-- ai_planner node type, scoped additionally by trigger type (not just
-- company/target_app) so e.g. a manual-triggered admin drafting
-- orchestration can coexist with a chatbot-triggered one. Computed by
-- publishOrchestration() in lib/orchestrations/db.ts.

ALTER TABLE orchestrations
  ADD COLUMN IF NOT EXISTS ai_planner_drafting_trigger_type text
  CHECK (ai_planner_drafting_trigger_type IN ('manual', 'chatbot', 'schedule', 'email', 'http_api'));

COMMENT ON COLUMN orchestrations.ai_planner_drafting_trigger_type IS
  'Derived at publish time: the trigger node''s triggerType, iff this graph has exactly one ai_planner node with config.isDraftingEntryPoint = true. NULL otherwise. See publishOrchestration().';

CREATE UNIQUE INDEX IF NOT EXISTS orchestrations_one_ai_planner_drafting_entry_per_scope
  ON orchestrations (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid), ai_planner_drafting_trigger_type)
  WHERE ai_planner_drafting_trigger_type IS NOT NULL;

DROP INDEX IF EXISTS orchestrations_one_ai_planner_per_scope;
ALTER TABLE orchestrations DROP COLUMN IF EXISTS is_ai_planner;

ALTER TABLE companies DROP COLUMN IF EXISTS ai_planner_match_confidence_threshold;
