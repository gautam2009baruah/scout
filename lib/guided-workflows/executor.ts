/**
 * Guided Workflow Executor for Orchestrations
 * Handles server-side workflow execution and tracking
 */

import { getPool } from "@/lib/db/pool";
import { getGuidedWorkflowByIdUnscoped, getGuideVersionForNodeEnvironment } from "@/lib/admin/guided-workflows";
import crypto from "node:crypto";

export type WorkflowExecutionOptions = {
  workflowId: string;
  userId?: string;
  parameters?: Record<string, unknown>;
  targetUrl?: string;
  timeout?: number;
  // Execution's resolved environment (chatbot/schedule/http/email-triggered
  // runs only — manual/test runs have none) and the Workflow node's own
  // environment -> "major.build" guide version map. When environmentId is
  // set, the guide's live draft is never used — either the pinned version
  // resolves, or execution fails.
  environmentId?: string;
  guideVersionByEnvironment?: Record<string, string>;
};

export type WorkflowExecutionResult = {
  success: boolean;
  executionId: string;
  workflowId: string;
  workflowTitle: string;
  status: "initiated" | "completed" | "failed" | "timeout";
  startedAt: string;
  completedAt?: string;
  duration?: number;
  steps?: number;
  error?: string;
  output?: Record<string, unknown>;
};

/**
 * Execute a guided workflow
 * For orchestration purposes, this creates an execution record and prepares
 * the workflow for user interaction or automated execution
 */
export async function executeGuidedWorkflow(
  options: WorkflowExecutionOptions
): Promise<WorkflowExecutionResult> {
  const executionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    if (options.environmentId) {
      // Environment known: never fall back to the live draft — either the
      // pinned version resolves, or this fails clearly (no silent mismatch
      // between what's reported here and what the guide actually contains).
      const pinnedKey = options.guideVersionByEnvironment?.[options.environmentId];
      if (!pinnedKey) {
        throw new Error(
          `No guide version selected for this environment on this Workflow node (guide ${options.workflowId}).`
        );
      }

      const [versionMajor, versionBuild] = pinnedKey.split(".").map(Number);
      const pinnedVersion = await getGuideVersionForNodeEnvironment(options.workflowId, versionMajor, versionBuild);
      if (!pinnedVersion) {
        throw new Error(
          `Pinned guide version ${pinnedKey} for this environment was not found (guide ${options.workflowId}) — it may have been pruned or deleted.`
        );
      }

      return {
        success: true,
        executionId,
        workflowId: options.workflowId,
        workflowTitle: pinnedVersion.title,
        status: "initiated",
        startedAt,
        steps: pinnedVersion.steps.length,
        output: {
          guideId: options.workflowId,
          title: pinnedVersion.title,
          description: pinnedVersion.description,
          steps: pinnedVersion.steps.length,
          targetUrl: options.targetUrl || "",
          embedCode: generateEmbedCode(options.workflowId, executionId),
        },
      };
    }

    // No environment known (manual trigger / in-designer test run) — use
    // the guide's live draft, same as before.
    const workflow = await getGuidedWorkflowByIdUnscoped(options.workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${options.workflowId}`);
    }

    // Check workflow status
    if (workflow.status !== "published") {
      throw new Error(`Workflow is not published: ${workflow.status}`);
    }

    // Workflow is ready for immediate execution
    // For client-side workflows, we return the guide configuration
    // The orchestration can then trigger the workflow via embed or API
    return {
      success: true,
      executionId,
      workflowId: workflow.id,
      workflowTitle: workflow.title,
      status: "initiated",
      startedAt,
      steps: workflow.steps.length,
      output: {
        guideId: workflow.id,
        title: workflow.title,
        description: workflow.description,
        steps: workflow.steps.length,
        targetUrl: options.targetUrl || workflow.targetAppName || "",
        embedCode: generateEmbedCode(workflow.id, executionId),
      },
    };
  } catch (error) {
    return {
      success: false,
      executionId,
      workflowId: options.workflowId,
      workflowTitle: "Unknown",
      status: "failed",
      startedAt,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Check workflow execution status
 * Queries analytics to determine if workflow has been completed
 */
export async function getWorkflowExecutionStatus(
  executionId: string
): Promise<WorkflowExecutionResult> {
  const pool = getPool();

  const result = await pool.query(
    `SELECT 
       execution_id,
       workflow_id,
       user_id,
       event_type,
       status,
       duration_ms,
       error_message,
       metadata,
       created_at
     FROM workflow_analytics
     WHERE execution_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [executionId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  const row = result.rows[0];
  const isCompleted = row.event_type === "workflow_completed";
  const isFailed = row.event_type === "workflow_failed";

  // Get workflow details
  const workflow = await getGuidedWorkflowByIdUnscoped(row.workflow_id);

  return {
    success: isCompleted,
    executionId: row.execution_id,
    workflowId: row.workflow_id,
    workflowTitle: workflow?.title || "Unknown",
    status: isCompleted ? "completed" : isFailed ? "failed" : "initiated",
    startedAt: row.created_at,
    duration: row.duration_ms,
    steps: workflow?.steps.length,
    error: row.error_message,
    output: row.metadata,
  };
}

/**
 * Wait for workflow completion with timeout
 * Polls analytics for completion event
 */
export async function waitForWorkflowCompletion(
  executionId: string,
  timeoutMs: number = 300000 // 5 minutes default
): Promise<WorkflowExecutionResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    const status = await getWorkflowExecutionStatus(executionId);

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  // Timeout reached
  return {
    success: false,
    executionId,
    workflowId: "unknown",
    workflowTitle: "Unknown",
    status: "timeout",
    startedAt: new Date(startTime).toISOString(),
    error: "Workflow execution timeout",
  };
}

/**
 * Generate embed code for workflow execution
 */
function generateEmbedCode(workflowId: string, executionId: string): string {
  return `<script src="/scout-smart-adoption-player.js" data-guide-id="${workflowId}" data-execution-id="${executionId}" data-auto-start="true"></script>`;
}

/**
 * Batch execute multiple workflows
 */
export async function executeWorkflowBatch(
  workflows: WorkflowExecutionOptions[]
): Promise<WorkflowExecutionResult[]> {
  const results = await Promise.allSettled(
    workflows.map((options) => executeGuidedWorkflow(options))
  );

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return {
      success: false,
      executionId: crypto.randomUUID(),
      workflowId: workflows[index].workflowId,
      workflowTitle: "Unknown",
      status: "failed" as const,
      startedAt: new Date().toISOString(),
      error: result.reason?.message || "Unknown error",
    };
  });
}
