// API endpoint for managing orchestration approvals
// Handles approval retrieval and responses (approve/reject)

import { NextRequest, NextResponse } from "next/server";
import {
  getApprovals,
  updateApproval,
  updateNodeExecution,
  getExecutionById,
  assertExecutionOwnership,
  OrchestrationAccessError,
} from "@/lib/orchestrations/db";
import type { ApprovalStatus, OrchestrationApproval } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";
import type { AdminSession } from "@/lib/admin/auth";
import { appendConversationExchange } from "@/lib/chat/conversations";

// approver_email matching alone isn't tenant isolation — the same email can
// be an admin in more than one company. Every approval read/write also
// requires the underlying execution's orchestration to belong to the
// caller's company (and target-app scope), same as /resume already enforces
// via this helper.
async function filterByOwnership(
  session: AdminSession,
  approvals: OrchestrationApproval[]
): Promise<OrchestrationApproval[]> {
  const results = await Promise.all(
    approvals.map(async (approval) => {
      try {
        await assertExecutionOwnership(session, approval.executionId);
        return approval;
      } catch {
        return null;
      }
    })
  );
  return results.filter((approval): approval is OrchestrationApproval => approval !== null);
}

// GET - Get approval by ID or list approvals for current user
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const approvalId = searchParams.get("id");
    const status = searchParams.get("status") as ApprovalStatus | null;
    const pendingOnly = searchParams.get("pendingOnly") === "true";

    // Get approvals for the current user
    const filters: {
      approverEmail: string;
      status?: ApprovalStatus;
    } = {
      approverEmail: session.user.email,
    };

    if (status) {
      filters.status = status;
    } else if (pendingOnly) {
      filters.status = "pending";
    }

    const approvals = await filterByOwnership(session, await getApprovals(filters));

    // If specific approval ID requested, return only that one
    if (approvalId) {
      const approval = approvals.find((a) => a.id === approvalId);
      if (!approval) {
        return NextResponse.json({ error: "Approval not found" }, { status: 404 });
      }
      return NextResponse.json(approval);
    }

    // Return all approvals matching filters
    return NextResponse.json({
      approvals,
      count: approvals.length,
    });
  } catch (error) {
    console.error("Error getting approvals:", error);
    return NextResponse.json(
      { error: "Failed to get approvals" },
      { status: 500 }
    );
  }
}

// POST - Respond to an approval (approve or reject)
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { approvalId, status, responseData, notes } = body;

    if (!approvalId || !status) {
      return NextResponse.json(
        { error: "approvalId and status are required" },
        { status: 400 }
      );
    }

    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json(
        { error: 'status must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    // Get the approval to verify it exists and is pending
    const approvals = await getApprovals({
      approverEmail: session.user.email,
    });
    const approval = approvals.find((a) => a.id === approvalId);

    if (!approval) {
      return NextResponse.json(
        { error: "Approval not found or not assigned to you" },
        { status: 404 }
      );
    }

    try {
      await assertExecutionOwnership(session, approval.executionId);
    } catch (error) {
      if (error instanceof OrchestrationAccessError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      throw error;
    }

    if (approval.status !== "pending") {
      return NextResponse.json(
        { error: `Approval already ${approval.status}` },
        { status: 400 }
      );
    }

    // Update the approval
    const updatedApproval = await updateApproval(approvalId, {
      status,
      responseData: responseData || {},
      notes: notes || null,
      respondedById: session.user.id,
    });

    // Update the node execution status
    await updateNodeExecution(approval.nodeExecutionId, {
      status: status === "approved" ? "completed" : "failed",
      output: {
        approvalStatus: status,
        approvedBy: session.user.email,
        approvedAt: updatedApproval.respondedAt,
        notes,
      },
      errorMessage: status === "rejected" ? "Approval rejected" : null,
    });

    // Get the execution to determine if we should resume
    const execution = await getExecutionById(approval.executionId);
    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 }
      );
    }

    // Resume regardless of outcome — engine.resumeAfterApproval() reads the
    // approval's actual status and walks the matching "approved"/"rejected"
    // branch itself (or completes the run if that branch isn't wired).
    let resumeResult = null;
    if (execution.status === "paused") {
      try {
        // Call resume endpoint internally
        const resumeResponse = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/admin/orchestrations/resume`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: request.headers.get("cookie") || "",
            },
            body: JSON.stringify({
              executionId: approval.executionId,
              approvalId: updatedApproval.id,
            }),
          }
        );

        if (resumeResponse.ok) {
          resumeResult = await resumeResponse.json();
        } else {
          console.error("Failed to resume orchestration:", await resumeResponse.text());
        }
      } catch (resumeError) {
        console.error("Error triggering resume:", resumeError);
        // Don't fail the approval if resume fails - can be retried manually
      }
    }

    // If this run was triggered from a chatbot conversation, the user has no
    // other way to learn the outcome — resuming happens here in the admin
    // portal, not in the chat itself. Post a follow-up message into that
    // conversation, same pattern as the AI-planner approval notification
    // (app/api/admin/orchestrations/planner/pending/[id]/approve/route.ts).
    const triggerData = execution.triggerData as Record<string, unknown> | null;
    const conversationId = typeof triggerData?.conversationId === "string" ? triggerData.conversationId : null;
    const chatCompanyId = typeof triggerData?.companyId === "string" ? triggerData.companyId : null;
    if (triggerData?.triggerType === "chatbot" && conversationId && chatCompanyId && execution.triggeredBy) {
      const resumedStatus = resumeResult?.status as string | undefined;
      const continuation =
        resumedStatus === "completed"
          ? "It finished successfully."
          : resumedStatus === "paused"
            ? "It needs one more approval before it can finish."
            : resumedStatus === "failed"
              ? `It hit an error afterward: ${resumeResult?.error || "unknown error"}.`
              : "";
      const notification = [
        status === "approved"
          ? `Your request was approved by ${session.user.email}.`
          : `Your request was rejected by ${session.user.email}${notes ? `: ${notes}` : "."}`,
        continuation,
      ]
        .filter(Boolean)
        .join(" ");

      try {
        await appendConversationExchange({
          companyId: chatCompanyId,
          userId: execution.triggeredBy,
          conversationId,
          question: "(Approval notification)",
          answer: notification,
          citations: [],
          metadata: { source: "human_approval", approvalId: updatedApproval.id, status },
        });
      } catch (notifyError) {
        console.error("Failed to post approval notification to conversation:", notifyError);
      }
    }

    // Return success with indication to resume if approved
    return NextResponse.json({
      success: true,
      approval: updatedApproval,
      resumed: resumeResult?.success || false,
      executionId: approval.executionId,
      executionStatus: resumeResult?.status || execution.status,
    });
  } catch (error) {
    console.error("Error responding to approval:", error);
    return NextResponse.json(
      { error: "Failed to respond to approval" },
      { status: 500 }
    );
  }
}

// PUT - Update approval status (alias for POST for RESTful compatibility)
export async function PUT(request: NextRequest) {
  return POST(request);
}
