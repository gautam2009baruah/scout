-- Company ownership is derived through:
-- folder_target_apps.target_app_id
--   -> guided_workflow_target_apps.target_app_id
--   -> company_target_applications.company_id

ALTER TABLE folder_target_apps
  DROP COLUMN IF EXISTS company_id;
