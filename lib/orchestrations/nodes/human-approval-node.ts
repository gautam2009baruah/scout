// Human Approval node executor
// Pauses execution and waits for human approval

import type { HumanApprovalNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";
import { createApproval, createNodeExecution } from "../db";
import { sendEmail } from "@/lib/admin/email";

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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(approverEmail)) {
      throw new Error(`Invalid email format: ${approverEmail}`);
    }

    // Prepare approval request data
    const requestData: Record<string, unknown> = {
      title: config.title,
      description: config.description,
      fields: config.fields || [],
      context: { ...context },
    };

    // Create node execution record for this approval step
    const nodeExecutionId = await createNodeExecution({
      executionId,
      nodeId,
      nodeType: "human_approval",
      nodeLabel: config.title,
      status: "running",
      inputContext: context,
      output: null,
    });

    // Create approval record in database
    const approval = await createApproval({
      executionId,
      nodeExecutionId,
      approverEmail,
      requestData,
    });

    // Generate approval URL
    const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/control-panel/approvals/${approval.id}`;

    // Send email notification to approver
    try {
      await sendEmail({
        to: approverEmail,
        subject: `Approval Required: ${config.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Approval Required</h2>
            <h3>${config.title}</h3>
            ${config.description ? `<p>${config.description}</p>` : ""}
            
            ${config.fields && config.fields.length > 0 ? `
              <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0;">Details:</h4>
                <ul style="list-style: none; padding: 0;">
                  ${config.fields
                    .map(
                      (field) => `
                    <li style="margin: 10px 0;">
                      <strong>${field.label}:</strong> 
                      ${evaluateExpression(field.value, context) || field.defaultValue || "N/A"}
                    </li>
                  `
                    )
                    .join("")}
                </ul>
              </div>
            ` : ""}
            
            <div style="margin: 30px 0;">
              <a href="${approvalUrl}" 
                 style="background: #2563eb; color: white; padding: 12px 24px; 
                        text-decoration: none; border-radius: 6px; display: inline-block;">
                Review and Respond
              </a>
            </div>
            
            <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
              This is an automated message from the Scout Orchestration System.
            </p>
          </div>
        `,
      });
    } catch (emailError) {
      console.error("Failed to send approval email:", emailError);
      // Continue execution even if email fails - approval record is created
    }

    // Return paused status to halt execution
    return {
      success: true,
      paused: true,
      output: {
        approvalId: approval.id,
        approvalPending: true,
        approver: approverEmail,
        approvalUrl,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Resume execution after approval
 * This is called by the engine when an approval is received
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
      approvedAt: approvalResponse.respondedAt,
      approvedBy: approvalResponse.respondedByEmail,
      notes: approvalResponse.notes,
    },
  };
}
