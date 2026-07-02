// Human Approval node executor
// Pauses execution and waits for human approval

import type { HumanApprovalNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";

export async function executeHumanApprovalNode(
  config: HumanApprovalNodeConfig,
  context: Record<string, unknown>,
  executionId: string,
  nodeId: string
): Promise<{
  success: boolean;
  paused?: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    // Evaluate approver email (may contain variable expression)
    const approverEmail = evaluateExpression(config.approverEmail, context);

    if (!approverEmail || typeof approverEmail !== "string") {
      throw new Error("Invalid approver email");
    }

    // Prepare approval request data
    const requestData: Record<string, unknown> = {
      title: config.title,
      description: config.description,
      fields: config.fields || [],
      context: { ...context },
    };

    // In production, this would:
    // 1. Insert approval record into orchestration_approvals table
    // 2. Send notification to approver
    // 3. Return paused=true to pause execution
    // 4. Resume when approval is received

    // For now, return paused status
    return {
      success: true,
      paused: true,
      output: {
        approvalPending: true,
        approver: approverEmail,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Resume execution after approval
 */
export async function resumeAfterApproval(
  approvalResponse: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  outputHandle?: string;
}> {
  const approved = approvalResponse.status === "approved";

  return {
    success: true,
    outputHandle: approved ? "approved" : "rejected",
    output: {
      ...approvalResponse,
      approved,
    },
  };
}
