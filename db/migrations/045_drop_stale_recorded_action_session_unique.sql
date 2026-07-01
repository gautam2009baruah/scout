DO $$
DECLARE
  stale_constraint text;
BEGIN
  FOR stale_constraint IN
    SELECT con.conname
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'guided_workflow_recorded_actions'
      AND nsp.nspname = current_schema()
      AND con.contype = 'u'
      AND (
        SELECT array_agg(att.attname ORDER BY keys.ordinality)
        FROM unnest(con.conkey) WITH ORDINALITY AS keys(attnum, ordinality)
        INNER JOIN pg_attribute att
          ON att.attrelid = con.conrelid
         AND att.attnum = keys.attnum
      ) = ARRAY['recording_session_id', 'action_index']
  LOOP
    EXECUTE format('ALTER TABLE guided_workflow_recorded_actions DROP CONSTRAINT IF EXISTS %I', stale_constraint);
  END LOOP;
END $$;

DROP INDEX IF EXISTS guided_workflow_recorded_actions_session_idx;

CREATE UNIQUE INDEX IF NOT EXISTS guided_workflow_recorded_actions_topic_action_idx
  ON guided_workflow_recorded_actions (topic_id, action_index);
