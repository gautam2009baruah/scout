DO $$
BEGIN
  IF to_regclass('public.topics') IS NOT NULL AND to_regclass('public.folders') IS NULL THEN
    ALTER TABLE topics RENAME TO folders;
  END IF;
END $$;

ALTER INDEX IF EXISTS topics_pkey RENAME TO folders_pkey;
ALTER INDEX IF EXISTS topics_company_parent_slug_idx RENAME TO folders_company_parent_slug_idx;
ALTER INDEX IF EXISTS topics_parent_idx RENAME TO folders_parent_idx;
ALTER INDEX IF EXISTS topics_company_idx RENAME TO folders_company_idx;

ALTER TABLE IF EXISTS folders RENAME CONSTRAINT topics_company_id_fkey TO folders_company_id_fkey;
ALTER TABLE IF EXISTS folders RENAME CONSTRAINT topics_parent_id_fkey TO folders_parent_id_fkey;
