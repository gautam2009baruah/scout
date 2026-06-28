ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS guide_phase text NOT NULL DEFAULT 'main';

UPDATE guided_workflow_recorded_actions
SET guide_phase = CASE
  WHEN action_json->>'guidePhase' IN ('entry', 'main') THEN action_json->>'guidePhase'
  WHEN action_json->>'stepPurpose' = 'navigation' THEN 'entry'
  ELSE 'main'
END;

ALTER TABLE guided_workflow_recorded_actions
  DROP CONSTRAINT IF EXISTS guided_workflow_recorded_actions_guide_phase_check;

ALTER TABLE guided_workflow_recorded_actions
  ADD CONSTRAINT guided_workflow_recorded_actions_guide_phase_check
  CHECK (guide_phase IN ('entry', 'main'));

CREATE INDEX IF NOT EXISTS guided_workflow_recorded_actions_phase_idx
  ON guided_workflow_recorded_actions (recording_session_id, guide_phase, action_index);
