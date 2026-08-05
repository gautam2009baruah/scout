// API route for orchestration execution
// Execute an orchestration manually or via trigger

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  createExecution,
  getExecutions,
  assertOrchestrationOwnership,
  assertExecutionOwnership,
  OrchestrationAccessError,
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

    // Verify the orchestration exists and belongs to the caller's company
    const orchestration = await assertOrchestrationOwnership(session, orchestrationId);

    // Create execution record
    const execution = await createExecution({
      orchestrationId,
      orchestrationVersionMajor: orchestration.versionMajor,
      orchestrationVersionBuild: orchestration.versionBuild,
      context: {},
      triggerData,
      triggeredBy: session.user.email,
    });

    // TODO: Start execution in background worker
    // For now, return the execution record
    // In production, this would queue the execution or start it in a worker

    return NextResponse.json({ execution }, { status: 201 });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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
      // Get specific execution, scoped to the caller's company
      const { execution } = await assertExecutionOwnership(session, executionId);
      return NextResponse.json({ execution });
    }

    if (orchestrationId) {
      // Get executions for orchestration, scoped to the caller's company
      await assertOrchestrationOwnership(session, orchestrationId);
      const executions = await getExecutions({ orchestrationId });
      return NextResponse.json({ executions });
    }

    return NextResponse.json(
      { message: "Missing required parameter: id or orchestrationId" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Error fetching execution:", error);
    return NextResponse.json(
      { message: "Failed to fetch execution" },
      { status: 500 }
    );
  }
}
