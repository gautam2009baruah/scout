import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { findUnreachableNodes } from "../lib/orchestrations/graph-reachability";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("findUnreachableNodes flags an orphan island with no path from the trigger", () => {
  const nodes = [
    { id: "trigger", label: "Chat trigger" },
    { id: "end", label: "End workflow" },
    { id: "orphan-switch", label: "Switch / Router" },
    { id: "orphan-notification", label: "Notification" },
  ];
  const connections = [
    { sourceNodeId: "trigger", targetNodeId: "end" },
    // orphan pair only connects to each other, never to the trigger
    { sourceNodeId: "orphan-switch", targetNodeId: "orphan-notification" },
  ];

  const unreachable = findUnreachableNodes(nodes, connections, ["trigger"]);

  assert.deepEqual(
    unreachable.map(n => n.id).sort(),
    ["orphan-notification", "orphan-switch"]
  );
});

test("findUnreachableNodes accepts branching/converging flows through switch nodes", () => {
  const nodes = [
    { id: "trigger", label: "Trigger" },
    { id: "switch", label: "Switch" },
    { id: "branch-a", label: "Branch A" },
    { id: "branch-b", label: "Branch B" },
    { id: "end", label: "End" },
  ];
  const connections = [
    { sourceNodeId: "trigger", targetNodeId: "switch" },
    { sourceNodeId: "switch", targetNodeId: "branch-a" },
    { sourceNodeId: "switch", targetNodeId: "branch-b" },
    { sourceNodeId: "branch-a", targetNodeId: "end" },
    { sourceNodeId: "branch-b", targetNodeId: "end" },
  ];

  assert.deepEqual(findUnreachableNodes(nodes, connections, ["trigger"]), []);
});

test("findUnreachableNodes treats every node as unreachable when there is no trigger", () => {
  const nodes = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
  const connections = [{ sourceNodeId: "a", targetNodeId: "b" }];

  assert.deepEqual(
    findUnreachableNodes(nodes, connections, []).map(n => n.id),
    ["a", "b"]
  );
});

test("publishOrchestration wires findUnreachableNodes into publish validation", () => {
  const source = readFileSync(join(repoRoot, "lib", "orchestrations", "db.ts"), "utf8");

  assert.match(
    source,
    /findUnreachableNodes\(nodes, connections, triggerNodes\.map/,
    "publishOrchestration must reject graphs containing nodes unreachable from the trigger"
  );
});
