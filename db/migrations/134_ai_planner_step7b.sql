-- AI Planner (Step 7b): admin "Pending AI plans" approval queue.

-- conversation_id: which chat conversation to notify on approve/reject
-- (populated by app/api/chatbot/ai-planner/route.ts at submission time).
-- draft_orchestration_id: the draft-status orchestration Step 5's converter
-- persisted when an admin first opens this request in the builder — set
-- once and reused so re-opening the same pending request doesn't create
-- duplicate orchestrations.
ALTER TABLE ai_planner_pending_requests
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_orchestration_id uuid REFERENCES orchestrations(id) ON DELETE SET NULL;

INSERT INTO modules (key, name, href, sort_order, parent_key)
VALUES (
  17,
  'Pending AI Plans',
  '/control-panel/pending-ai-plans',
  56,
  2
)
ON CONFLICT (key)
DO UPDATE SET
  name = EXCLUDED.name,
  href = EXCLUDED.href,
  sort_order = EXCLUDED.sort_order,
  parent_key = EXCLUDED.parent_key;

INSERT INTO role_module_permissions (role_id, module_key)
SELECT roles.id, 17
FROM roles
WHERE roles.is_admin_role = true
ON CONFLICT (role_id, module_key)
DO UPDATE SET deleted_at = NULL, updated_at = now();
