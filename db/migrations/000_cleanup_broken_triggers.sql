-- ONE-TIME CLEANUP SCRIPT
-- Run this ONCE to fix broken orchestration_triggers table
-- Then run: npm run db:migrate

-- Drop everything related to orchestration triggers
DROP TABLE IF EXISTS trigger_execution_logs CASCADE;
DROP TABLE IF EXISTS orchestration_triggers CASCADE;

-- Drop any orphaned indexes
DROP INDEX IF EXISTS orchestration_triggers_type_idx;
DROP INDEX IF EXISTS orchestration_triggers_orchestration_idx;
DROP INDEX IF EXISTS orchestration_triggers_status_idx;
DROP INDEX IF EXISTS trigger_execution_logs_trigger_idx;
DROP INDEX IF EXISTS trigger_execution_logs_orchestration_idx;
DROP INDEX IF EXISTS trigger_execution_logs_execution_idx;
DROP INDEX IF EXISTS trigger_execution_logs_status_idx;
DROP INDEX IF EXISTS trigger_execution_logs_triggered_at_idx;

-- Drop advanced trigger tables if they exist
DROP TABLE IF EXISTS schedule_executions CASCADE;
DROP TABLE IF EXISTS email_trigger_messages CASCADE;
DROP TABLE IF EXISTS file_upload_trigger_files CASCADE;

SELECT 'Cleanup complete! Now run: npm run db:migrate' as status;
