-- Intent gate telemetry for hybrid action-vs-chat routing and feedback loop.

CREATE TABLE IF NOT EXISTS chatbot_intent_gate_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  message text NOT NULL,
  prefilter_label text NOT NULL CHECK (prefilter_label IN ('action', 'chat', 'uncertain')),
  prefilter_score numeric(5, 4) NOT NULL DEFAULT 0,
  ai_label text CHECK (ai_label IN ('action', 'chat')),
  ai_confidence numeric(5, 4),
  final_label text NOT NULL CHECK (final_label IN ('action', 'chat')),
  low_confidence boolean NOT NULL DEFAULT false,
  reason text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_decisions_company_created_idx
  ON chatbot_intent_gate_decisions (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_decisions_company_target_created_idx
  ON chatbot_intent_gate_decisions (company_id, target_app_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_decisions_user_created_idx
  ON chatbot_intent_gate_decisions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_decisions_low_confidence_idx
  ON chatbot_intent_gate_decisions (low_confidence, created_at DESC);

CREATE TABLE IF NOT EXISTS chatbot_intent_gate_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id uuid NOT NULL REFERENCES chatbot_intent_gate_decisions(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_app_id uuid REFERENCES company_target_applications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (
    feedback_type IN (
      'true_positive',
      'false_positive',
      'false_negative',
      'true_negative',
      'user_override_action',
      'user_override_chat'
    )
  ),
  user_choice text NOT NULL CHECK (user_choice IN ('action', 'chat', 'run_workflow', 'continue_chat')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, user_id)
);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_feedback_company_created_idx
  ON chatbot_intent_gate_feedback (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS chatbot_intent_gate_feedback_feedback_type_idx
  ON chatbot_intent_gate_feedback (feedback_type, created_at DESC);
