import { NextRequest, NextResponse } from "next/server";
import { executeConditionNode } from "@/lib/orchestrations/nodes/condition-node";
import { executeVariableNode } from "@/lib/orchestrations/nodes/variable-node";
import { executeNotificationNode } from "@/lib/orchestrations/nodes/notification-node";
import { executeApiCallNode } from "@/lib/orchestrations/nodes/api-call-node";
import { executeDatabaseNode } from "@/lib/orchestrations/nodes/database-node";
import { getExecutionById, getOrchestrationById } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";

export const runtime = "nodejs";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

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
  const headers = corsHeaders(request);
  try {
    const { executionId } = await routeContext.params;
    const body = await request.json().catch(() => null);

    if (!body || typeof body.nodeIndex !== 'number' || !body.context || !body.step) {
      return NextResponse.json(
        { error: "nodeIndex, step, and context are required" },
        { status: 400, headers }
      );
    }

    const { nodeIndex, step, context } = body;

    // Verify the caller is actually allowed to drive this execution — either an
    // admin session (in-context testing from the control panel) or a valid embed
    // API key scoped to the company/target app the execution was created under.
    const execution = await getExecutionById(executionId);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404, headers });
    }

    const session = await getCurrentAdminSession();
    if (!session) {
      const orchestration = await getOrchestrationById(execution.orchestrationId);
      const triggerData = execution.triggerData as Record<string, unknown> | null;
      try {
        await assertChatbotApiKeyAccess(request, {
          companyId: typeof triggerData?.companyId === "string" ? triggerData.companyId : undefined,
          targetAppId: typeof triggerData?.targetAppId === "string" ? triggerData.targetAppId : undefined,
        });
      } catch (error) {
        if (error instanceof ChatbotApiKeyAccessError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode, headers });
        }
        throw error;
      }

      if (!orchestration || (triggerData?.companyId && orchestration.companyId !== triggerData.companyId)) {
        return NextResponse.json({ error: "Execution was not found for this company." }, { status: 404, headers });
      }
    }

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
    }, { headers });

  } catch (error) {
    console.error("❌ [SERVER] Execution failed:", error);
    return NextResponse.json(
      {
        error: "Server execution failed",
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers }
    );
  }
}
