/**
 * API route for testing workflow execution from orchestrations
 * GET /api/admin/orchestrations/test-workflow?workflowId=xxx
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeGuidedWorkflow } from "@/lib/guided-workflows/executor";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { workflowId, userId, executionMode, parameters, targetUrl, waitForCompletion } =
      body;

    if (!workflowId) {
      return NextResponse.json(
        { message: "Missing required field: workflowId" },
        { status: 400 }
      );
    }

    // Execute workflow
    const result = await executeGuidedWorkflow({
      workflowId,
      userId: userId || session.user.email,
      executionMode: executionMode || "auto",
      parameters: parameters || {},
      targetUrl,
      notifyUser: false, // For testing, don't notify
    });

    return NextResponse.json({
      success: true,
      execution: result,
    });
  } catch (error) {
    console.error("Error testing workflow execution:", error);
    return NextResponse.json(
      {
        message: "Failed to execute workflow",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    return NextResponse.json({
      message: "Workflow execution test endpoint",
      usage: {
        method: "POST",
        body: {
          workflowId: "required - GUID of the workflow to execute",
          userId: "optional - user ID for execution tracking",
          executionMode: "optional - manual|auto|scheduled (default: auto)",
          parameters: "optional - key-value pairs to pass to workflow",
          targetUrl: "optional - target URL for workflow execution",
        },
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
