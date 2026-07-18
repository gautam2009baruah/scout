import { NextRequest, NextResponse } from "next/server";
import { executeConditionNode } from "@/lib/orchestrations/nodes/condition-node";
import { executeVariableNode } from "@/lib/orchestrations/nodes/variable-node";
import { executeNotificationNode } from "@/lib/orchestrations/nodes/notification-node";
import { executeApiCallNode } from "@/lib/orchestrations/nodes/api-call-node";
import { executeDatabaseNode } from "@/lib/orchestrations/nodes/database-node";

export const runtime = "nodejs";

/**
 * Continue orchestration execution after client-side node completes
 * POST /api/orchestrations/execute/[executionId]/continue
 * 
 * Body: {
 *   nodeIndex: number,    // Index of the node in execution plan
 *   step: object,         // Step config with nodeType and config
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

    if (!body || typeof body.nodeIndex !== 'number' || !body.context || !body.step) {
      return NextResponse.json(
        { error: "nodeIndex, step, and context are required" },
        { status: 400 }
      );
    }

    const { nodeIndex, step, context } = body;

    console.log(`\n🔄 [SERVER] Execution request for: ${executionId}`);
    console.log(`   Node index: ${nodeIndex}`);
    console.log(`   Node type: ${step.nodeType}`);
    console.log(`   Context keys: ${Object.keys(context).join(', ')}`);

    let output: any = {};
    
    // Execute server-side node based on type
    switch (step.nodeType) {
      case 'condition':
        console.log('🔀 [SERVER] Executing condition node...');
        const conditionResult = await executeConditionNode(step.config, context);
        console.log('✅ [SERVER] Condition result:', conditionResult);
        output = conditionResult;
        break;
        
      case 'variable':
        console.log('📊 [SERVER] Executing variable node...');
        console.log('📊 [SERVER] Variable config:', JSON.stringify(step.config, null, 2));
        const variableResult = await executeVariableNode(step.config, context);
        console.log('✅ [SERVER] Variable result:', variableResult);
        output = variableResult;
        break;
        
      case 'notification':
        console.log('📧 [SERVER] Executing notification node...');
        output = await executeNotificationNode(step.config, context);
        console.log('✅ [SERVER] Notification result:', output);
        break;

      case 'api_call':
        console.log('🌐 [SERVER] Executing API call node...');
        output = await executeApiCallNode(step.config, context);
        console.log('✅ [SERVER] API call result:', output);
        break;

      case 'database':
        console.log('🗄️ [SERVER] Executing database node...');
        output = await executeDatabaseNode(step.config, context);
        console.log('✅ [SERVER] Database node result:', output);
        break;
        
      default:
        console.warn(`⚠️  [SERVER] Unknown node type: ${step.nodeType}`);
        output = { success: true, message: "Unknown node type" };
    }

    return NextResponse.json({
      success: true,
      output,
    });

  } catch (error) {
    console.error("❌ [SERVER] Execution failed:", error);
    return NextResponse.json(
      { 
        error: "Server execution failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
