ALTER TABLE guided_workflow_recorded_actions
  DROP CONSTRAINT IF EXISTS guided_workflow_recorded_actions_guide_phase_check;

DROP INDEX IF EXISTS guided_workflow_recorded_actions_phase_idx;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'guided_workflow_recorded_actions'
      AND column_name = 'guide_phase'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'guided_workflow_recorded_actions'
        AND column_name = 'is_main_step'
    ) THEN
      ALTER TABLE guided_workflow_recorded_actions
        RENAME COLUMN guide_phase TO is_main_step;
    ELSE
      UPDATE guided_workflow_recorded_actions
      SET is_main_step = CASE
        WHEN guide_phase = 'entry' THEN false
        ELSE true
      END;

      ALTER TABLE guided_workflow_recorded_actions
        DROP COLUMN guide_phase;
    END IF;
  END IF;
END $$;

ALTER TABLE guided_workflow_recorded_actions
  ADD COLUMN IF NOT EXISTS is_main_step boolean;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'guided_workflow_recorded_actions'
      AND column_name = 'is_main_step'
      AND data_type <> 'boolean'
  ) THEN
    ALTER TABLE guided_workflow_recorded_actions
      ALTER COLUMN is_main_step DROP DEFAULT;

    ALTER TABLE guided_workflow_recorded_actions
      ALTER COLUMN is_main_step TYPE boolean
      USING CASE
        WHEN is_main_step::text IN ('main', 'true', 't', '1', 'yes') THEN true
        ELSE false
      END;
  END IF;
END $$;

UPDATE guided_workflow_recorded_actions
SET is_main_step = CASE
  WHEN action_json ? 'isMainStep' THEN (action_json->>'isMainStep')::boolean
  WHEN action_json->>'guidePhase' = 'entry' THEN false
  ELSE COALESCE(is_main_step, true)
END;

UPDATE guided_workflow_recorded_actions
SET action_json = jsonb_set(action_json - 'guidePhase', '{isMainStep}', to_jsonb(is_main_step), true);

ALTER TABLE guided_workflow_recorded_actions
  ALTER COLUMN is_main_step SET DEFAULT true,
  ALTER COLUMN is_main_step SET NOT NULL;

CREATE INDEX IF NOT EXISTS guided_workflow_recorded_actions_main_step_idx
  ON guided_workflow_recorded_actions (recording_session_id, is_main_step, action_index);
