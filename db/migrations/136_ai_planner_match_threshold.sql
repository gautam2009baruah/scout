-- AI Planner: admin-configurable override for the semantic match confidence
-- threshold (lib/orchestrations/planner/matching.ts's
-- DEFAULT_MATCH_CONFIDENCE_THRESHOLD). NULL means "use the built-in default"
-- — most companies never need to touch this.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS ai_planner_match_confidence_threshold NUMERIC;

COMMENT ON COLUMN companies.ai_planner_match_confidence_threshold IS
  'Admin override for the AI Planner semantic match confidence threshold (0-1). NULL falls back to DEFAULT_MATCH_CONFIDENCE_THRESHOLD in lib/orchestrations/planner/matching.ts.';
