// API route for orchestration execution
// Execute an orchestration manually or via trigger

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  createExecution,
  getExecutions,
  getExecutionById,
  getOrchestrationById,
} from "@/lib/orchestrations/db";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { orchestrationId, triggerData } = body;

    if (!orchestrationId) {
      return NextResponse.json(
        { message: "Missing required field: orchestrationId" },
        { status: 400 }
      );
    }

    // Get orchestration to verify it exists and get version
    const orchestration = await getOrchestrationById(orchestrationId);
    if (!orchestration) {
      return NextResponse.json(
        { message: "Orchestration not found" },
        { status: 404 }
      );
    }

    // Create execution record
    const execution = await createExecution({
      orchestrationId,
      orchestrationVersion: orchestration.version,
      context: {},
      triggerData,
      triggeredBy: session.user.email,
    });

    // TODO: Start execution in background worker
    // For now, return the execution record
    // In production, this would queue the execution or start it in a worker

    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    console.error("Error starting execution:", error);
    return NextResponse.json(
      { message: "Failed to start execution" },
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

    const { searchParams } = request.nextUrl;
    const executionId = searchParams.get("id");
    const orchestrationId = searchParams.get("orchestrationId");

    if (executionId) {
      // Get specific execution
      const execution = await getExecutionById(executionId);
      if (!execution) {
        return NextResponse.json(
          { message: "Execution not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ execution });
    }

    if (orchestrationId) {
      // Get executions for orchestration
      const executions = await getExecutions({ orchestrationId });
      return NextResponse.json({ executions });
    }

    return NextResponse.json(
      { message: "Missing required parameter: id or orchestrationId" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error fetching execution:", error);
    return NextResponse.json(
      { message: "Failed to fetch execution" },
      { status: 500 }
    );
  }
}
