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
          SELECT guided_workflow_guides.company_id,
                 guided_workflow_guides.topic_id,
                 guided_workflow_guides.version,
                 guided_workflow_topics.analytics_logging_enabled
          FROM guided_workflow_guides
          LEFT JOIN guided_workflow_topics ON guided_workflow_topics.id = guided_workflow_guides.topic_id
          WHERE guided_workflow_guides.id = $1
        `,
        [event.workflowId]
      );
      const guide = guideResult.rows[0];
      if (!guide || guide.analytics_logging_enabled === false) continue;

      const companyId = guide.company_id;
      const workflowVersionId = event.workflowVersionId || event.workflowId;
      const workflowVersion = event.workflowVersion ?? Number(guide.version ?? 1);
      const healingUsed = event.healingUsed === true || event.eventType === "healing_attempted" || event.eventType === "healing_succeeded";
      const aiUsed = event.aiUsed === true || event.eventType === "ai_provider_called";
      const normalizedUserId = normalizeUserId(event.userId);

      await client.query(
        `
          INSERT INTO workflow_executions (
            id, company_id, workflow_id, workflow_version_id, workflow_version, user_id,
            status, started_at, healing_used, ai_used
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'started', now(), $7, $8)
          ON CONFLICT (id) DO UPDATE
          SET healing_used = workflow_executions.healing_used OR EXCLUDED.healing_used,
              ai_used = workflow_executions.ai_used OR EXCLUDED.ai_used,
              updated_at = now()
        `,
        [event.executionId, companyId, event.workflowId, workflowVersionId, workflowVersion, normalizedUserId, healingUsed, aiUsed]
      );

      if (event.eventType === "workflow_completed" || event.eventType === "workflow_failed" || event.eventType === "workflow_abandoned") {
        const status = event.eventType === "workflow_completed" ? "completed" : event.eventType === "workflow_failed" ? "failed" : "abandoned";
        await client.query(
          `
            UPDATE workflow_executions
            SET status = $2,
                completed_at = now(),
                duration_ms = COALESCE($3, duration_ms),
                healing_used = healing_used OR $4,
                ai_used = ai_used OR $5,
                updated_at = now()
            WHERE id = $1
          `,
          [event.executionId, status, event.durationMs ?? null, healingUsed, aiUsed]
        );
      }

      if (event.stepExecutionId && event.stepId) {
        await client.query(
          `
            INSERT INTO step_executions (
              id, workflow_execution_id, company_id, workflow_id, workflow_version_id,
              step_id, step_order, action_type, status, started_at, healing_used, ai_used
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'started', now(), $9, $10)
            ON CONFLICT (id) DO UPDATE
            SET healing_used = step_executions.healing_used OR EXCLUDED.healing_used,
                ai_used = step_executions.ai_used OR EXCLUDED.ai_used,
                updated_at = now()
          `,
          [event.stepExecutionId, event.executionId, companyId, event.workflowId, workflowVersionId, event.stepId, event.stepOrder ?? null, event.actionType || null, healingUsed, aiUsed]
        );

        if (event.eventType === "step_completed" || event.eventType === "step_failed") {
          await client.query(
            `
              UPDATE step_executions
              SET status = $2,
                  completed_at = now(),
                  duration_ms = COALESCE($3, duration_ms),
                  error_message = COALESCE($4, error_message),
                  healing_used = healing_used OR $5,
                  ai_used = ai_used OR $6,
                  updated_at = now()
              WHERE id = $1
            `,
            [event.stepExecutionId, event.eventType === "step_completed" ? "completed" : "failed", event.durationMs ?? null, event.errorMessage || null, healingUsed, aiUsed]
          );
        }
      }

      await client.query(
        `
          INSERT INTO analytics_events (
            workflow_execution_id, step_execution_id, company_id, workflow_id, workflow_version_id,
            user_id, step_id, action_type, event_type, status, duration_ms, error_message,
            healing_used, ai_used, metadata_json
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
        `,
        [
          event.executionId,
          event.stepExecutionId || null,
          companyId,
          event.workflowId,
          workflowVersionId,
          normalizedUserId,
          event.stepId || null,
          event.actionType || null,
          event.eventType,
          event.status || null,
          event.durationMs ?? null,
          event.errorMessage || null,
          healingUsed,
          aiUsed,
          JSON.stringify(event.metadata ?? {}),
        ]
      );
      recorded += 1;
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
