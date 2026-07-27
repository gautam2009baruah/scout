-- AI Planner (Step 7): the chat entry point.

-- Marks the single pre-built "AI Planner" orchestration per company/target
-- app so it can be identified reliably (not by name-matching, which an
-- admin could rename) when the chatbot orchestrations list is built and
-- when deciding whether to route a chat message through the dedicated
-- /api/chatbot/ai-planner flow instead of the normal workflow-router.
ALTER TABLE orchestrations
  ADD COLUMN IF NOT EXISTS is_ai_planner boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS orchestrations_one_ai_planner_per_scope
  ON orchestrations (company_id, COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE is_ai_planner = true;

-- Holds PlannerAgent's in-progress PlannerState across chat turns, keyed by
-- conversation. Deliberately separate from orchestration_executions (this
-- isn't a graph execution) and from conversation_messages.metadata_json
-- (that's per-message audit data, not authoritative resumable state). A
-- null/absent row means "no AI Planner conversation in progress" for that
-- conversation id.
CREATE TABLE IF NOT EXISTS ai_planner_sessions (
  conversation_id uuid PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  state jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_planner_sessions_external_user_idx
  ON ai_planner_sessions (company_id, external_user_id);

-- The pending-approval queue Step 7b's admin UI will read from. Step 7 only
-- creates rows here (on draft submission) and reads them (for the
-- pending-request lock); approve/reject actions are Step 7b/8's job.
CREATE TABLE IF NOT EXISTS ai_planner_pending_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE CASCADE,
  external_user_id text NOT NULL,
  request_text text NOT NULL,
  draft_plan jsonb NOT NULL,
  plan_summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  rejection_reason text
);

CREATE INDEX IF NOT EXISTS ai_planner_pending_requests_company_idx
  ON ai_planner_pending_requests (company_id, status);

-- The pending-request lock (Step 7's UI-level disable + Step 8's later
-- service-layer hardening both rely on this): at most one PENDING request
-- per requester per company. A partial unique index makes the guarantee
-- structural, not just application-checked.
CREATE UNIQUE INDEX IF NOT EXISTS ai_planner_pending_requests_one_active_per_user
  ON ai_planner_pending_requests (company_id, external_user_id)
  WHERE status = 'pending';
