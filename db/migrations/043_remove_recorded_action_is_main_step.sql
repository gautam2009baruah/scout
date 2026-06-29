DROP INDEX IF EXISTS guided_workflow_recorded_actions_main_step_idx;

UPDATE guided_workflow_recorded_actions
SET action_json = action_json - 'isMainStep' - 'guidePhase' - 'continueWhen';

UPDATE guided_workflow_guides
SET
  recorded_actions_json = COALESCE((
    SELECT jsonb_agg(action_item - 'isMainStep' - 'guidePhase' - 'continueWhen' ORDER BY action_ord)
    FROM jsonb_array_elements(recorded_actions_json) WITH ORDINALITY AS actions(action_item, action_ord)
  ), '[]'::jsonb),
  steps_json = COALESCE((
    SELECT jsonb_agg(step_item - 'isMainStep' - 'continueWhen' ORDER BY step_ord)
    FROM jsonb_array_elements(steps_json) WITH ORDINALITY AS steps(step_item, step_ord)
  ), '[]'::jsonb)
WHERE recorded_actions_json IS NOT NULL
   OR steps_json IS NOT NULL;

ALTER TABLE guided_workflow_recorded_actions
  DROP COLUMN IF EXISTS is_main_step;
