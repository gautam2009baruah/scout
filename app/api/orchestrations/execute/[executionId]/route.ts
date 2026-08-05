// API route for in-context orchestration execution
// Returns execution plan for client-side execution using Scout Player

import { NextRequest, NextResponse } from "next/server";
import { getOrchestrationById, getNodes, getConnections, createNodeExecution } from "@/lib/orchestrations/db";
import { createTriggerLog, updateTriggerLastTriggered } from "@/lib/orchestrations/triggers";
import { getGuidedWorkflowById, getGuideVersionForNodeEnvironment } from "@/lib/admin/guided-workflows";
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
// Built per-request from the orchestration's real, already-verified
// companyId — NOT a static "system"/isAdminRole bypass. isAdminRole no
// longer skips company scoping (see lib/admin/guided-workflows.ts's
// accessCondition), so this must present the correct tenant id to pass the
// scoping check honestly, rather than relying on a bypass flag.
function buildFallbackSession(companyId: string): AdminSession {
  return {
    user: {
      id: "system",
      tenantId: companyId,
      name: "System",
      email: "system@example.com",
      roleId: "system",
      isAdminRole: false,
      isActive: true,
      mustChangePassword: false,
    },
    tenant: { tenantId: companyId, slug: "system", name: "System" },
    modules: [],
    availableCompanies: [{ companyId, companyName: "", companySlug: "", roleId: "system", roleName: "", isPrimary: true }],
    expiresAt: new Date(Date.now() + 60_000),
  };
}

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
    if (session) {
      if (session.user.tenantId !== orchestration.companyId) {
        return NextResponse.json({ error: "Orchestration not found" }, { status: 404, headers });
      }
    } else {
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

      // Always compare against the *authenticated* key's own companyId —
      // never a value the caller's own request body happened to include.
      if (orchestration.companyId !== apiKeyRecord.companyId) {
        return NextResponse.json({ error: "Orchestration not found" }, { status: 404, headers });
      }

      session = buildFallbackSession(orchestration.companyId);
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

      if (workflowConfig.workflowId) {
        const environmentId = typeof triggerData?.environmentId === "string" ? triggerData.environmentId : "";

        if (environmentId) {
          // Environment known (chatbot/schedule/http/email-triggered runs):
          // never fall back to the live guide — either the pinned version
          // resolves, or this fails clearly instead of silently using
          // possibly-mismatched live recordings for auto-fill.
          const pinnedKey = workflowConfig.guideVersionByEnvironment?.[environmentId];
          if (!pinnedKey) {
            throw new Error(
              `No guide version selected for this environment on Workflow node "${node.label}" (guide ${workflowConfig.workflowId}).`
            );
          }

          const [versionMajor, versionBuild] = String(pinnedKey).split(".").map(Number);
          const pinnedVersion = await getGuideVersionForNodeEnvironment(workflowConfig.workflowId, versionMajor, versionBuild);
          if (!pinnedVersion) {
            throw new Error(
              `Pinned guide version ${pinnedKey} for Workflow node "${node.label}" was not found — it may have been pruned or deleted.`
            );
          }

          (step as any).workflowId = workflowConfig.workflowId;
          (step as any).guideData = pinnedVersion.recordedActions;
          (step as any).triggerPhrases = workflowConfig.triggerPhrases;
          (step as any).matchRequired = workflowConfig.triggerPhrases && workflowConfig.triggerPhrases.length > 0;
          (step as any).inputMapping = workflowConfig.inputMapping; // For auto-fill
          (step as any).timeout = workflowConfig.timeout || 300000; // Default 5 minutes

          // Store guide data for next data_capture step
          lastWorkflowGuideData = pinnedVersion.recordedActions;
        } else {
          // No environment known (manual trigger / in-designer test run) —
          // use the guide's live draft, same as before.
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
