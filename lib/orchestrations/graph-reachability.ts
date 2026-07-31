// Pure graph-reachability check used by publishOrchestration (see db.ts) to
// reject orchestrations containing a disconnected island of nodes — e.g. a
// second switch/notification pair with no path from the trigger. Kept
// dependency-free so it's unit-testable without a live Postgres instance.

export type ReachabilityNode = { id: string; label: string };
export type ReachabilityConnection = { sourceNodeId: string; targetNodeId: string };

export function findUnreachableNodes(
  nodes: ReachabilityNode[],
  connections: ReachabilityConnection[],
  rootNodeIds: string[]
): ReachabilityNode[] {
  const outgoing = new Map<string, string[]>();
  for (const connection of connections) {
    if (!outgoing.has(connection.sourceNodeId)) {
      outgoing.set(connection.sourceNodeId, []);
    }
    outgoing.get(connection.sourceNodeId)!.push(connection.targetNodeId);
  }

  const reachable = new Set(rootNodeIds);
  const queue = [...reachable];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const nextId of outgoing.get(current) || []) {
      if (!reachable.has(nextId)) {
        reachable.add(nextId);
        queue.push(nextId);
      }
    }
  }

  return nodes.filter(n => !reachable.has(n.id));
}
