import { NextResponse, type NextRequest } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { createExecution, getConnections, getExecutionById, getActiveClarificationRequestForConversation, getNodes, getOrchestrationPage, getOrchestrationById, resolveClarificationRequest, updateExecution } from "@/lib/orchestrations/db";
import { createTriggerLog, getTriggers, updateTriggerLastTriggered } from "@/lib/orchestrations/triggers";
import { getLLMProvider } from "@/lib/llm/providers";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";
import type { ChatbotTriggerConfig } from "@/shared/orchestrationTypes";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import { appendConversationExchange, getOrCreateConversation } from "@/lib/chat/conversations";

export const runtime = "nodejs";

type WorkflowRouterRequest = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  allowDraftPlan?: boolean;
  forceActionMode?: boolean;
  continuationOnly?: boolean;
  suggestionOnly?: boolean;
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
  triggerId: string;
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
  executionContract: Array<{
    label: string;
    nodeType: string;
    configuredFields: Array<{
      field: string;
      source: "literal" | "workflow_value";
    }>;
    requiredInputs: Array<{
      field: string;
      description?: string;
    }>;
  }>;
};

type ExecutionReadinessAssessment = {
  ready: boolean;
  confidence: number;
  questions: string[];
  missingInformation: string[];
  reason: string;
};

const PLANNING_RELEVANT_CONFIG_KEY =
  /^(recipient|recipients|to|cc|bcc|subject|title|body|message|template|prompt|instruction|instructions|input|inputMapping|query|sql|target|content|criteria|filter)$/i;
const SENSITIVE_CONFIG_KEY =
  /(password|secret|token|api.?key|credential|authorization|auth|webhook|connection|certificate|private.?key)/i;

function buildNodeExecutionContract(
  node: {
    label: string;
    nodeType: string;
    config: unknown;
  }
): ChatbotWorkflowCandidate["executionContract"][number] {
  const configuredFields: ChatbotWorkflowCandidate["executionContract"][number]["configuredFields"] = [];
  const requiredInputs: ChatbotWorkflowCandidate["executionContract"][number]["requiredInputs"] = [];
  const seenConfigured = new Set<string>();
  const seenRequired = new Set<string>();

  const addConfigured = (field: string, value: unknown) => {
    if (!field || seenConfigured.has(field)) return;
    const hasWorkflowValue = typeof value === "string" && /\{\{[\s\S]+?\}\}/.test(value);
    seenConfigured.add(field);
    configuredFields.push({
      field,
      source: hasWorkflowValue ? "workflow_value" : "literal",
    });
  };

  const visit = (value: unknown, path: string[], relevantParent = false) => {
    if (value === null || value === undefined || value === "") return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, [...path, String(index)], relevantParent));
      return;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const required = record.required === true;
      const fieldName = typeof record.key === "string"
        ? record.key
        : typeof record.name === "string"
          ? record.name
          : "";
      if (required && fieldName && !seenRequired.has(fieldName)) {
        seenRequired.add(fieldName);
        requiredInputs.push({
          field: fieldName,
          description: typeof record.description === "string" ? record.description : undefined,
        });
      }

      for (const [key, child] of Object.entries(record)) {
        if (SENSITIVE_CONFIG_KEY.test(key)) continue;
        const relevant = relevantParent || PLANNING_RELEVANT_CONFIG_KEY.test(key);
        visit(child, [...path, key], relevant);
      }
      return;
    }

    const leafKey = path[path.length - 1] || "";
    if (
      relevantParent
      && !["required", "type", "enabled"].includes(leafKey)
      && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    ) {
      addConfigured(path.join("."), value);
    }
  };

  visit(node.config, []);

  return {
    label: node.label,
    nodeType: node.nodeType,
    configuredFields,
    requiredInputs,
  };
}

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
  const activeChatbotTriggers = (await getTriggers({
    triggerType: "chatbot",
  })).filter((trigger) => trigger.status === "active" || trigger.status === "error");
  const triggerByOrchestrationId = new Map(
    activeChatbotTriggers.map((trigger) => [trigger.orchestrationId, trigger])
  );
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
      const persistedTrigger = triggerByOrchestrationId.get(orchestration.id);
      if (!persistedTrigger) {
        return null;
      }

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
        triggerId: persistedTrigger.id,
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
        executionContract: sortedNodes.map((node) => buildNodeExecutionContract({
          label: node!.label,
          nodeType: node!.nodeType,
          config: node!.config,
        })),
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

type ClarificationTurnDecision = "answer" | "cancel" | "new_topic";

async function classifyClarificationTurn(input: {
  message: string;
  clarificationPrompt: string;
  history: Array<{ role?: string; text?: string }>;
}): Promise<ClarificationTurnDecision> {
  const normalized = input.message
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ");

  if (
    /\b(cancel|stop|abort|nevermind|never mind|forget it|drop it|leave it|nothing leave|not now)\b/.test(normalized)
    || /^(no|nope|nah|nothing)$/.test(normalized)
  ) {
    return "cancel";
  }

  try {
    const provider = await getLLMProvider();
    const recentContext = input.history
      .slice(-6)
      .map((entry) => `${String(entry.role || "unknown").toUpperCase()}: ${String(entry.text || "")}`)
      .join("\n");
    const response = await provider.generate_answer(
      [
        "Classify the latest user turn while a workflow is paused for clarification.",
        "Use answer only when the message supplies, corrects, or meaningfully discusses the requested information.",
        "Use cancel when the user declines, stops, abandons, or asks to leave the workflow.",
        "Use new_topic when the user asks an unrelated informational question or starts another subject.",
        'Return JSON only: {"decision":"answer|cancel|new_topic","reason":"brief"}.',
      ].join(" "),
      [
        `Pending clarification: ${input.clarificationPrompt}`,
        recentContext ? `Recent conversation:\n${recentContext}` : "",
        `Latest user message: ${input.message}`,
      ].filter(Boolean).join("\n\n"),
      ""
    );
    const parsed = parseJsonObject(response || "");
    if (parsed?.decision === "answer" || parsed?.decision === "cancel" || parsed?.decision === "new_topic") {
      return parsed.decision;
    }
  } catch {
    // Use the conservative fallback below.
  }

  if (
    /^(may i know|can you tell me|could you tell me|tell me|explain|why|who|where|when)\b/.test(normalized)
    || (input.message.trim().endsWith("?") && !hasStrongActionIntent(normalized))
  ) {
    return "new_topic";
  }

  return "answer";
}

function hasStrongActionIntent(message: string): boolean {
  const normalized = String(message || "").toLowerCase();
  return /\b(create|generate|run|execute|submit|send|start|trigger|process|invoice|order|request)\b/i.test(normalized);
}

function isExplicitActionRequest(message: string): boolean {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;

  if (/^(how|what|why|where|when|who)\b/.test(normalized)) {
    return false;
  }

  if (/^(can|could|does|do|is|are)\s+(the\s+)?(system|application|app|platform|workflow)\b/.test(normalized)) {
    return false;
  }

  return /\b(create|update|submit|approve|reject|notify|schedule|cancel|process|trigger|launch|start|run|assign|send|email|forward|book|delete|remove|generate|dispatch|execute|fetch|retrieve|lookup)\b/i.test(normalized)
    || /\blook\s+up\b/i.test(normalized);
}

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
      const originalLooksActionable = hasStrongActionIntent(message);
      const resolvedLooksActionable = hasStrongActionIntent(resolvedMessage);
      const normalizedOriginal = normalizeForPhraseMatch(message);
      const normalizedResolved = normalizeForPhraseMatch(resolvedMessage);
      const rewriteLooksOverReduced = normalizedResolved.length > 0
        && normalizedResolved.length < Math.max(12, Math.floor(normalizedOriginal.length * 0.55));

      // Keep explicit action requests intact unless the rewrite is high-confidence and still actionable.
      if (originalLooksActionable && (!resolvedLooksActionable || rewriteLooksOverReduced) && confidence < 0.85) {
        return {
          message,
          confidence: Math.max(confidence, 0.6),
          usedLLM: true,
        };
      }

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
  const stopWords = new Set([
    "a",
    "an",
    "the",
    "my",
    "me",
    "for",
    "to",
    "of",
    "in",
    "on",
    "at",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "please",
    "kindly",
    "one",
    "id",
  ]);

  return input
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .map((token) => token.endsWith("s") && token.length > 3 ? token.slice(0, -1) : token)
    .filter((token) => token.length > 1)
    .filter((token) => !stopWords.has(token));
}

function scorePhraseSimilarity(message: string, phrases: string[]): number {
  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0 || phrases.length === 0) {
    return 0;
  }

  let best = 0;
  for (const phrase of phrases) {
    const phraseTokens = new Set(tokenize(phrase));
    if (phraseTokens.size === 0) {
      continue;
    }

    let overlap = 0;
    for (const token of messageTokens) {
      if (phraseTokens.has(token)) {
        overlap += 1;
      }
    }

    const score = overlap / Math.max(1, phraseTokens.size);
    if (score > best) {
      best = score;
    }
  }

  return Math.max(0, Math.min(1, best));
}

function normalizeForPhraseMatch(input: string): string {
  return String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreDirectPhraseMatch(message: string, phrases: string[]): number {
  if (!phrases.length) {
    return 0;
  }

  const normalizedMessage = normalizeForPhraseMatch(message);
  if (!normalizedMessage) {
    return 0;
  }

  const messageTokens = new Set(tokenize(normalizedMessage));
  let best = 0;

  for (const phrase of phrases) {
    const normalizedPhrase = normalizeForPhraseMatch(phrase);
    if (!normalizedPhrase) {
      continue;
    }

    const phraseTokens = tokenize(normalizedPhrase);
    if (phraseTokens.length === 0) {
      continue;
    }

    const phraseIsSpecific = phraseTokens.length >= 2;

    if (normalizedMessage === normalizedPhrase) {
      best = Math.max(best, phraseIsSpecific ? 1 : 0.85);
      continue;
    }

    if (normalizedMessage.includes(normalizedPhrase)) {
      best = Math.max(best, phraseIsSpecific ? 0.92 : 0.7);
      continue;
    }

    let overlap = 0;
    for (const token of phraseTokens) {
      if (messageTokens.has(token)) {
        overlap += 1;
      }
    }

    if (overlap === phraseTokens.length) {
      best = Math.max(best, phraseIsSpecific ? 0.78 : 0.55);
      continue;
    }

    const overlapRatio = overlap / phraseTokens.length;
    if (overlapRatio >= 0.75) {
      best = Math.max(best, phraseIsSpecific ? 0.62 : 0.45);
    }
  }

  return Math.max(0, Math.min(1, best));
}

function scoreCandidateHeuristically(message: string, candidate: ChatbotWorkflowCandidate): number {
  const messageTokens = new Set(tokenize(message));
  if (messageTokens.size === 0) {
    return 0;
  }

  const searchable = [
    candidate.name,
    candidate.description,
    ...candidate.nodeSummary,
  ].join(" ");
  const candidateTokens = new Set(tokenize(searchable));
  let overlap = 0;
  for (const token of messageTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  const baseScore = overlap / Math.max(1, messageTokens.size);
  const triggerPhraseScore = scorePhraseSimilarity(message, candidate.triggerPhrases);
  // Example phrases are a soft signal only. They influence ranking but never dominate.
  const examplePhraseScore = scorePhraseSimilarity(message, candidate.examplePhrases);
  const directTriggerMatchScore = scoreDirectPhraseMatch(message, candidate.triggerPhrases);
  const directExampleMatchScore = scoreDirectPhraseMatch(message, candidate.examplePhrases);

  const blendedScore = Math.max(
    0,
    Math.min(1, baseScore * 0.7 + triggerPhraseScore * 0.2 + examplePhraseScore * 0.1)
  );

  const directPhraseSignal = Math.max(directTriggerMatchScore, directExampleMatchScore * 0.9);
  if (directPhraseSignal >= 0.9) {
    return Math.max(blendedScore, 0.85);
  }

  if (directPhraseSignal >= 0.75) {
    return Math.max(blendedScore, 0.7);
  }

  if (directPhraseSignal >= 0.6) {
    return Math.max(blendedScore, 0.55);
  }

  return blendedScore;
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
      "Trigger phrases and example phrases are helpful hints, not strict rules.",
      "Do not require exact phrase match. Use overall goal fit based on name, description, and node summary.",
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
  candidates: ChatbotWorkflowCandidate[],
  options?: { forceActionMode?: boolean }
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

  const scoreThreshold = options?.forceActionMode ? 0.25 : 0.35;
  if (!best || best.score < scoreThreshold) {
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

async function assessExecutionReadiness(
  candidate: ChatbotWorkflowCandidate,
  message: string,
  history: Array<{ role?: string; text?: string }>,
  extractedVariables: Record<string, unknown>
): Promise<ExecutionReadinessAssessment> {
  const conversation = [
    ...history
      .slice(-12)
      .map((entry) => `${(entry.role || "unknown").toUpperCase()}: ${String(entry.text || "")}`),
    `USER: ${message}`,
  ].join("\n");

  const workflowContext = JSON.stringify({
    name: candidate.name,
    description: candidate.description,
    steps: candidate.nodeSummary,
    declaredRequiredInputs: candidate.requiredVariables,
    extractedInputs: extractedVariables,
    executionContract: candidate.executionContract,
  });

  try {
    const provider = await getLLMProvider();
    const systemPrompt = [
      "You are a pre-execution conversation planner for workflow automation.",
      "Decide whether the conversation contains enough business information to execute the selected workflow without making a material guess.",
      "This is a semantic sufficiency check, not merely a required-field check.",
      "Consider the workflow purpose and its steps. Identify information that an operator would need to know to produce the requested result.",
      "The execution contract lists fields already configured as literals or mapped from workflow values. Treat those fields as supplied and never ask the user for them.",
      "Do not ask for delivery recipients, subjects, templates, messages, targets, or other settings when their corresponding field is listed as configured.",
      "A broad action request that leaves the subject, target, content, scope, selection criteria, or desired outcome materially ambiguous is not ready.",
      "Do not demand implementation details, optional preferences, or information the workflow can safely determine itself.",
      "Use the full conversation: a follow-up answer may complete an earlier request.",
      "Never invent missing values.",
      "If not ready, ask the smallest number of concise, natural questions needed to proceed.",
      "Questions must be generic to the actual missing business information; do not mention this assessment or internal node names.",
      "Return JSON only:",
      '{"ready":true|false,"confidence":0-1,"questions":["..."],"missingInformation":["..."],"reason":"..."}.',
    ].join("\n");
    const userPrompt = [
      `Selected workflow: ${workflowContext}`,
      "Conversation:",
      conversation,
    ].join("\n\n");
    const raw = await provider.generate_answer(systemPrompt, userPrompt, workflowContext);
    const parsed = parseJsonObject(raw || "");
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const missingInformation = Array.isArray(parsed?.missingInformation)
      ? parsed.missingInformation.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence) || 0));
    const ready = parsed?.ready === true;

    // A model may only stop execution when it can state a concrete follow-up
    // question with reasonable confidence. Otherwise, declared workflow inputs
    // remain the deterministic source of truth.
    if (!ready && confidence >= 0.7 && questions.length > 0) {
      return {
        ready: false,
        confidence,
        questions: questions.slice(0, 3),
        missingInformation,
        reason: typeof parsed?.reason === "string" ? parsed.reason : "",
      };
    }

    return {
      ready: true,
      confidence,
      questions: [],
      missingInformation: [],
      reason: typeof parsed?.reason === "string" ? parsed.reason : "",
    };
  } catch {
    // Provider failures must not make all orchestrations unavailable. Existing
    // declared required-variable and extraction-node validation still applies.
    return {
      ready: true,
      confidence: 0,
      questions: [],
      missingInformation: [],
      reason: "Readiness assessment unavailable",
    };
  }
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
    const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
    const forceActionMode = body.forceActionMode === true;
    const suggestionOnly = body.suggestionOnly === true;
    const continuationOnly = body.continuationOnly === true;
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

    await assertChatbotApiKeyAccess(request, { companyId, targetAppId, userId });

    await assertScopedTargetAppAccess({ companyId, userId, targetAppId });

    if (suggestionOnly) {
      if (!isExplicitActionRequest(rawMessage)) {
        return NextResponse.json({ suggestion: null });
      }

      const candidates = await loadChatbotWorkflowCandidates(companyId, userId, targetAppId);
      const match = await findEligibleOrchestration(rawMessage, candidates, { forceActionMode: false });
      // Suggestions are review-only and cannot execute, so favor recall while
      // still requiring a meaningful orchestration match.
      const minimumSuggestionConfidence = 0.7;

      if (!match || match.confidence < minimumSuggestionConfidence) {
        return NextResponse.json({ suggestion: null });
      }

      return NextResponse.json({
        suggestion: {
          orchestrationId: match.candidate.id,
          orchestrationName: match.candidate.name,
          description: match.candidate.description,
          confidence: match.confidence,
          reason: match.reason,
        },
      });
    }

    const persistedConversationId = await getOrCreateConversation({
      companyId,
      userId,
      conversationId: conversationId || undefined,
      firstQuestion: rawMessage,
    });

    const persistExchange = async (answer: string, metadata: Record<string, unknown>) => {
      await appendConversationExchange({
        companyId,
        userId,
        conversationId: persistedConversationId,
        question: rawMessage,
        answer,
        citations: [],
        metadata: { source: "workflow_router", ...metadata },
      });
    };

    if (persistedConversationId) {
      const clarification = await getActiveClarificationRequestForConversation({
        companyId,
        conversationId: persistedConversationId,
      });

      if (clarification) {
        const execution = await getExecutionById(clarification.executionId);
        if (execution && execution.status === "paused") {
          const orchestration = await getOrchestrationById(execution.orchestrationId);
          if (orchestration) {
            const clarificationDecision = await classifyClarificationTurn({
              message: rawMessage,
              clarificationPrompt: clarification.prompt,
              history,
            });

            if (clarificationDecision !== "answer") {
              await resolveClarificationRequest(clarification.id, {
                responseText: rawMessage,
                responseData: {
                  cancelled: true,
                  reason: clarificationDecision,
                },
              });
              await updateExecution(execution.id, {
                status: "cancelled",
                currentNodeId: null,
              });

              if (clarificationDecision === "cancel") {
                const answer = `Okay, I cancelled the workflow "${orchestration.name}".`;
                await persistExchange(answer, {
                  intent: "cancelled",
                  cancelledExecutionId: execution.id,
                });
                return NextResponse.json({
                  answer,
                  conversationId: persistedConversationId,
                  intent: "cancelled",
                  needsClarification: false,
                  requireUserConfirmation: false,
                });
              }

              return NextResponse.json({
                answer: "",
                conversationId: persistedConversationId,
                intent: "fallback",
                needsClarification: false,
                requireUserConfirmation: false,
                metadata: {
                  actionContextCleared: true,
                },
              });
            }

            const nodes = await getNodes(orchestration.id);
            const connections = await getConnections(orchestration.id);
            const engine = new OrchestrationEngine(execution, nodes, connections);
            const resumeResult = await engine.resumeAfterClarification({
              clarificationId: clarification.id,
              responseText: message,
            });

            if (resumeResult.success) {
              if (resumeResult.status === "paused" && resumeResult.clarification) {
                const nextClarification = resumeResult.clarification;
                await persistExchange(nextClarification.message, {
                  intent: "need_clarification",
                  resumedClarificationId: clarification.id,
                  executionId: execution.id,
                  missingRequiredVariables: nextClarification.fieldDefinitions.map((field) => field.key),
                });
                return NextResponse.json({
                  answer: nextClarification.message,
                  conversationId: persistedConversationId,
                  intent: "need_clarification",
                  confidence: 1,
                  matchedOrchestrationIds: [orchestration.id],
                  matchedOrchestrationNames: [orchestration.name],
                  needsClarification: true,
                  clarifyingQuestions: nextClarification.fieldDefinitions.map((field) => ({
                    question: field.description?.trim()
                      ? field.description.trim()
                      : `Please provide ${field.key}.`,
                    required: true,
                    variableName: field.key,
                  })),
                  requireUserConfirmation: false,
                  plan: [],
                  metadata: {
                    resumedClarificationId: clarification.id,
                    executionId: execution.id,
                    conversationId,
                  },
                });
              }

              const refreshedExecution = await getExecutionById(execution.id);
              const workflowFinal = extractWorkflowFinalResponse(refreshedExecution?.context);
              const answer = workflowFinal.answer
                || `Thanks. I resumed the workflow "${orchestration.name}" using your response.`;
              await persistExchange(answer, {
                intent: "execute_plan",
                resumedClarificationId: clarification.id,
                executionId: execution.id,
                workflowFinalResponsePath: workflowFinal.responsePath,
                workflowFinalResponse: workflowFinal.payload,
                workflowDisplay: workflowFinal.display,
              });
              return NextResponse.json({
                answer,
                display: workflowFinal.display,
                conversationId: persistedConversationId,
                intent: "execute_plan",
                confidence: 1,
                matchedOrchestrationIds: [orchestration.id],
                matchedOrchestrationNames: [orchestration.name],
                needsClarification: false,
                clarifyingQuestions: [],
                requireUserConfirmation: false,
                plan: [],
                metadata: {
                  resumedClarificationId: clarification.id,
                  executionId: execution.id,
                  conversationId,
                  workflowFinalResponsePath: workflowFinal.responsePath,
                  workflowFinalResponse: workflowFinal.payload,
                  workflowDisplay: workflowFinal.display,
                },
              });
            }
          }
        }
      }
    }

    // A continuation probe may only resume an already-paused execution above.
    // It must never fall through to candidate matching or execution creation.
    if (continuationOnly) {
      return NextResponse.json({
        answer: "",
        conversationId: persistedConversationId,
        intent: "fallback",
        needsClarification: false,
      });
    }

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

    const explicitlySelectedId = typeof body.workflow?.id === "string" ? body.workflow.id.trim() : "";
    const explicitlySelected = explicitlySelectedId
      ? candidates.find((candidate) => candidate.id === explicitlySelectedId)
      : undefined;
    const match = explicitlySelected
      ? { candidate: explicitlySelected, confidence: 1, reason: "Explicitly selected by the user" }
      : await findEligibleOrchestration(message, candidates, { forceActionMode });
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
    const readiness = await assessExecutionReadiness(
      selected,
      message,
      history,
      variableExtraction.values
    );

    if (variableExtraction.missing.length > 0 || !readiness.ready) {
      const requiredInputQuestions = variableExtraction.missing.map((definition) => ({
        question: buildRequiredVariableQuestion(definition),
        required: true,
        variableName: definition.name,
      }));
      const semanticQuestions = readiness.questions
        .filter((question) => !requiredInputQuestions.some((item) => (
          item.question.trim().toLowerCase() === question.trim().toLowerCase()
        )))
        .map((question) => ({
          question,
          required: true,
        }));
      const clarifyingQuestions = [...requiredInputQuestions, ...semanticQuestions];
      const answer = clarifyingQuestions.length === 1
        ? clarifyingQuestions[0].question
        : `I need a little more information before I can start:\n${clarifyingQuestions.map((item) => `- ${item.question}`).join("\n")}`;

      return NextResponse.json({
        answer,
        conversationId: persistedConversationId,
        intent: "need_clarification",
        confidence: match.confidence,
        matchedOrchestrationIds: [selected.id],
        matchedOrchestrationNames: [selected.name],
        needsClarification: true,
        clarifyingQuestions,
        requireUserConfirmation: false,
        plan,
        metadata: {
          selectedOrchestrationId: selected.id,
          selectedOrchestrationName: selected.name,
          missingRequiredVariables: variableExtraction.missing.map((definition) => definition.name),
          extractedVariables: variableExtraction.values,
          semanticReadiness: {
            ready: readiness.ready,
            confidence: readiness.confidence,
            missingInformation: readiness.missingInformation,
            reason: readiness.reason,
          },
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
        companyId,
        targetAppId: targetAppId || undefined,
        conversationId: persistedConversationId,
        userMessage: message,
        confidence: match.confidence,
        orchestrationName: selected.name,
      },
      triggeredBy: userId,
    });

    // Keep the persisted trigger audit deliberately compact. The complete
    // execution input remains on orchestration_executions for node processing.
    const triggerAuditPayload = {
      trigger: {
        input: {
          confidence: match.confidence,
          triggerType: "chatbot",
          userMessage: message,
          orchestrationName: selected.name,
        },
        startedAt: execution.startedAt,
        startedBy: userId,
      },
    };

    await createTriggerLog({
      triggerId: selected.triggerId,
      orchestrationId: selected.id,
      executionId: execution.id,
      status: "started",
      payload: triggerAuditPayload,
      triggeredBy: userId,
    });

    const executionResult = await executeChatbotExecution({
      execution,
      orchestrationId: selected.id,
      triggerId: selected.triggerId,
      triggeredBy: userId,
      auditPayload: triggerAuditPayload,
    });

    if (executionResult.status === "paused") {
      const clarification = executionResult.clarification;
      if (clarification) {
        await persistExchange(clarification.message, {
          intent: "need_clarification",
          executionId: execution.id,
          missingRequiredVariables: clarification.fieldDefinitions.map((field) => field.key),
        });
        return NextResponse.json({
          answer: clarification.message,
          conversationId: persistedConversationId,
          intent: "need_clarification",
          confidence: match.confidence,
          matchedOrchestrationIds: [selected.id],
          matchedOrchestrationNames: [selected.name],
          needsClarification: true,
          clarifyingQuestions: clarification.fieldDefinitions.map((field) => ({
            question: field.description?.trim()
              ? `${field.key}: ${field.description.trim()}`
              : `Please provide ${field.key}.`,
            required: true,
            variableName: field.key,
          })),
          requireUserConfirmation: false,
          plan,
          metadata: {
            selectedOrchestrationId: selected.id,
            selectedOrchestrationName: selected.name,
            executionId: execution.id,
            missingRequiredVariables: clarification.fieldDefinitions.map((field) => field.key),
          },
        });
      }
    }

    if (!executionResult.success) {
      return NextResponse.json({
        answer: `Orchestration "${selected.name}" could not be completed.`,
        intent: "execution_failed",
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
          executionError: executionResult.error,
        },
      });
    }

    const refreshedExecution = await getExecutionById(execution.id);
    const workflowFinal = extractWorkflowFinalResponse(refreshedExecution?.context);
    const finalAnswer = workflowFinal.answer || `Approved. I started orchestration "${selected.name}".`;
    await persistExchange(finalAnswer, {
      intent: "execute_plan",
      executionId: execution.id,
      workflowFinalResponsePath: workflowFinal.responsePath,
      workflowFinalResponse: workflowFinal.payload,
      workflowDisplay: workflowFinal.display,
      statusUpdates: workflowFinal.statusUpdates,
    });

    return NextResponse.json({
      answer: finalAnswer,
      display: workflowFinal.display,
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
        workflowFinalResponsePath: workflowFinal.responsePath,
        workflowFinalResponse: workflowFinal.payload,
        workflowDisplay: workflowFinal.display,
        statusUpdates: workflowFinal.statusUpdates,
        normalizedMessage: message,
        originalMessage: rawMessage,
        conversationResolution: {
          usedLLM: contextResolution.usedLLM,
          confidence: contextResolution.confidence,
        },
      },
    });
  } catch (error) {
    if (error instanceof ChatbotApiKeyAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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

function extractWorkflowFinalResponse(context: Record<string, unknown> | null | undefined): {
  answer: string;
  responsePath: string;
  payload: unknown;
  display: unknown;
  statusUpdates: Array<Record<string, unknown>>;
} {
  if (!context || typeof context !== "object") {
    return {
      answer: "",
      responsePath: "",
      payload: null,
      display: null,
      statusUpdates: [],
    };
  }

  const chatbotBucket = context._chatbot as Record<string, unknown> | undefined;
  const responsePath = typeof chatbotBucket?.finalResponsePath === "string"
    ? chatbotBucket.finalResponsePath
    : "finalResponse";
  const answer = typeof chatbotBucket?.finalAnswer === "string" ? chatbotBucket.finalAnswer.trim() : "";
  const payload = responsePath
    ? resolvePathFromObject(context, responsePath)
    : (context as Record<string, unknown>).finalResponse;
  const statusUpdates = Array.isArray(chatbotBucket?.statusUpdates)
    ? (chatbotBucket.statusUpdates as Array<Record<string, unknown>>)
    : [];
  const display = chatbotBucket?.display && typeof chatbotBucket.display === "object"
    ? chatbotBucket.display
    : null;

  return {
    answer,
    responsePath,
    payload,
    display,
    statusUpdates,
  };
}

function resolvePathFromObject(source: Record<string, unknown>, path: string): unknown {
  const trimmed = String(path || "").trim();
  if (!trimmed) {
    return undefined;
  }

  return trimmed.split(".").reduce<unknown>((current, segment) => {
    if (!segment) {
      return current;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, source);
}

async function executeChatbotExecution(input: {
  execution: Awaited<ReturnType<typeof createExecution>>;
  orchestrationId: string;
  triggerId: string | null;
  triggeredBy: string;
  auditPayload: Record<string, unknown>;
}) {
  try {
    const nodes = await getNodes(input.orchestrationId);
    const connections = await getConnections(input.orchestrationId);
    const engine = new OrchestrationEngine(input.execution, nodes, connections);
    const result = await engine.execute();

    if (!result.success && input.triggerId) {
      await createTriggerLog({
        triggerId: input.triggerId,
        orchestrationId: input.orchestrationId,
        executionId: input.execution.id,
        status: "failed",
        payload: input.auditPayload,
        errorMessage: result.error,
        triggeredBy: input.triggeredBy,
      });

      await updateTriggerLastTriggered(input.triggerId, result.error || "Unknown execution error");
      return result;
    }

    if (input.triggerId) {
      await updateTriggerLastTriggered(input.triggerId);
    }
    return result;
  } catch (error) {
    if (input.triggerId) {
      await createTriggerLog({
        triggerId: input.triggerId,
        orchestrationId: input.orchestrationId,
        executionId: input.execution.id,
        status: "failed",
        payload: input.auditPayload,
        errorMessage: error instanceof Error ? error.message : "Unknown execution error",
        triggeredBy: input.triggeredBy,
      });

      await updateTriggerLastTriggered(
        input.triggerId,
        error instanceof Error ? error.message : "Unknown execution error"
      );
    }

    console.error("[Chatbot Workflow Router] Background execution failed:", error);
    return {
      success: false,
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Unknown execution error",
    };
  }
}
