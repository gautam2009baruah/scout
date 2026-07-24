import { getPool } from "@/lib/db/pool";

export type WorkflowAnalyticsEventType =
  | "workflow_start"
  | "step_start"
  | "step_completed"
  | "step_failed"
  | "workflow_completed"
  | "workflow_failed"
  | "workflow_abandoned"
  | "healing_attempted"
  | "healing_succeeded"
  | "ai_provider_called";

export type WorkflowAnalyticsEventInput = {
  executionId: string;
  stepExecutionId?: string;
  workflowId: string;
  workflowVersionId?: string;
  workflowVersion?: number;
  userId?: string;
  stepId?: string;
  stepOrder?: number;
  actionType?: string;
  eventType: WorkflowAnalyticsEventType;
  status?: string;
  durationMs?: number;
  errorMessage?: string;
  healingUsed?: boolean;
  aiUsed?: boolean;
  metadata?: Record<string, unknown>;
};

export const WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER = "pending";

function normalizeUserId(userId?: string) {
  const trimmed = typeof userId === "string" ? userId.trim() : "";
  return trimmed || WORKFLOW_ANALYTICS_USER_ID_PLACEHOLDER;
}

export async function recordWorkflowAnalyticsEvents(events: WorkflowAnalyticsEventInput[]) {
  const validEvents = events.filter((event) => event.executionId && event.workflowId && event.eventType);
  if (validEvents.length === 0) return { recorded: 0 };

  const client = await getPool().connect();
  let recorded = 0;

  try {
    await client.query("BEGIN");

    for (const event of validEvents) {
      const guideResult = await client.query<{
        company_id: string;
        topic_id: string | null;
        version: number;
        analytics_logging_enabled: boolean | null;
      }>(
        `
          SELECT company_target_applications.company_id,
                 guided_workflow_guides.topic_id,
                 guided_workflow_guides.version,
                 guided_workflow_topics.analytics_logging_enabled
          FROM guided_workflow_guides
          LEFT JOIN guided_workflow_topics ON guided_workflow_topics.id = guided_workflow_guides.topic_id
          LEFT JOIN company_target_applications ON company_target_applications.id = guided_workflow_guides.target_app_id
          WHERE guided_workflow_guides.id = $1
        `,
        [event.workflowId]
      );
      const guide = guideResult.rows[0];
      if (!guide || guide.analytics_logging_enabled === false) continue;

      const companyId = guide.company_id;
      const workflowVersionId = event.workflowVersionId || event.workflowId;
      const healingUsed = event.healingUsed === true || event.eventType === "healing_attempted" || event.eventType === "healing_succeeded";
      const aiUsed = event.aiUsed === true || event.eventType === "ai_provider_called";
      const normalizedUserId = normalizeUserId(event.userId);

      // Only record step executions - all analytics derived from this table
      if (event.stepExecutionId && event.stepId) {
        // Determine step status from event type
        let stepStatus = "started";
        let completedAt: string | null = null;
        let errorMessage: string | null = null;

        if (event.eventType === "step_completed") {
          stepStatus = "completed";
          completedAt = "now()";
        } else if (event.eventType === "step_failed") {
          stepStatus = "failed";
          completedAt = "now()";
          errorMessage = event.errorMessage || null;
        }

        await client.query(
          `
            INSERT INTO step_executions (
              id, workflow_execution_id, company_id, workflow_id, workflow_version_id,
              step_id, step_order, action_type, status, started_at, completed_at, error_message,
              healing_used, ai_used, user_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), ${completedAt ? completedAt : "NULL"}, $10, $11, $12, $13)
            ON CONFLICT (id) DO UPDATE
            SET status = EXCLUDED.status,
                completed_at = COALESCE(EXCLUDED.completed_at, step_executions.completed_at),
                error_message = COALESCE(EXCLUDED.error_message, step_executions.error_message),
                healing_used = step_executions.healing_used OR EXCLUDED.healing_used,
                ai_used = step_executions.ai_used OR EXCLUDED.ai_used,
                user_id = COALESCE(EXCLUDED.user_id, step_executions.user_id),
                updated_at = now()
          `,
          [
            event.stepExecutionId,
            event.executionId,
            companyId,
            event.workflowId,
            workflowVersionId,
            event.stepId,
            event.stepOrder ?? null,
            event.actionType || null,
            stepStatus,
            errorMessage,
            healingUsed,
            aiUsed,
            normalizedUserId,
          ]
        );
        recorded += 1;
      }
    }

    await client.query("COMMIT");
    return { recorded };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
