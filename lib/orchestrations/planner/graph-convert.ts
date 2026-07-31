// Step 5: converts a PlannerAgent draft plan into the exact data the
// existing visual orchestration builder already consumes.
//
// Key finding from investigating components/admin/orchestration-designer.tsx:
// there is no "load an unsaved draft" mode in the builder — every workflow
// it can open is a real orchestrations row, fetched by id, with its nodes
// and connections persisted via the same createNode()/createConnection()
// calls the builder's own save flow uses (see orchestration-designer.tsx's
// saveOrchestration(), which does a full delete-and-recreate on every save
// using those same two endpoints). So "load a draft into the builder" means
// persisting it as a draft-status orchestration and opening it by id — no
// new rendering path, exactly per this step's instruction to reuse the
// current builder rather than build one.

import { createOrchestration, createNode, createConnection } from "../db";
import type { NodeType, OrchestrationTriggerType } from "@/shared/orchestrationTypes";
import type { DraftPlan, DraftPlanStep } from "./draft-plan";

export type ConvertedGraphNode = {
  tempId: string;
  nodeType: string;
  label: string;
  positionX: number;
  positionY: number;
  config: Record<string, unknown>;
  // Step 6: the LLM's one-sentence reason for this step, carried into
  // OrchestrationNode.displayDescription (the existing "Step Description"
  // field the builder's node properties panel already reads/writes) and
  // surfaced as a hover tooltip on the node itself (orchestration-designer.tsx).
  displayDescription?: string;
};

export type ConvertedGraphConnection = {
  sourceTempId: string;
  targetTempId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
};

export type ConvertedGraph = {
  nodes: ConvertedGraphNode[];
  connections: ConvertedGraphConnection[];
};

const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 160;
const ORIGIN_X = 100;
const ORIGIN_Y = 100;

// planner-tools.json flattened api_call.auth for LLM tool-use ergonomics
// (see Step 2). The engine's ApiCallNodeConfig expects the original nested
// shape (auth.apiKey / auth.basic / auth.oauth2 / auth.mtls) — reshape back
// on the way into a real node config. Flagged as a known follow-up in the
// Step 2 summary; this is where it gets resolved.
function reshapeApiCallAuth(flat: Record<string, unknown>): Record<string, unknown> {
  const nested: Record<string, unknown> = { type: flat.type ?? "none" };

  for (const legacyKey of ["headerName", "value", "username", "password", "token"]) {
    if (flat[legacyKey] !== undefined) nested[legacyKey] = flat[legacyKey];
  }

  if (flat.apiKeyLocation !== undefined || flat.apiKeyName !== undefined || flat.apiKeyValue !== undefined) {
    nested.apiKey = { location: flat.apiKeyLocation, name: flat.apiKeyName, value: flat.apiKeyValue };
  }

  if (flat.bearerToken !== undefined) {
    nested.bearerToken = flat.bearerToken;
  }

  if (flat.basicUsername !== undefined || flat.basicPassword !== undefined) {
    nested.basic = { username: flat.basicUsername, password: flat.basicPassword };
  }

  const oauth2Keys = [
    "oauth2AccessToken", "oauth2TokenUrl", "oauth2ClientId", "oauth2ClientSecret",
    "oauth2Scope", "oauth2Audience", "oauth2GrantType", "oauth2Username", "oauth2Password", "oauth2AuthStyle",
  ];
  if (oauth2Keys.some((key) => flat[key] !== undefined)) {
    nested.oauth2 = {
      accessToken: flat.oauth2AccessToken,
      tokenUrl: flat.oauth2TokenUrl,
      clientId: flat.oauth2ClientId,
      clientSecret: flat.oauth2ClientSecret,
      scope: flat.oauth2Scope,
      audience: flat.oauth2Audience,
      grantType: flat.oauth2GrantType,
      username: flat.oauth2Username,
      password: flat.oauth2Password,
      authStyle: flat.oauth2AuthStyle,
    };
  }

  if (flat.customHeaders !== undefined) {
    nested.customHeaders = flat.customHeaders;
  }

  const mtlsKeys = ["mtlsEnabled", "mtlsCertPath", "mtlsKeyPath", "mtlsCaPath", "mtlsPassphrase"];
  if (mtlsKeys.some((key) => flat[key] !== undefined)) {
    nested.mtls = {
      enabled: flat.mtlsEnabled,
      certPath: flat.mtlsCertPath,
      keyPath: flat.mtlsKeyPath,
      caPath: flat.mtlsCaPath,
      passphrase: flat.mtlsPassphrase,
    };
  }

  return nested;
}

/**
 * Turns a draft step's flattened tool-call params (config/planner-tools.json
 * shape — no "type" discriminant, api_call.auth flattened) back into a real
 * NodeConfig (shared/orchestrationTypes.ts shape) the engine/builder expect.
 */
export function reshapeStepParamsToNodeConfig(nodeType: string, params: Record<string, unknown>): Record<string, unknown> {
  const config: Record<string, unknown> = { ...params, type: nodeType };

  if (nodeType === "api_call" && config.auth && typeof config.auth === "object") {
    config.auth = reshapeApiCallAuth(config.auth as Record<string, unknown>);
  }

  if (nodeType === "for_each" && config.bodyConfig && typeof config.bodyConfig === "object" && typeof config.bodyNodeType === "string") {
    config.bodyConfig = reshapeStepParamsToNodeConfig(config.bodyNodeType, config.bodyConfig as Record<string, unknown>);
  }

  return config;
}

// Output handles the engine actually branches on per node type (see
// condition-node.ts's outputHandle and human-approval-node.ts's
// resumeAfterApproval outputHandle). NOTE: the visual builder's CustomNode
// component only renders distinct branch handles for "condition" nodes
// today — human_approval nodes get a single unlabeled handle in the UI even
// though the engine supports "approved"/"rejected" branching. Fixed
// alongside this step (components/admin/orchestration-designer.tsx) so a
// converted draft with human_approval branches actually renders correctly,
// per this step's own round-trip requirement.
const BRANCHING_NODE_TYPES = new Set(["condition", "switch", "human_approval"]);

type Tail = { tempId: string; handle: string | null };

export function convertDraftPlanToGraph(
  draftPlan: DraftPlan,
  options: { triggerType?: OrchestrationTriggerType } = {}
): ConvertedGraph {
  const nodes: ConvertedGraphNode[] = [];
  const connections: ConvertedGraphConnection[] = [];
  const nodeTypeByTempId = new Map<string, string>();
  let idCounter = 0;
  let laneCounter = 0;

  const nextTempId = () => `n${idCounter++}`;

  function addNode(
    nodeType: string,
    label: string,
    config: Record<string, unknown>,
    depth: number,
    lane: number,
    displayDescription?: string
  ): string {
    const tempId = nextTempId();
    nodes.push({
      tempId,
      nodeType,
      label,
      positionX: depth * COLUMN_WIDTH + ORIGIN_X,
      positionY: lane * ROW_HEIGHT + ORIGIN_Y,
      config,
      displayDescription,
    });
    nodeTypeByTempId.set(tempId, nodeType);
    return tempId;
  }

  function connect(tail: Tail, targetTempId: string) {
    // Terminal "end" nodes never get outgoing connections, even if a
    // malformed draft plan puts steps after one.
    if (nodeTypeByTempId.get(tail.tempId) === "end") return;
    connections.push({ sourceTempId: tail.tempId, targetTempId, sourceHandle: tail.handle, targetHandle: null });
  }

  // Returns both the sequence's open tails (for the caller to connect
  // onward) and the next free depth/column — a branch can nest arbitrarily
  // deep, and whatever comes after it in the *parent* sequence must be
  // placed past the deepest descendant on any branch, not just one column
  // past the branch point, or nodes land on top of each other.
  function buildSequence(steps: DraftPlanStep[], incomingTails: Tail[], depth: number, lane: number): { tails: Tail[]; nextDepth: number } {
    let tails = incomingTails;
    let currentDepth = depth;

    for (const step of steps) {
      const config = reshapeStepParamsToNodeConfig(step.nodeType, step.params || {});
      const tempId = addNode(step.nodeType, step.label || step.nodeType, config, currentDepth, lane, step.justification);
      for (const tail of tails) connect(tail, tempId);
      currentDepth += 1;

      const branchEntries = step.branches ? Object.entries(step.branches) : [];
      if (branchEntries.length > 0 && BRANCHING_NODE_TYPES.has(step.nodeType)) {
        const branchTails: Tail[] = [];
        let deepestNextDepth = currentDepth;
        branchEntries.forEach(([handle, branchSteps], index) => {
          const branchLane = index === 0 ? lane : (laneCounter += 1);
          const branchResult = buildSequence(branchSteps, [{ tempId, handle }], currentDepth, branchLane);
          branchTails.push(...branchResult.tails);
          deepestNextDepth = Math.max(deepestNextDepth, branchResult.nextDepth);
        });
        tails = branchTails.length > 0 ? branchTails : [{ tempId, handle: null }];
        currentDepth = deepestNextDepth;
      } else {
        tails = [{ tempId, handle: null }];
      }
    }

    return { tails, nextDepth: currentDepth };
  }

  const triggerTempId = addNode(
    "trigger",
    "Chat trigger",
    { type: "trigger", triggerType: options.triggerType ?? "chatbot" },
    0,
    0
  );

  buildSequence(draftPlan.steps, [{ tempId: triggerTempId, handle: null }], 1, 0);

  return { nodes, connections };
}

export type PersistedDraftOrchestration = {
  orchestrationId: string;
  nodeCount: number;
  connectionCount: number;
};

/**
 * Persists a converted draft as a real (status: "draft") orchestration, so
 * it can be opened in the existing builder by id — there is no separate
 * "preview" surface to build (see this file's header comment).
 *
 * createdById must be a real internal control-panel user id: external_user_id
 * (the chat requester) has no mapping into that identity space (Step 0), so
 * callers need to supply one — e.g. a system/service account — until Step 7b's
 * admin approval flow provides a real admin user id naturally at approval time.
 */
export async function persistDraftPlanAsOrchestration(input: {
  draftPlan: DraftPlan;
  companyId: string;
  targetAppId?: string | null;
  name: string;
  description?: string | null;
  createdById: string;
  triggerType?: OrchestrationTriggerType;
}): Promise<PersistedDraftOrchestration> {
  const graph = convertDraftPlanToGraph(input.draftPlan, { triggerType: input.triggerType });

  const orchestration = await createOrchestration({
    companyId: input.companyId,
    targetAppId: input.targetAppId ?? null,
    name: input.name,
    description: input.description ?? null,
    createdById: input.createdById,
  });

  const tempIdToRealId = new Map<string, string>();
  for (const node of graph.nodes) {
    const created = await createNode({
      orchestrationId: orchestration.id,
      nodeType: node.nodeType as NodeType,
      label: node.label,
      positionX: node.positionX,
      positionY: node.positionY,
      config: node.config,
      displayDescription: node.displayDescription,
    });
    tempIdToRealId.set(node.tempId, created.id);
  }

  for (const connection of graph.connections) {
    const sourceNodeId = tempIdToRealId.get(connection.sourceTempId);
    const targetNodeId = tempIdToRealId.get(connection.targetTempId);
    if (!sourceNodeId || !targetNodeId) {
      throw new Error(`Graph conversion produced a connection referencing an unknown node (${connection.sourceTempId} -> ${connection.targetTempId}).`);
    }

    await createConnection({
      orchestrationId: orchestration.id,
      sourceNodeId,
      targetNodeId,
      sourceHandle: connection.sourceHandle,
      targetHandle: connection.targetHandle,
    });
  }

  return {
    orchestrationId: orchestration.id,
    nodeCount: graph.nodes.length,
    connectionCount: graph.connections.length,
  };
}
