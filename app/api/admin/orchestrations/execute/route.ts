// API route for orchestration execution
// Execute an orchestration manually or via trigger

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import type { OrchestrationExecution } from "@/shared/orchestrationTypes";

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

    // Create execution record
    const execution: OrchestrationExecution = {
      id: crypto.randomUUID(),
      orchestrationId,
      orchestrationVersion: 1,
      status: "running",
      context: {},
      triggerData: triggerData || null,
      startedAt: new Date().toISOString(),
      completedAt: null,
      errorMessage: null,
      currentNodeId: null,
      triggeredBy: session.user.email,
    };

    // Start execution in background
    // In production, this would queue the execution or start it in a worker
    // For now, return the execution record
    
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
      // In production, query from database
      return NextResponse.json({ execution: null });
    }

    if (orchestrationId) {
      // Get executions for orchestration
      // In production, query from database
      return NextResponse.json({ executions: [] });
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
