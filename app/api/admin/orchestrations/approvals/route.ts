// API endpoint for managing orchestration approvals
// Handles approval retrieval and responses (approve/reject)

import { NextRequest, NextResponse } from "next/server";
import {
  getApprovals,
  updateApproval,
  updateNodeExecution,
  getExecutionById,
} from "@/lib/orchestrations/db";
import type { ApprovalStatus } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";

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

    const approvals = await getApprovals(filters);

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

    // If approved and execution is paused, trigger resume
    let resumeResult = null;
    if (status === "approved" && execution.status === "paused") {
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
