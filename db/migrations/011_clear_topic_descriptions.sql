UPDATE topics
SET description = NULL,
    updated_at = now()
WHERE description IS NOT NULL;
