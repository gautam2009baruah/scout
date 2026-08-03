// API route for in-context orchestration execution
// Returns execution plan for client-side execution using Scout Player

import { NextRequest, NextResponse } from "next/server";
import { getOrchestrationById, getNodes, getConnections, createNodeExecution } from "@/lib/orchestrations/db";
import { createTriggerLog, updateTriggerLastTriggered } from "@/lib/orchestrations/triggers";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";
import type { AdminSession } from "@/lib/admin/auth";
import type { OrchestrationNode } from "@/shared/orchestrationTypes";
import type { ExecutionStep } from "@/shared/orchestrationPlayerTypes";

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

// Used only for the chatbot-facing (non-admin) auth path below, to satisfy
// getGuidedWorkflowById's session param the same way lib/guided-workflows/executor.ts does.
const chatbotFallbackSession: AdminSession = {
  user: {
    id: "system",
    tenantId: "system",
    name: "System",
    email: "system@example.com",
    roleId: "system",
    isAdminRole: true,
    isActive: true,
    mustChangePassword: false,
  },
  tenant: { tenantId: "system", slug: "system", name: "System" },
  modules: [],
  availableCompanies: [],
  expiresAt: new Date(Date.now() + 60_000),
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ executionId: string }> }
) {
  const headers = corsHeaders(request);
  try {
    // Await params (Next.js 15+ requirement)
    const { executionId } = await context.params;

    const { orchestrationId, context: executionContext, triggerData } = await request.json();

    // Fetch orchestration details
    const orchestration = await getOrchestrationById(orchestrationId);
    if (!orchestration) {
      return NextResponse.json(
        { error: "Orchestration not found" },
        { status: 404, headers }
      );
    }

    // Chatbot-triggered (external, no admin login) executions authenticate via the
    // same embed API key used for /chat/query, /api/chatbot/intent-gate, etc.
    // Admin-triggered executions (in-context testing from the control panel) keep
    // using the admin session, since that's what layout.tsx's global script serves.
    let session: AdminSession | null = await getCurrentAdminSession();
    if (!session) {
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

      if (triggerData?.companyId && orchestration.companyId !== triggerData.companyId) {
        return NextResponse.json({ error: "Orchestration was not found for this company." }, { status: 404, headers });
      }

      session = chatbotFallbackSession;
    }

    // Fetch nodes and connections
    const nodes = await getNodes(orchestrationId);
    const connections = await getConnections(orchestrationId);

    // Log the trigger node immediately so the triggers-monitoring dashboard has at
    // least one step recorded even before the client finishes running the rest of
    // the plan (which logs its own steps via /continue and /log-step).
    const triggerNode = nodes.find((n) => n.nodeType === "trigger");
    if (triggerNode) {
      await createNodeExecution({
        executionId,
        nodeId: triggerNode.id,
        nodeType: "trigger",
        nodeLabel: triggerNode.label,
        status: "completed",
        output: { trigger: { input: triggerData || {} } },
      });
    }

    // Build execution plan
    const executionPlan = await buildExecutionPlan(nodes, connections, executionContext, triggerData, session);

    const triggerId = typeof triggerData?.triggerId === "string" ? triggerData.triggerId : "";
    const triggerType = typeof triggerData?.triggerType === "string" ? triggerData.triggerType : "";
    if (triggerType === "chatbot" && triggerId) {
      await createTriggerLog({
        triggerId,
        orchestrationId,
        executionId,
        status: "started",
        payload: triggerData || {},
        triggeredBy: typeof triggerData?.userMessage === "string" ? "chatbot" : undefined,
        environmentId: typeof triggerData?.environmentId === "string" ? triggerData.environmentId : undefined,
      });
      await updateTriggerLastTriggered(triggerId);
    }

    return NextResponse.json({
      success: true,
      orchestrationId,
      orchestrationName: orchestration.name,
      executionPlan,
      context: executionContext,
      triggerData,
    }, { headers });

  } catch (error) {
    console.error("❌ In-context execution error:", error);
    return NextResponse.json(
      {
        error: "Execution failed",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500, headers }
    );
  }
}

/**
 * Build execution plan from orchestration nodes
 * Returns array of steps that client can execute
 */
async function buildExecutionPlan(
  nodes: OrchestrationNode[],
  connections: any[],
  context: Record<string, unknown>,
  triggerData: Record<string, unknown>,
  session: any
): Promise<ExecutionStep[]> {
  const steps: ExecutionStep[] = [];

  // Find trigger node (starting point)
  const triggerNode = nodes.find(n => n.nodeType === 'trigger');
  if (!triggerNode) {
    throw new Error("No trigger node found");
  }

  // Traverse graph from trigger node
  const visited = new Set<string>();
  const queue = [triggerNode.id];
  let lastWorkflowGuideData: any = null; // Track last workflow's guide data

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodes.find(n => n.id === nodeId);
    if (!node) continue;

    // Skip only trigger node (start point) in execution plan
    // End node is included so its message can be displayed
    if (node.nodeType === 'trigger') {
      // Add connected nodes to queue
      const outgoing = connections.filter(c => c.sourceNodeId === nodeId);
      outgoing.forEach(c => queue.push(c.targetNodeId));
      continue;
    }

    // Create execution step
    const step: ExecutionStep = {
      id: node.id,
      label: node.label,
      description: node.displayDescription,
      status: 'pending',
      nodeType: node.nodeType, // Include node type for client-side routing
      config: node.config, // Include full config for node execution
    };

    // Add workflow-specific data
    if (node.nodeType === 'workflow' && node.config) {
      const workflowConfig = node.config as any;
      
      // Fetch guide data for workflow
      if (workflowConfig.workflowId) {
        try {
          const guide = await getGuidedWorkflowById(workflowConfig.workflowId, session);
          if (guide?.recordedActions) {
            (step as any).workflowId = workflowConfig.workflowId;
            (step as any).guideData = guide.recordedActions;
            (step as any).triggerPhrases = workflowConfig.triggerPhrases;
            (step as any).matchRequired = workflowConfig.triggerPhrases && workflowConfig.triggerPhrases.length > 0;
            (step as any).inputMapping = workflowConfig.inputMapping; // For auto-fill
            (step as any).timeout = workflowConfig.timeout || 300000; // Default 5 minutes
            
            // Store guide data for next data_capture step
            lastWorkflowGuideData = guide.recordedActions;
          }
        } catch (error) {
          console.error(`Failed to fetch guide for workflow ${workflowConfig.workflowId}:`, error);
        }
      }
    }

    // Add data_capture specific data
    if (node.nodeType === 'data_capture' && node.config) {
      // Pass previous workflow's guide data so data capture knows which fields to capture
      if (lastWorkflowGuideData) {
        (step as any).guideData = lastWorkflowGuideData;
        console.log(`📋 Passing workflow guide data to data_capture step: ${lastWorkflowGuideData.steps?.length || 0} steps`);
      }
      (step as any).config = node.config;
    }

    steps.push(step);

    // Add connected nodes to queue
    const outgoing = connections.filter(c => c.sourceNodeId === nodeId);
    outgoing.forEach(c => queue.push(c.targetNodeId));
  }

  return steps;
}
