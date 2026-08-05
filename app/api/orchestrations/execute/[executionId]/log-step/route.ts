import { NextRequest, NextResponse } from "next/server";
import { getExecutionById, getOrchestrationById, createNodeExecution } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";
import type { NodeExecutionStatus, NodeType } from "@/shared/orchestrationTypes";

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

const VALID_STATUSES: NodeExecutionStatus[] = ["completed", "failed", "skipped"];

/**
 * Records a node execution for steps the client-side orchestration player runs itself
 * (workflow, data_capture, end) so they show up in the triggers-monitoring dashboard
 * alongside the server-run nodes already logged by the `/continue` route.
 *
 * POST /api/orchestrations/execute/[executionId]/log-step
 * Body: { nodeId, nodeType, nodeLabel, status: 'completed'|'failed'|'skipped', output?, errorMessage? }
 */
export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ executionId: string }> }
) {
  const headers = corsHeaders(request);
  try {
    const { executionId } = await routeContext.params;
    const body = await request.json().catch(() => null);

    if (!body || typeof body.nodeId !== "string" || typeof body.nodeType !== "string" || !VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: "nodeId, nodeType, and a valid status are required" },
        { status: 400, headers }
      );
    }

    const execution = await getExecutionById(executionId);
    if (!execution) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404, headers });
    }

    const orchestration = await getOrchestrationById(execution.orchestrationId);
    if (!orchestration) {
      return NextResponse.json({ error: "Execution not found" }, { status: 404, headers });
    }

    const session = await getCurrentAdminSession();
    if (session) {
      if (session.user.tenantId !== orchestration.companyId) {
        return NextResponse.json({ error: "Execution not found" }, { status: 404, headers });
      }
    } else {
      const triggerData = execution.triggerData as Record<string, unknown> | null;
      let apiKeyRecord;
      try {
        apiKeyRecord = await assertChatbotApiKeyAccess(request, {
          companyId: typeof triggerData?.companyId === "string" ? triggerData.companyId : undefined,
          targetAppId: typeof triggerData?.targetAppId === "string" ? triggerData.targetAppId : undefined,
        });
      } catch (error) {
        if (error instanceof ChatbotApiKeyAccessError) {
          return NextResponse.json({ error: error.message }, { status: error.statusCode, headers });
        }
        throw error;
      }

      if (orchestration.companyId !== apiKeyRecord.companyId) {
        return NextResponse.json({ error: "Execution not found" }, { status: 404, headers });
      }
    }

    await createNodeExecution({
      executionId,
      nodeId: body.nodeId,
      nodeType: body.nodeType as NodeType,
      nodeLabel: typeof body.nodeLabel === "string" ? body.nodeLabel : body.nodeType,
      status: body.status as NodeExecutionStatus,
      output: body.output && typeof body.output === "object" ? body.output : null,
      errorMessage: typeof body.errorMessage === "string" ? body.errorMessage : null,
    });

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error("❌ [SERVER] Failed to log node step:", error);
    return NextResponse.json(
      { error: "Failed to log node step", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500, headers: corsHeaders(request) }
    );
  }
}
