import { NextResponse, type NextRequest } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { executeAIDecisionNode } from "@/lib/orchestrations/nodes/ai-decision-node";
import { getConnections, getNodes, getOrchestrationPage } from "@/lib/orchestrations/db";
import type { AIDecisionNodeConfig } from "@/shared/orchestrationTypes";

export const runtime = "nodejs";

type WorkflowRouterRequest = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  message?: string;
  workflow?: {
    id?: string;
    title?: string;
    description?: string;
    estimatedTime?: string;
    steps?: number;
  };
  history?: Array<{
    role?: string;
    text?: string;
  }>;
};

type ChatbotWorkflowCandidate = {
  id: string;
  name: string;
  description: string;
  nodeSummary: string[];
};

const NODE_CATALOG = [
  { nodeType: "workflow", label: "Workflow", purpose: "Run a guided workflow and collect user input." },
  { nodeType: "data_capture", label: "Data Capture", purpose: "Capture structured data from the current page." },
  { nodeType: "ai_extraction", label: "AI Extraction", purpose: "Extract fields from text, email, or documents." },
  { nodeType: "ai_decision", label: "AI Decision", purpose: "Route requests, classify intent, and propose a plan." },
  { nodeType: "condition", label: "Condition", purpose: "Branch based on rules or field values." },
  { nodeType: "human_approval", label: "Human Approval", purpose: "Pause for a manual approval step." },
  { nodeType: "notification", label: "Notification", purpose: "Notify a person or system about progress." },
  { nodeType: "variable", label: "Variable", purpose: "Set or transform orchestration variables." },
  { nodeType: "api_call", label: "API Call", purpose: "Call an external service or client system." },
  { nodeType: "end", label: "End", purpose: "Finish the orchestration." },
] as const;

function topologicalSort(
  nodes: Array<{ id: string; nodeType: string }>,
  connections: Array<{ sourceNodeId: string; targetNodeId: string }>
): string[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    graph.set(node.id, []);
  }

  for (const connection of connections) {
    if (nodeMap.has(connection.sourceNodeId) && nodeMap.has(connection.targetNodeId)) {
      graph.get(connection.sourceNodeId)!.push(connection.targetNodeId);
    }
  }

  const triggerNode = nodes.find((node) => node.nodeType === "trigger");
  if (!triggerNode) {
    return nodes.map((node) => node.id);
  }

  const queue = [triggerNode.id];
  const sorted: string[] = [];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) {
      continue;
    }

    visited.add(nodeId);
    sorted.push(nodeId);

    for (const next of graph.get(nodeId) || []) {
      if (!visited.has(next)) {
        queue.push(next);
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      sorted.push(node.id);
    }
  }

  return sorted;
}

function buildCandidateSummaries(candidates: ChatbotWorkflowCandidate[]): string {
  if (candidates.length === 0) {
    return "No published chatbot workflows are available.";
  }

  return candidates
    .map((candidate, index) => {
      const steps = candidate.nodeSummary.length > 0 ? candidate.nodeSummary.join(" -> ") : "No node summary available";
      return `${index + 1}. ${candidate.name}\n   Description: ${candidate.description || "(none)"}\n   Steps: ${steps}`;
    })
    .join("\n\n");
}

function buildNodeCatalogPrompt(): string {
  return NODE_CATALOG
    .map((node) => `- ${node.label} (${node.nodeType}): ${node.purpose}`)
    .join("\n");
}

function buildRouterAnswer(output: Record<string, unknown>, candidates: ChatbotWorkflowCandidate[]): string {
  const intent = typeof output.intent === "string" ? output.intent : "fallback";
  const message = typeof output.message === "string" ? output.message : "";
  const selectedNames = Array.isArray(output.matchedOrchestrationNames)
    ? output.matchedOrchestrationNames.filter((value): value is string => typeof value === "string")
    : [];
  const clarifyingQuestions = Array.isArray(output.clarifyingQuestions)
    ? output.clarifyingQuestions
        .map((question) => {
          if (!question || typeof question !== "object") {
            return "";
          }

          return typeof (question as { question?: unknown }).question === "string"
            ? (question as { question: string }).question
            : "";
        })
        .filter(Boolean)
    : [];
  const plan = Array.isArray(output.plan) ? output.plan : [];

  if (message) {
    return message;
  }

  if (intent === "need_clarification" && clarifyingQuestions.length > 0) {
    return `I need a little more information before I can route this request:\n${clarifyingQuestions.map((question) => `- ${question}`).join("\n")}`;
  }

  if ((intent === "workflow_match" || intent === "propose_plan" || intent === "execute_plan") && selectedNames.length > 0) {
    const selected = selectedNames[0];
    const candidate = candidates.find((item) => item.name === selected);
    const steps = candidate?.nodeSummary.length ? `\nSuggested path: ${candidate.nodeSummary.join(" -> ")}` : "";
    return `I found a workflow that looks relevant: ${selected}.${steps}`;
  }

  if (plan.length > 0) {
    const stepLabels = plan
      .map((step, index) => {
        if (!step || typeof step !== "object") {
          return "";
        }

        const label = typeof (step as { label?: unknown }).label === "string"
          ? (step as { label: string }).label
          : `Step ${index + 1}`;
        const reason = typeof (step as { reason?: unknown }).reason === "string"
          ? (step as { reason: string }).reason
          : "";

        return `- ${label}${reason ? `: ${reason}` : ""}`;
      })
      .filter(Boolean)
      .join("\n");

    if (stepLabels) {
      return `I can prepare this as a plan:\n${stepLabels}`;
    }
  }

  return "I reviewed the available workflows and I am ready to continue.";
}

async function loadChatbotWorkflowCandidates(
  companyId: string,
  userId: string,
  targetAppId: string
): Promise<ChatbotWorkflowCandidate[]> {
  const page = await getOrchestrationPage({
    companyId,
    userId,
    targetAppId: targetAppId || undefined,
    status: "published",
    page: 1,
    pageSize: 100,
  });

  const candidates = await Promise.all(
    page.orchestrations.map(async (orchestration) => {
      const nodes = await getNodes(orchestration.id);
      const connections = await getConnections(orchestration.id);
      const triggerNode = nodes.find((node) => node.nodeType === "trigger");

      if (!triggerNode) {
        return null;
      }

      const triggerConfig = triggerNode.config as Record<string, unknown> | null;
      if (triggerConfig?.triggerType !== "chatbot") {
        return null;
      }

      const sortedNodeIds = topologicalSort(
        nodes.map((node) => ({ id: node.id, nodeType: node.nodeType })),
        connections
      );
      const nodeMap = new Map(nodes.map((node) => [node.id, node]));
      const sortedNodes = sortedNodeIds.map((nodeId) => nodeMap.get(nodeId)).filter(Boolean);

      return {
        id: orchestration.id,
        name: orchestration.name,
        description: orchestration.description || "",
        nodeSummary: sortedNodes.map((node) => `${node!.label} (${node!.nodeType})`),
      } satisfies ChatbotWorkflowCandidate;
    })
  );

  return candidates.filter((candidate): candidate is ChatbotWorkflowCandidate => candidate !== null);
}

export async function POST(request: NextRequest) {
  try {
    const body: WorkflowRouterRequest = await request.json();
    const companyId = body.companyId || "";
    const userId = body.userId || "";
    const targetAppId = body.targetAppId || "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!companyId || !userId || !message) {
      return NextResponse.json(
        { message: "Missing required fields: companyId, userId, message" },
        { status: 400 }
      );
    }

    await assertScopedTargetAppAccess({ companyId, userId, targetAppId });

    const candidates = await loadChatbotWorkflowCandidates(companyId, userId, targetAppId);

    if (candidates.length === 0) {
      return NextResponse.json({
        answer: "I could not find any published chatbot workflows yet. Should I prepare one dynamically for you?",
        intent: "need_clarification",
        confidence: 0,
        needsClarification: true,
        clarifyingQuestions: [
          {
            question: "Should I prepare a new workflow dynamically for this request?",
            required: true,
          },
        ],
        requireUserConfirmation: true,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        plan: [],
        options: [],
      });
    }

    const decisionOptions: AIDecisionNodeConfig["decisions"] = [
      ...candidates.map((candidate) => ({
        label: candidate.name,
        description: candidate.description || candidate.nodeSummary.join(" -> "),
        outputHandle: candidate.id,
        aliases: candidate.nodeSummary.map((step) => step.toLowerCase()),
        keywords: candidate.nodeSummary.flatMap((step) => step.split(/[^a-zA-Z0-9]+/).filter(Boolean)),
        metadata: { orchestrationId: candidate.id },
      })),
      {
        label: "Prepare a new workflow dynamically",
        description: "Create a new orchestration plan when nothing fits the request.",
        outputHandle: "dynamic_plan",
        aliases: ["create plan", "build workflow", "prepare one dynamically"],
        keywords: ["dynamic", "new", "workflow", "plan", "prepare"],
      },
      {
        label: "Ask for clarification",
        description: "Ask follow-up questions when the request is ambiguous or underspecified.",
        outputHandle: "clarify",
        aliases: ["need more info", "clarify", "ask a question"],
        keywords: ["clarify", "question", "missing", "unknown", "details"],
      },
      {
        label: "Continue as chat",
        description: "Treat the request as ordinary conversation and do not route to a workflow.",
        outputHandle: "chat",
        aliases: ["chat", "answer normally", "not a workflow"],
        keywords: ["chat", "conversation", "ordinary", "talk"],
      },
    ];

    const aiConfig: AIDecisionNodeConfig = {
      type: "ai_decision",
      inputSource: "routerInput",
      prompt: [
        "Route the user's message against the available chatbot orchestrations.",
        "Prefer an existing workflow if it clearly matches the request.",
        "If no workflow fits, choose 'Prepare a new workflow dynamically'.",
        "If the request is missing information, choose 'Ask for clarification' and include questions.",
        "If the message is ordinary conversation, choose 'Continue as chat'.",
        "When you select a workflow or a dynamic plan, include a short executable plan with node-by-node steps.",
      ].join(" "),
      decisions: decisionOptions,
      defaultDecision: "chat",
    };

    const decisionResult = await executeAIDecisionNode(aiConfig, {
      routerInput: {
        message,
        conversationId: body.conversationId || undefined,
        companyId,
        userId,
        targetAppId: targetAppId || undefined,
        history: Array.isArray(body.history) ? body.history.slice(-12) : [],
        workflow: body.workflow || null,
        availableNodeCatalog: NODE_CATALOG,
        candidateWorkflows: candidates,
        candidateSummary: buildCandidateSummaries(candidates),
        nodeCatalogSummary: buildNodeCatalogPrompt(),
      },
    });

    if (!decisionResult.success) {
      return NextResponse.json(
        { message: decisionResult.error || "Failed to route workflow request." },
        { status: 500 }
      );
    }

    const output = (decisionResult.output || {}) as Record<string, unknown>;

    return NextResponse.json({
      answer: buildRouterAnswer(output, candidates),
      intent: output.intent ?? "fallback",
      confidence: output.confidence ?? 0,
      decision: output.decision,
      handle: output.handle,
      matchedOrchestrationIds: output.matchedOrchestrationIds ?? [],
      matchedOrchestrationNames: output.matchedOrchestrationNames ?? [],
      needsClarification: output.needsClarification ?? false,
      clarifyingQuestions: output.clarifyingQuestions ?? [],
      requireUserConfirmation: output.requireUserConfirmation ?? false,
      plan: output.plan ?? [],
      metadata: output.metadata ?? {},
    });
  } catch (error) {
    if (error instanceof ScopedTargetAppAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    console.error("[Chatbot Workflow Router] Error:", error);
    return NextResponse.json(
      {
        message: "Failed to route chatbot workflow request.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: "Chatbot workflow router endpoint",
    usage: {
      method: "POST",
      body: {
        companyId: "required",
        userId: "required",
        targetAppId: "optional",
        conversationId: "optional",
        message: "required",
        history: "optional array of prior chat messages",
        workflow: "optional selected workflow context",
      },
    },
  });
}