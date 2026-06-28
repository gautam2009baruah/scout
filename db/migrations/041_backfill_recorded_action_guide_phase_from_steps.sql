WITH guide_steps AS (
  SELECT
    guided_workflow_guides.recording_session_id,
    step.value->>'actionSourceId' AS action_id,
    step.ordinality::integer AS step_order,
    (step.value->>'startsMainGuide')::boolean AS starts_main_guide
  FROM guided_workflow_guides
  CROSS JOIN LATERAL jsonb_array_elements(guided_workflow_guides.steps_json) WITH ORDINALITY AS step(value, ordinality)
  WHERE guided_workflow_guides.recording_session_id IS NOT NULL
),
main_boundaries AS (
  SELECT recording_session_id, MIN(step_order) AS main_start_order
  FROM guide_steps
  WHERE starts_main_guide IS TRUE
  GROUP BY recording_session_id
),
action_phases AS (
  SELECT
    guide_steps.recording_session_id,
    guide_steps.action_id,
    CASE
      WHEN main_boundaries.main_start_order IS NOT NULL
        AND guide_steps.step_order < main_boundaries.main_start_order THEN 'entry'
      ELSE 'main'
    END AS guide_phase
  FROM guide_steps
  INNER JOIN main_boundaries ON main_boundaries.recording_session_id = guide_steps.recording_session_id
  WHERE guide_steps.action_id IS NOT NULL
)
UPDATE guided_workflow_recorded_actions
SET guide_phase = action_phases.guide_phase,
    action_json = jsonb_set(action_json, '{guidePhase}', to_jsonb(action_phases.guide_phase), true)
FROM action_phases
WHERE guided_workflow_recorded_actions.recording_session_id = action_phases.recording_session_id
  AND guided_workflow_recorded_actions.action_json->>'id' = action_phases.action_id;
