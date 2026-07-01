UPDATE guided_workflow_guides
SET steps_json = COALESCE((
  SELECT jsonb_agg(
    CASE
      WHEN step_item ? 'enabled' THEN step_item
      ELSE jsonb_set(step_item, '{enabled}', 'true'::jsonb, true)
    END
    ORDER BY step_ord
  )
  FROM jsonb_array_elements(steps_json) WITH ORDINALITY AS steps(step_item, step_ord)
), '[]'::jsonb)
WHERE steps_json IS NOT NULL
  AND jsonb_path_exists(steps_json, '$[*] ? (!exists(@.enabled))');
