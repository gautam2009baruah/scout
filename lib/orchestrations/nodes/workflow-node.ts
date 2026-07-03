// Workflow node executor
// Executes an existing Scout guided workflow

import type { WorkflowNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";
import {
  executeGuidedWorkflow,
  waitForWorkflowCompletion,
  type WorkflowExecutionMode,
} from "@/lib/guided-workflows/executor";
import { executeBrowserWorkflow } from "../browser-executor";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";

const fallbackSession = { user: { id: "system" } } as any;

export async function executeWorkflowNode(
  config: WorkflowNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    if (!config.workflowId) {
      throw new Error("Workflow ID is required");
    }

    // Evaluate workflow ID (can be dynamic expression)
    const workflowId =
      typeof config.workflowId === "string"
        ? config.workflowId
        : String(evaluateExpression(config.workflowId, context));

    // Validate workflowId is not empty after evaluation
    if (!workflowId || workflowId.trim() === "") {
      throw new Error(
        `Workflow ID evaluated to empty value. Check your input mapping. Config: ${JSON.stringify(config.workflowId)}, Context keys: ${Object.keys(context).join(", ")}`
      );
    }

    // Validate workflowId looks like a UUID (basic check)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(workflowId)) {
      throw new Error(
        `Invalid workflow ID format: "${workflowId}". Expected UUID format. Available context: ${Object.keys(context).join(", ")}`
      );
    }

    // Evaluate input mappings using expressions
    const workflowInputs: Record<string, unknown> = {};
    if (config.inputMapping) {
      for (const [key, expression] of Object.entries(config.inputMapping)) {
        workflowInputs[key] = evaluateExpression(expression, context);
      }
    }

    // Evaluate target URL if provided
    const targetUrl = config.targetUrl
      ? String(evaluateExpression(config.targetUrl, context))
      : undefined;

    // Determine user ID from context if available
    const userId = context.userId ? String(context.userId) : undefined;

    // **BROWSER AUTOMATION MODE** - If target URL is provided, use automated browser execution
    if (targetUrl) {
      // Get workflow details to access recorded steps
      const workflow = await getGuidedWorkflowById(workflowId, fallbackSession);
      
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      if (workflow.status !== "published") {
        throw new Error(`Workflow is not published: ${workflow.status}`);
      }

      // Execute workflow in automated browser
      const browserResult = await executeBrowserWorkflow({
        workflowId,
        targetUrl,
        steps: workflow.recordedActions || [],
        parameters: workflowInputs,
        timeout: config.timeout || 300000,
        headless: false, // Always visible so user can login if needed
      });

      if (!browserResult.success) {
        if (config.continueOnFailure) {
          return {
            success: true,
            output: {
              error: browserResult.error,
              status: browserResult.status,
              failed: true,
            },
          };
        }
        return { success: false, error: browserResult.error };
      }

      // Map browser execution output
      const output = mapWorkflowOutput(
        {
          executionId: browserResult.executionId,
          workflowId,
          workflowTitle: workflow.title,
          status: browserResult.status,
          output: browserResult.output,
        },
        config.outputMapping
      );

      return { success: true, output };
    }

    // **STANDARD MODE** - No target URL, use existing execution method
    // Execute the guided workflow
    const executionResult = await executeGuidedWorkflow({
      workflowId,
      userId,
      executionMode: (config.executionMode as WorkflowExecutionMode) || "auto",
      parameters: workflowInputs,
      targetUrl,
      timeout: config.timeout,
      notifyUser: config.notifyUser !== false,
    });

    // If configured to wait for completion, poll for status
    if (config.waitForCompletion && executionResult.status === "initiated") {
      const timeout = config.timeout || 300000; // 5 minutes default
      const completionResult = await waitForWorkflowCompletion(
        executionResult.executionId,
        timeout
      );

      // Map completion result outputs
      const output = mapWorkflowOutput(completionResult, config.outputMapping);

      if (completionResult.status === "completed") {
        return { success: true, output };
      }

      if (completionResult.status === "timeout") {
        if (config.continueOnFailure) {
          return {
            success: true,
            output: {
              ...output,
              timeout: true,
              message: "Workflow execution timeout",
            },
          };
        }
        return { success: false, error: "Workflow execution timeout" };
      }

      if (config.continueOnFailure) {
        return {
          success: true,
          output: {
            ...output,
            error: completionResult.error,
            failed: true,
          },
        };
      }

      return { success: false, error: completionResult.error || "Workflow failed" };
    }

    // Not waiting for completion - return immediately with execution info
    const output = mapWorkflowOutput(executionResult, config.outputMapping);
    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (config.continueOnFailure) {
      return {
        success: true,
        output: { error: errorMessage, failed: true },
      };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Map workflow execution result to output variables based on outputMapping config
 */
function mapWorkflowOutput(
  executionResult: {
    executionId: string;
    workflowId: string;
    workflowTitle: string;
    status: string;
    steps?: number;
    duration?: number;
    output?: Record<string, unknown>;
  },
  outputMapping?: Record<string, string>
): Record<string, unknown> {
  const defaultOutput = {
    executionId: executionResult.executionId,
    workflowId: executionResult.workflowId,
    workflowTitle: executionResult.workflowTitle,
    status: executionResult.status,
    steps: executionResult.steps,
    duration: executionResult.duration,
    ...executionResult.output,
  };

  if (!outputMapping || Object.keys(outputMapping).length === 0) {
    return defaultOutput;
  }

  // Map specific output fields to context variables
  const mappedOutput: Record<string, unknown> = {};
  for (const [contextVar, workflowVar] of Object.entries(outputMapping)) {
    const value = defaultOutput[workflowVar as keyof typeof defaultOutput];
    if (value !== undefined) {
      mappedOutput[contextVar] = value;
    }
  }

  // Include unmapped default fields
  return { ...defaultOutput, ...mappedOutput };
}
