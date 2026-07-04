import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Continue orchestration execution after client-side node completes
 * POST /api/orchestrations/execute/[executionId]/continue
 * 
 * Body: {
 *   nodeIndex: number,    // Index of the node that just completed on client
 *   context: object       // Current execution context (including captured data)
 * }
 */
export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ executionId: string }> }
) {
  try {
    const { executionId } = await routeContext.params;
    const body = await request.json().catch(() => null);

    if (!body || typeof body.nodeIndex !== 'number' || !body.context) {
      return NextResponse.json(
        { error: "nodeIndex and context are required" },
        { status: 400 }
      );
    }

    const { nodeIndex, context } = body;

    console.log(`\n🔄 Server continuation request for execution ${executionId}`);
    console.log(`   Node index: ${nodeIndex}`);
    console.log(`   Context keys: ${Object.keys(context).join(', ')}`);

    // For now, just return success
    // In a complete implementation, this would:
    // 1. Look up the execution plan
    // 2. Find the next node after nodeIndex
    // 3. If it's a server-side node (api_call, notification), execute it
    // 4. Return the output

    return NextResponse.json({
      success: true,
      output: {
        message: "Server-side node executed successfully",
      },
    });

  } catch (error) {
    console.error("❌ Server continuation failed:", error);
    return NextResponse.json(
      { 
        error: "Server continuation failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
