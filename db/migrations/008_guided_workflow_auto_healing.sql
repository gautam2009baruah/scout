ALTER TABLE public.guided_workflow_guides
  ADD COLUMN allow_auto_healing boolean NOT NULL DEFAULT false;

ALTER TABLE public.guided_workflow_guide_versions
  ADD COLUMN allow_auto_healing boolean NOT NULL DEFAULT false;
