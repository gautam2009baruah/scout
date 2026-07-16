import { NextResponse, type NextRequest } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { createExecution, getConnections, getNodes, getOrchestrationPage } from "@/lib/orchestrations/db";
import { getLLMProvider } from "@/lib/llm/providers";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import type { ChatbotTriggerConfig } from "@/shared/orchestrationTypes";

export const runtime = "nodejs";

type WorkflowRouterRequest = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  allowDraftPlan?: boolean;
  forceActionMode?: boolean;
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
  version: number;
  name: string;
  description: string;
  nodeSummary: string[];
  requiredVariables: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    description?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  triggerPhrases: string[];
  examplePhrases: string[];
};

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
        version: orchestration.version,
        name: orchestration.name,
        description: orchestration.description || "",
        nodeSummary: sortedNodes.map((node) => `${node!.label} (${node!.nodeType})`),
        requiredVariables: (
          Array.isArray(triggerConfig?.requiredVariables)
            ? triggerConfig.requiredVariables
            : []
        ) as ChatbotWorkflowCandidate["requiredVariables"],
        triggerPhrases: Array.isArray(triggerConfig?.triggerPhrases)
          ? triggerConfig.triggerPhrases.filter((phrase): phrase is string => typeof phrase === "string")
          : [],
        examplePhrases: Array.isArray(triggerConfig?.examplePhrases)
          ? triggerConfig.examplePhrases.filter((phrase): phrase is string => typeof phrase === "string")
          : [],
      } satisfies ChatbotWorkflowCandidate;
    })
  );

  return candidates.filter((candidate): candidate is ChatbotWorkflowCandidate => candidate !== null);
}

type RequiredVariableDefinition = NonNullable<ChatbotWorkflowCandidate["requiredVariables"]>[number];

type ActionContextResolution = {
  message: string;
  confidence: number;
  usedLLM: boolean;
};

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveFollowUpMessageHeuristic(
  message: string,
  history: Array<{ role?: string; text?: string }>
): string {
  const normalized = message.trim().toLowerCase();
  const followUpPattern = /^(send\s+again|again|do\s+it\s+again|one\s+more|send\s+one\s+more)(\b|\s|[.!?])+/i;

  if (!followUpPattern.test(normalized)) {
    return message;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry?.role !== "user") {
      continue;
    }

    const previous = String(entry.text || "").trim();
    if (!previous || previous.toLowerCase() === normalized) {
      continue;
    }

    const looksActionable = /\b(send|email|mail|notify|notification|birthday|invoice|order|request)\b/i.test(previous);
    if (looksActionable) {
      return previous;
    }
  }

  return message;
}

async function resolveActionRequestFromConversation(
  message: string,
  history: Array<{ role?: string; text?: string }>
): Promise<ActionContextResolution> {
  if (history.length === 0) {
    return { message, confidence: 1, usedLLM: false };
  }

  try {
    const provider = await getLLMProvider();
    const contextText = history
      .slice(-10)
      .map((entry) => `${(entry.role || "unknown").toUpperCase()}: ${String(entry.text || "")}`)
      .join("\n");

    const systemPrompt = [
      "You resolve conversational references in action requests.",
      "Rewrite the latest user message into a standalone actionable request using conversation context.",
      "If latest message already stands alone, keep it unchanged.",
      "If there is not enough context, keep the latest message unchanged and use lower confidence.",
      'Return JSON only: {"resolvedMessage":"...","confidence":0-1,"reason":"brief"}',
    ].join(" ");

    const userPrompt = [
      "Conversation context:",
      contextText,
      "",
      "Latest user message:",
      message,
    ].join("\n");

    const response = await provider.generate_answer(systemPrompt, userPrompt, "");
    const parsed = parseJsonObject(response || "");
    const resolvedMessage = typeof parsed?.resolvedMessage === "string" ? parsed.resolvedMessage.trim() : "";
    const confidence = typeof parsed?.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5;

    if (resolvedMessage) {
      return {
        message: resolvedMessage,
        confidence,
        usedLLM: true,
      };
    }
  } catch {
    // Fallback below.
  }

  return {
    message: resolveFollowUpMessageHeuristic(message, history),
    confidence: 0.55,
    usedLLM: false,
  };
}

function extractEmailAddress(message: string): string | null {
  const match = message.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
  return match?.[0]?.trim() || null;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreCandidateHeuristically(message: string, candidate: ChatbotWorkflowCandidate): number {
  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0) {
    return 0;
  }

  const searchable = [
    candidate.name,
    candidate.description,
    ...candidate.triggerPhrases,
    ...candidate.examplePhrases,
    ...candidate.nodeSummary,
  ].join(" ");
  const candidateTokens = new Set(tokenize(searchable));
  let overlap = 0;
  for (const token of messageTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(1, messageTokens.size);
}

async function findEligibleCandidateWithAi(
  message: string,
  candidates: ChatbotWorkflowCandidate[]
): Promise<{ candidate: ChatbotWorkflowCandidate; confidence: number; reason: string } | null> {
  if (candidates.length === 0) {
    return null;
  }

  try {
    const provider = await getLLMProvider();
    const compactCandidates = candidates.map((candidate, index) => ({
      index,
      id: candidate.id,
      name: candidate.name,
      description: candidate.description,
      triggerPhrases: candidate.triggerPhrases,
      examplePhrases: candidate.examplePhrases,
      nodeSummary: candidate.nodeSummary,
    }));

    const systemPrompt = [
      "You are an orchestration router.",
      "Pick at most one best orchestration for the user ask.",
      "If none match clearly, return null selection.",
      'Return JSON only: {"matchedId":"string-or-empty","confidence":0-1,"reason":"short"}.',
    ].join(" ");

    const userPrompt = [
      `User ask: ${message}`,
      "Eligible orchestrations (chatbot-trigger only):",
      JSON.stringify(compactCandidates),
    ].join("\n");

    const raw = await provider.generate_answer(systemPrompt, userPrompt, "");
    const parsed = parseJsonObject(raw || "");
    const matchedId = typeof parsed?.matchedId === "string" ? parsed.matchedId.trim() : "";
    const confidence = typeof parsed?.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0;

    if (!matchedId) {
      return null;
    }

    const candidate = candidates.find((item) => item.id === matchedId);
    if (!candidate || confidence < 0.45) {
      return null;
    }

    return {
      candidate,
      confidence,
      reason: typeof parsed?.reason === "string" ? parsed.reason : "Matched by router model",
    };
  } catch {
    return null;
  }
}

async function findEligibleOrchestration(
  message: string,
  candidates: ChatbotWorkflowCandidate[]
): Promise<{ candidate: ChatbotWorkflowCandidate; confidence: number; reason: string } | null> {
  const aiMatch = await findEligibleCandidateWithAi(message, candidates);
  if (aiMatch) {
    return aiMatch;
  }

  let best: { candidate: ChatbotWorkflowCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    const score = scoreCandidateHeuristically(message, candidate);
    if (!best || score > best.score) {
      best = { candidate, score };
    }
  }

  if (!best || best.score < 0.35) {
    return null;
  }

  return {
    candidate: best.candidate,
    confidence: Number(best.score.toFixed(2)),
    reason: "Matched by keyword overlap",
  };
}

function coerceRequiredVariableValue(definition: RequiredVariableDefinition, value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (definition.type === "number") {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  if (definition.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }
    const normalized = String(value).trim().toLowerCase();
    if (["true", "yes", "y", "1"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "n", "0"].includes(normalized)) {
      return false;
    }
    return null;
  }

  if (definition.type === "select") {
    const normalized = String(value).trim().toLowerCase();
    const options = Array.isArray(definition.options) ? definition.options : [];
    const option = options.find((item) => (
      String(item.value).trim().toLowerCase() === normalized
      || String(item.label).trim().toLowerCase() === normalized
    ));
    return option ? option.value : null;
  }

  const text = String(value).trim();
  return text ? text : null;
}

function buildRequiredVariableQuestion(definition: RequiredVariableDefinition): string {
  const baseLabel = definition.label || definition.name;
  const description = definition.description ? ` (${definition.description})` : "";
  if (definition.type === "select" && Array.isArray(definition.options) && definition.options.length > 0) {
    const options = definition.options.map((option) => option.label || option.value).join(", ");
    return `Please provide ${baseLabel}${description}. Options: ${options}.`;
  }
  return `Please provide ${baseLabel}${description}.`;
}

async function extractRequiredVariablesFromConversation(
  requiredVariables: RequiredVariableDefinition[],
  message: string,
  history: Array<{ role?: string; text?: string }>
): Promise<{ values: Record<string, unknown>; missing: RequiredVariableDefinition[] }> {
  if (requiredVariables.length === 0) {
    return { values: {}, missing: [] };
  }

  const conversationContext = [
    ...history
      .slice(-10)
      .map((entry) => `${(entry.role || "unknown").toUpperCase()}: ${String(entry.text || "")}`),
    `USER: ${message}`,
  ].join("\n");

  const heuristicValues: Record<string, unknown> = {};
  const guessedEmail = extractEmailAddress(conversationContext);
  for (const definition of requiredVariables) {
    if (definition.type === "text" && /email/i.test(definition.name) && guessedEmail) {
      heuristicValues[definition.name] = guessedEmail;
    }
  }

  try {
    const provider = await getLLMProvider();
    const systemPrompt = [
      "Extract required orchestration input values from conversation.",
      "Return JSON only in this shape:",
      '{"values":{"variableName":"value-or-null"}}.',
      "Do not invent values; use null when not provided.",
    ].join(" ");
    const userPrompt = [
      `Required variables: ${JSON.stringify(requiredVariables)}`,
      "Conversation:",
      conversationContext,
    ].join("\n");
    const raw = await provider.generate_answer(systemPrompt, userPrompt, "");
    const parsed = parseJsonObject(raw || "");
    const parsedValues = parsed?.values && typeof parsed.values === "object"
      ? parsed.values as Record<string, unknown>
      : {};

    const values: Record<string, unknown> = { ...heuristicValues };
    for (const definition of requiredVariables) {
      const coerced = coerceRequiredVariableValue(definition, parsedValues[definition.name]);
      if (coerced !== null) {
        values[definition.name] = coerced;
      }
    }

    const missing = requiredVariables.filter((definition) => values[definition.name] === undefined);
    return { values, missing };
  } catch {
    const missing = requiredVariables.filter((definition) => heuristicValues[definition.name] === undefined);
    return { values: heuristicValues, missing };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: WorkflowRouterRequest = await request.json();
    const companyIdentifier = body.companyId || "";
    const userId = body.userId || "";
    const targetAppIdentifier = body.targetAppId || "";
    const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    const targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";
    const forceActionMode = body.forceActionMode === true;
    const rawMessage = typeof body.message === "string" ? body.message.trim() : "";
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const contextResolution = await resolveActionRequestFromConversation(rawMessage, history);
    const message = contextResolution.message;

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
        answer: "I could not find any published chatbot-trigger orchestrations for this app.",
        intent: "fallback",
        confidence: 0,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        needsClarification: false,
        clarifyingQuestions: [],
        requireUserConfirmation: false,
        plan: [],
        metadata: {
          forceActionMode,
          normalizedMessage: message,
          originalMessage: rawMessage,
          conversationResolution: {
            usedLLM: contextResolution.usedLLM,
            confidence: contextResolution.confidence,
          },
        },
      });
    }

    const match = await findEligibleOrchestration(message, candidates);
    if (!match) {
      return NextResponse.json({
        answer: "I could not find an eligible chatbot orchestration for this request.",
        intent: "fallback",
        confidence: 0,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        needsClarification: false,
        clarifyingQuestions: [],
        requireUserConfirmation: false,
        plan: [],
        metadata: {
          forceActionMode,
          normalizedMessage: message,
          originalMessage: rawMessage,
          conversationResolution: {
            usedLLM: contextResolution.usedLLM,
            confidence: contextResolution.confidence,
          },
        },
      });
    }

    const selected = match.candidate;
    const plan = selected.nodeSummary.map((step, index) => ({
      id: `${selected.id}:${index + 1}`,
      label: step,
      nodeType: "workflow_step",
      reason: "From selected published orchestration",
    }));

    const variableExtraction = await extractRequiredVariablesFromConversation(
      selected.requiredVariables,
      message,
      history
    );

    if (variableExtraction.missing.length > 0) {
      return NextResponse.json({
        answer: `I found orchestration \"${selected.name}\", but I still need some required inputs before execution.`,
        intent: "need_clarification",
        confidence: match.confidence,
        matchedOrchestrationIds: [selected.id],
        matchedOrchestrationNames: [selected.name],
        needsClarification: true,
        clarifyingQuestions: variableExtraction.missing.map((definition) => ({
          question: buildRequiredVariableQuestion(definition),
          required: true,
          variableName: definition.name,
        })),
        requireUserConfirmation: false,
        plan,
        metadata: {
          selectedOrchestrationId: selected.id,
          selectedOrchestrationName: selected.name,
          missingRequiredVariables: variableExtraction.missing.map((definition) => definition.name),
          extractedVariables: variableExtraction.values,
          matchReason: match.reason,
          awaitingDraftPlanPermission: false,
          normalizedMessage: message,
          originalMessage: rawMessage,
          conversationResolution: {
            usedLLM: contextResolution.usedLLM,
            confidence: contextResolution.confidence,
          },
        },
      });
    }

    if (!body.allowDraftPlan) {
      return NextResponse.json({
        answer: `I found orchestration \"${selected.name}\" for this request. Do you approve running it now?`,
        intent: "workflow_match",
        confidence: match.confidence,
        matchedOrchestrationIds: [selected.id],
        matchedOrchestrationNames: [selected.name],
        needsClarification: true,
        clarifyingQuestions: [
          {
            question: "Do you approve running this orchestration now?",
            required: true,
          },
        ],
        requireUserConfirmation: true,
        plan,
        metadata: {
          selectedOrchestrationId: selected.id,
          selectedOrchestrationName: selected.name,
          extractedVariables: variableExtraction.values,
          matchReason: match.reason,
          awaitingDraftPlanPermission: true,
          normalizedMessage: message,
          originalMessage: rawMessage,
          conversationResolution: {
            usedLLM: contextResolution.usedLLM,
            confidence: contextResolution.confidence,
          },
        },
      });
    }

    const execution = await createExecution({
      orchestrationId: selected.id,
      orchestrationVersion: selected.version,
      context: variableExtraction.values,
      triggerData: {
        triggerType: "chatbot",
        userMessage: message,
        confidence: match.confidence,
        orchestrationName: selected.name,
      },
      triggeredBy: userId,
    });

    return NextResponse.json({
      answer: `Approved. I started orchestration \"${selected.name}\".`,
      intent: "execute_plan",
      confidence: match.confidence,
      matchedOrchestrationIds: [selected.id],
      matchedOrchestrationNames: [selected.name],
      needsClarification: false,
      clarifyingQuestions: [],
      requireUserConfirmation: false,
      plan,
      metadata: {
        selectedOrchestrationId: selected.id,
        selectedOrchestrationName: selected.name,
        executionId: execution.id,
        extractedVariables: variableExtraction.values,
        matchReason: match.reason,
        normalizedMessage: message,
        originalMessage: rawMessage,
        conversationResolution: {
          usedLLM: contextResolution.usedLLM,
          confidence: contextResolution.confidence,
        },
      },
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