-- Drops company_id from 5 more tables where it's redundant — derivable via
-- target_app_id (-> company_target_applications.company_id), or for
-- orchestration_clarifications, via execution_id -> orchestration_executions
-- -> orchestrations.company_id. Continues the cleanup started in migration
-- 128. Every write path that could previously leave target_app_id null on
-- these tables has been fixed in the same change (see
-- lib/chat/api-key-access.ts's assertChatbotApiKeyAccess, which now returns
-- the API key's own authoritative target_app_id instead of trusting a
-- client-supplied one) — confirmed zero existing NULL target_app_id rows
-- before writing this migration.

-- ============================================================
-- 1) orchestration_clarifications — target_app_id stays nullable (a
--    company-wide orchestration, i.e. target_app_id IS NULL, is a real,
--    intentional state — see the NOT EXISTS check in getOrchestrationPage).
--    company_id is now derived via execution_id -> orchestration_executions
--    -> orchestrations.company_id instead of stored directly.
-- ============================================================
DROP INDEX IF EXISTS orchestration_clarifications_company_created_idx;
ALTER TABLE orchestration_clarifications DROP COLUMN company_id;

-- ============================================================
-- 2) chatbot_action_mode_events — write-only telemetry table, no reader
--    ever filtered by (company_id, created_at), so no replacement index.
-- ============================================================
ALTER TABLE chatbot_action_mode_events ALTER COLUMN target_app_id SET NOT NULL;
DROP INDEX IF EXISTS chatbot_action_mode_events_company_created_idx;
ALTER TABLE chatbot_action_mode_events DROP COLUMN company_id;

-- ============================================================
-- 3) chat_attachments — getChatAttachmentById's tenant-scoped lookup now
--    joins through company_target_applications on target_app_id.
-- ============================================================
ALTER TABLE chat_attachments ALTER COLUMN target_app_id SET NOT NULL;
DROP INDEX IF EXISTS idx_chat_attachments_company;
CREATE INDEX idx_chat_attachments_target_app ON chat_attachments (target_app_id) WHERE deleted_at IS NULL;
ALTER TABLE chat_attachments DROP COLUMN company_id;

-- ============================================================
-- 4) ai_planner_sessions — the (company_id, external_user_id) index had no
--    query backing it (getPlannerSessionState only ever looks up by the
--    conversation_id primary key), so it's dropped without replacement.
-- ============================================================
ALTER TABLE ai_planner_sessions ALTER COLUMN target_app_id SET NOT NULL;
DROP INDEX IF EXISTS ai_planner_sessions_external_user_idx;
ALTER TABLE ai_planner_sessions DROP COLUMN company_id;

-- ============================================================
-- 5) ai_planner_pending_requests — the "one pending AI Plan request per
--    user" lock moves from per-company to per-target-app scope: there is
--    nothing else to key that uniqueness on once company_id is gone. A user
--    can now have simultaneously pending requests in two different target
--    apps of the same company (deliberate, not an oversight — see
--    getActivePendingPlanRequest's updated doc comment).
-- ============================================================
ALTER TABLE ai_planner_pending_requests ALTER COLUMN target_app_id SET NOT NULL;
DROP INDEX IF EXISTS ai_planner_pending_requests_company_idx;
CREATE INDEX ai_planner_pending_requests_target_app_idx ON ai_planner_pending_requests (target_app_id, status);
DROP INDEX ai_planner_pending_requests_one_active_per_user;
CREATE UNIQUE INDEX ai_planner_pending_requests_one_active_per_user
  ON ai_planner_pending_requests (target_app_id, external_user_id)
  WHERE status = 'pending';
ALTER TABLE ai_planner_pending_requests DROP COLUMN company_id;
