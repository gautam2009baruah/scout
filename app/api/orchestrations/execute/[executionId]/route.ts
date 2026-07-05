// API route for in-context orchestration execution
// Returns execution plan for client-side execution using Scout Player

import { NextRequest, NextResponse } from "next/server";
import { getOrchestrationById, getNodes, getConnections } from "@/lib/orchestrations/db";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";
import { getCurrentAdminSession } from "@/lib/admin/session";
import type { OrchestrationNode } from "@/shared/orchestrationTypes";
import type { ExecutionStep } from "@/shared/orchestrationPlayerTypes";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    // Await params (Next.js 15+ requirement)
    const { executionId } = await context.params;

    // Verify admin session (for now, execution requires admin access)
    // TODO: Add proper user-level authentication for orchestration execution
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    const { orchestrationId, context: executionContext, triggerData } = await request.json();

    // Fetch orchestration details
    const orchestration = await getOrchestrationById(orchestrationId);
    if (!orchestration) {
      return NextResponse.json(
        { error: "Orchestration not found" },
        { status: 404 }
      );
    }

    // Fetch nodes and connections
    const nodes = await getNodes(orchestrationId);
    const connections = await getConnections(orchestrationId);

    // Build execution plan
    const executionPlan = await buildExecutionPlan(nodes, connections, executionContext, triggerData, session);

    return NextResponse.json({
      success: true,
      orchestrationId,
      orchestrationName: orchestration.name,
      executionPlan,
      context: executionContext,
      triggerData,
    });

  } catch (error) {
    console.error("❌ In-context execution error:", error);
    return NextResponse.json(
      { 
        error: "Execution failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      },
      { status: 500 }
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

    // Skip trigger and end nodes in execution plan
    if (node.nodeType === 'trigger' || node.nodeType === 'end') {
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
            (step as any).targetUrl = extractTargetUrl(guide.recordedActions);
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

/**
 * Extract target URL from recorded actions
 */
function extractTargetUrl(recordedActions: any[]): string | undefined {
  if (!recordedActions || recordedActions.length === 0) {
    return undefined;
  }

  // Find navigate action
  const navigateAction = recordedActions.find((action: any) => action.type === 'navigate');
  if (navigateAction?.url) {
    return navigateAction.url;
  }

  // Extract from first action's URL
  if (recordedActions[0]?.url) {
    try {
      const url = new URL(recordedActions[0].url);
      return url.origin + url.pathname;
    } catch {
      return recordedActions[0].url;
    }
  }

  return undefined;
}
