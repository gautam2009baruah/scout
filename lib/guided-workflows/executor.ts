/**
 * Guided Workflow Executor for Orchestrations
 * Handles server-side workflow execution and tracking
 */

import { getPool } from "@/lib/db/pool";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";
import type { AdminSession } from "@/lib/admin/auth";
import crypto from "node:crypto";

const fallbackSession: AdminSession = {
  user: {
    id: "system",
    tenantId: "system",
    name: "System",
    email: "system@example.com",
    roleId: "system",
    isAdminRole: true,
    isActive: true,
    mustChangePassword: false,
  },
  tenant: {
    tenantId: "system",
    slug: "system",
    name: "System",
  },
  modules: [],
  expiresAt: new Date(Date.now() + 60_000),
};

export type WorkflowExecutionMode = "manual" | "auto" | "scheduled";

export type WorkflowExecutionOptions = {
  workflowId: string;
  userId?: string;
  executionMode?: WorkflowExecutionMode;
  parameters?: Record<string, unknown>;
  targetUrl?: string;
  timeout?: number;
  notifyUser?: boolean;
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
  const pool = getPool();
  const executionId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  try {
    // Get workflow details
    const workflow = await getGuidedWorkflowById(options.workflowId, fallbackSession);
    if (!workflow) {
      throw new Error(`Workflow not found: ${options.workflowId}`);
    }

    // Check workflow status
    if (workflow.status !== "published") {
      throw new Error(`Workflow is not published: ${workflow.status}`);
    }

    // Create execution record in workflow analytics
    await pool.query(
      `INSERT INTO workflow_analytics 
       (id, execution_id, workflow_id, workflow_version, user_id, event_type, status, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        crypto.randomUUID(),
        executionId,
        workflow.id,
        1, // Version tracking can be enhanced
        options.userId || "orchestration-system",
        "workflow_start",
        "initiated",
        JSON.stringify({
          mode: options.executionMode || "auto",
          parameters: options.parameters,
          targetUrl: options.targetUrl,
          orchestrationTriggered: true,
        }),
      ]
    );

    // Determine execution mode
    if (options.executionMode === "manual" && options.notifyUser && options.userId) {
      // Manual mode: Notify user to execute the workflow
      // This would integrate with notification system
      return {
        success: true,
        executionId,
        workflowId: workflow.id,
        workflowTitle: workflow.title,
        status: "initiated",
        startedAt,
        steps: workflow.steps.length,
        output: {
          message: "Workflow execution initiated. User will be notified.",
          workflowUrl: options.targetUrl || workflow.targetAppName || "",
          requiresUserAction: true,
        },
      };
    }

    // Auto mode: Workflow is ready for immediate execution
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
    // Record failure
    await pool.query(
      `INSERT INTO workflow_analytics 
       (id, execution_id, workflow_id, user_id, event_type, status, error_message, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [
        crypto.randomUUID(),
        executionId,
        options.workflowId,
        options.userId || "orchestration-system",
        "workflow_failed",
        "failed",
        error instanceof Error ? error.message : "Unknown error",
        JSON.stringify({ mode: options.executionMode || "auto" }),
      ]
    );

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
  const workflow = await getGuidedWorkflowById(row.workflow_id, fallbackSession);

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
  return `<script src="/scout-adoption-player.js" data-guide-id="${workflowId}" data-execution-id="${executionId}" data-auto-start="true"></script>`;
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
