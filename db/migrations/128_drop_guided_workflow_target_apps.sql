-- Finishes what migration 127 started: guided_workflow_guides.target_app_id was the last
-- remaining FK pointing at guided_workflow_target_apps(id) instead of directly at
-- company_target_applications(id). The table's only real settings column,
-- allowed_origins_json, had no usable edit UI and has been decided against as a feature
-- (trainers are trusted internal employees; per-environment origin allow-lists would force
-- duplicate topics per environment for no real benefit). player_config_json was already dead
-- (no UI ever wrote it, nothing read it). With both gone, the table is pure indirection.

-- ============================================================
-- 1) Backfill any legacy guided_workflow_target_apps.id values that may still be stored in
--    loosely-typed (non-FK-constrained) telemetry columns, before the table disappears.
-- ============================================================
UPDATE chat_query_telemetry t
SET target_app_id = gta.target_app_id
FROM guided_workflow_target_apps gta
WHERE t.target_app_id = gta.id;

UPDATE chat_query_feedback t
SET target_app_id = gta.target_app_id
FROM guided_workflow_target_apps gta
WHERE t.target_app_id = gta.id;

UPDATE chatbot_intent_gate_decisions t
SET target_app_id = gta.target_app_id
FROM guided_workflow_target_apps gta
WHERE t.target_app_id = gta.id;

UPDATE chatbot_intent_gate_feedback t
SET target_app_id = gta.target_app_id
FROM guided_workflow_target_apps gta
WHERE t.target_app_id = gta.id;

-- ============================================================
-- 2) Backfill + repoint guided_workflow_guides.target_app_id directly at
--    company_target_applications(id).
-- ============================================================
ALTER TABLE guided_workflow_guides
  DROP CONSTRAINT guided_workflow_guides_target_app_id_fkey;

UPDATE guided_workflow_guides g
SET target_app_id = gta.target_app_id
FROM guided_workflow_target_apps gta
WHERE g.target_app_id = gta.id;

ALTER TABLE guided_workflow_guides
  ADD CONSTRAINT guided_workflow_guides_target_app_id_fkey
  FOREIGN KEY (target_app_id) REFERENCES company_target_applications(id) ON DELETE SET NULL;

-- ============================================================
-- 3) Drop the now-empty indirection table.
-- ============================================================
DROP TABLE guided_workflow_target_apps;

-- ============================================================
-- 4) Drop redundant company_id columns — all derivable via target_app_id / workflow_id /
--    recording_session_id joins to company_target_applications.
-- ============================================================
ALTER TABLE guided_workflow_guides DROP COLUMN company_id;
CREATE INDEX guided_workflow_guides_target_app_status_idx
  ON guided_workflow_guides (target_app_id, status, updated_at DESC);

ALTER TABLE guided_workflow_topics DROP COLUMN company_id;
ALTER TABLE guided_workflow_healing_audit DROP COLUMN company_id;
ALTER TABLE guided_workflow_healing_suggestions DROP COLUMN company_id;
ALTER TABLE guided_workflow_recorded_actions DROP COLUMN company_id;
