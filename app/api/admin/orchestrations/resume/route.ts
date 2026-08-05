// API endpoint for resuming paused orchestrations after approval
// Called automatically after an approval is processed

import { NextRequest, NextResponse } from "next/server";
import { getNodes, getConnections, assertExecutionOwnership, OrchestrationAccessError } from "@/lib/orchestrations/db";
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

    // Get the execution and orchestration, scoped to the caller's company
    const { execution, orchestration } = await assertExecutionOwnership(session, executionId);

    // Verify execution is paused
    if (execution.status !== "paused") {
      return NextResponse.json(
        { error: `Execution is ${execution.status}, not paused` },
        { status: 400 }
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
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("Error resuming orchestration:", error);
    return NextResponse.json(
      { error: "Failed to resume orchestration" },
      { status: 500 }
    );
  }
}
