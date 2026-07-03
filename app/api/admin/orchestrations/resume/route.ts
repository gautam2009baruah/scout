// API endpoint for resuming paused orchestrations after approval
// Called automatically after an approval is processed

import { NextRequest, NextResponse } from "next/server";
import { getExecutionById, getOrchestrationById, getNodes, getConnections } from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import { getCurrentAdminSession } from "@/lib/admin/session";

// POST - Resume orchestration execution after approval
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { executionId, approvalId } = body;

    if (!executionId || !approvalId) {
      return NextResponse.json(
        { error: "executionId and approvalId are required" },
        { status: 400 }
      );
    }

    // Get the execution
    const execution = await getExecutionById(executionId);
    if (!execution) {
      return NextResponse.json(
        { error: "Execution not found" },
        { status: 404 }
      );
    }

    // Verify execution is paused
    if (execution.status !== "paused") {
      return NextResponse.json(
        { error: `Execution is ${execution.status}, not paused` },
        { status: 400 }
      );
    }

    // Get orchestration, nodes, and connections
    const orchestration = await getOrchestrationById(execution.orchestrationId);
    if (!orchestration) {
      return NextResponse.json(
        { error: "Orchestration not found" },
        { status: 404 }
      );
    }

    const nodes = await getNodes(orchestration.id);
    const connections = await getConnections(orchestration.id);

    // Create engine and resume
    const engine = new OrchestrationEngine(execution, nodes, connections);
    const result = await engine.resumeAfterApproval(approvalId);

    return NextResponse.json({
      success: result.success,
      status: result.status,
      error: result.error,
      executionId: execution.id,
      orchestrationId: orchestration.id,
    });
  } catch (error) {
    console.error("Error resuming orchestration:", error);
    return NextResponse.json(
      { error: "Failed to resume orchestration" },
      { status: 500 }
    );
  }
}
