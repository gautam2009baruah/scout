import { NextResponse } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { getNodes, getOrchestrationPage, getConnections } from "@/lib/orchestrations/db";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";

export const runtime = "nodejs";

// Topological sort to order nodes by their flow direction
function topologicalSort(
  nodes: Array<{ id: string; nodeType: string }>,
  connections: Array<{ sourceNodeId: string; targetNodeId: string }>
): string[] {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  // Initialize graph and in-degree
  for (const node of nodes) {
    graph.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  // Build graph and calculate in-degrees
  for (const conn of connections) {
    if (nodeMap.has(conn.sourceNodeId) && nodeMap.has(conn.targetNodeId)) {
      graph.get(conn.sourceNodeId)!.push(conn.targetNodeId);
      inDegree.set(conn.targetNodeId, (inDegree.get(conn.targetNodeId) || 0) + 1);
    }
  }

  // Find trigger node (starting point)
  const triggerNode = nodes.find(n => n.nodeType === "trigger");
  if (!triggerNode) return nodes.map(n => n.id);

  // Kahn's algorithm for topological sort starting from trigger
  const queue: string[] = [triggerNode.id];
  const sorted: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    sorted.push(nodeId);

    for (const next of graph.get(nodeId) || []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  // Add any unconnected nodes (shouldn't happen in valid orchestrations)
  for (const node of nodes) {
    if (!visited.has(node.id)) {
      sorted.push(node.id);
    }
  }

  return sorted;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const companyIdentifier = params.get("companyId") || "";
  const userId = params.get("userId") || "";
  const targetAppIdentifier = params.get("targetAppId") || "";

  let companyId = "";
  let targetAppId = "";

  try {
    companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid scoped identifier." }, { status: 400 });
  }

  try {
    await assertScopedTargetAppAccess({ companyId, userId, targetAppId });
    const page = await getOrchestrationPage({
      companyId,
      userId,
      targetAppId,
      status: "published",
      page: 1,
      pageSize: 100
    });

    const orchestrations = (await Promise.all(page.orchestrations.map(async (orchestration) => {
      const nodes = await getNodes(orchestration.id);
      const connections = await getConnections(orchestration.id);
      
      // Filter to only include orchestrations with chatbot trigger
      const triggerNode = nodes.find(n => n.nodeType === "trigger");
      if (!triggerNode) return null;
      
      const triggerConfig = triggerNode.config as Record<string, unknown> | null;
      if (triggerConfig?.triggerType !== "chatbot") return null;
      
      // Sort nodes by topological order (following the flow direction)
      const sortedNodeIds = topologicalSort(
        nodes.map(n => ({ id: n.id, nodeType: n.nodeType })),
        connections
      );
      
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const sortedNodes = sortedNodeIds.map(id => nodeMap.get(id)!).filter(Boolean);
      
      return {
        id: orchestration.id,
        name: orchestration.name,
        description: orchestration.description || "",
        nodes: sortedNodes.map((node) => ({
          id: node.id,
          label: node.label,
          nodeType: node.nodeType,
          description: node.displayDescription
            || (typeof (node.config as Record<string, unknown>).description === "string"
              ? String((node.config as Record<string, unknown>).description)
              : "")
        }))
      };
    }))).filter((o) => o !== null);

    return NextResponse.json({ orchestrations });
  } catch (error) {
    if (error instanceof ScopedTargetAppAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
