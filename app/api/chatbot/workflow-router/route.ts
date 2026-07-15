import { NextResponse, type NextRequest } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { executeAIDecisionNode } from "@/lib/orchestrations/nodes/ai-decision-node";
import { executeNotificationNode } from "@/lib/orchestrations/nodes/notification-node";
import { getConnections, getNodes, getOrchestrationPage } from "@/lib/orchestrations/db";
import { getLLMProvider } from "@/lib/llm/providers";
import type { AIDecisionNodeConfig, NotificationNodeConfig } from "@/shared/orchestrationTypes";

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

type DynamicActionParams =
  | { actionType: "send_email"; to: string; subject: string; body: string; bodyIsHtml: boolean }
  | { actionType: "unknown" };

type DynamicExecutionResult = {
  success: boolean;
  answer: string;
  executionStatus?: "sent" | "queued_not_sent" | "failed";
  outboxId?: string;
  adminError?: string;
};

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

function buildHeuristicEmailContent(message: string): { subject: string; body: string } {
  const normalized = message.toLowerCase();

  if (normalized.includes("birthday")) {
    return {
      subject: "Happy Birthday",
      body: "Hi,\n\nWishing you a very happy birthday and a wonderful year ahead.\n\nBest regards,\nScout Assistant",
    };
  }

  return {
    subject: "Notification",
    body: `Hi,\n\n${message}\n\nBest regards,\nScout Assistant`,
  };
}

async function extractDynamicActionParams(message: string): Promise<DynamicActionParams> {
  const heuristicRecipient = extractEmailAddress(message);
  const looksLikeEmailAction = /\b(send|email|mail|notify|notification|deliver|forward|again|birthday)\b/i.test(message);

  if (heuristicRecipient && looksLikeEmailAction) {
    const heuristicContent = buildHeuristicEmailContent(message);
    return {
      actionType: "send_email",
      to: heuristicRecipient,
      subject: heuristicContent.subject,
      body: heuristicContent.body,
      bodyIsHtml: false,
    };
  }

  try {
    const provider = await getLLMProvider();
    const systemPrompt = [
      "You extract structured action parameters from user requests. Return JSON only, no markdown.",
      "Identify what action to perform and extract parameters.",
      'Return this exact shape: {"actionType":"send_email|unknown","to":"","subject":"","body":"","bodyIsHtml":false}',
      "For send_email: extract recipient email address, infer a subject, and compose a professional message body based on user intent.",
      "If the action is not a notification/email, set actionType to unknown.",
    ].join(" ");

    const raw = await provider.generate_answer(systemPrompt, `User request: ${message}`, "");
    const parsed = parseJsonObject(raw || "");

    if (parsed?.actionType === "send_email" && typeof parsed.to === "string" && parsed.to.trim()) {
      return {
        actionType: "send_email",
        to: String(parsed.to).trim(),
        subject: typeof parsed.subject === "string" ? parsed.subject : "Notification",
        body: typeof parsed.body === "string" ? parsed.body : message,
        bodyIsHtml: parsed.bodyIsHtml === true,
      };
    }
  } catch {
    // Fall through to unknown
  }
  return { actionType: "unknown" };
}

async function executeDynamicPlan(message: string): Promise<DynamicExecutionResult> {
  const params = await extractDynamicActionParams(message);

  if (params.actionType === "send_email") {
    const config: NotificationNodeConfig = {
      type: "notification",
      channels: {
        email: {
          enabled: true,
          to: params.to,
          subject: params.subject,
          body: params.body,
          bodyFormat: params.bodyIsHtml ? "rich_text" : "plain_text",
        },
      },
    };

    const result = await executeNotificationNode(config, {});
    const outboxId = (() => {
      const results = Array.isArray(result.output?.channelResults)
        ? (result.output?.channelResults as Array<Record<string, unknown>>)
        : [];
      const emailChannel = results.find((entry) => entry.channel === "email") || null;
      if (!emailChannel || typeof emailChannel !== "object") {
        return undefined;
      }

      const details = (emailChannel.details && typeof emailChannel.details === "object")
        ? (emailChannel.details as Record<string, unknown>)
        : null;

      return typeof details?.outboxId === "string" ? details.outboxId : undefined;
    })();

    const normalizedError = String(result.error || "");
    const queuedNotSent = /SMTP not configured/i.test(normalizedError);

    if (result.success) {
      return {
        success: true,
        answer: `Done! I sent the email to **${params.to}** with subject "${params.subject}".`,
        executionStatus: "sent",
        outboxId,
      };
    }

    if (queuedNotSent) {
      return {
        success: false,
        answer: "I could not complete that email delivery right now. The attempt is logged for administrators in Control Panel.",
        executionStatus: "queued_not_sent",
        outboxId,
        adminError: normalizedError,
      };
    }

    return {
      success: false,
      answer: "I could not complete that action right now. I logged technical details for administrators, and I can continue with a draft workflow path.",
      executionStatus: "failed",
      outboxId,
      adminError: normalizedError,
    };
  }

  return { success: false, answer: "" };
}

export async function POST(request: NextRequest) {
  try {
    const body: WorkflowRouterRequest = await request.json();
    const companyId = body.companyId || "";
    const userId = body.userId || "";
    const targetAppId = body.targetAppId || "";
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

    if (candidates.length === 0 && !body.allowDraftPlan) {
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
        metadata: {
          awaitingDraftPlanPermission: true,
        },
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
        history,
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
    const matchedIds = Array.isArray(output.matchedOrchestrationIds)
      ? output.matchedOrchestrationIds.filter((value): value is string => typeof value === "string")
      : [];
    const matchedNamesFromModel = Array.isArray(output.matchedOrchestrationNames)
      ? output.matchedOrchestrationNames.filter((value): value is string => typeof value === "string")
      : [];
    const matchedNamesFromIds = matchedIds
      .map((id) => candidates.find((candidate) => candidate.id === id)?.name)
      .filter((name): name is string => typeof name === "string");
    const matchedNames = matchedNamesFromModel.length > 0 ? matchedNamesFromModel : matchedNamesFromIds;
    const plan = Array.isArray(output.plan)
      ? output.plan.filter((value) => Boolean(value && typeof value === "object"))
      : [];
    const handle = typeof output.handle === "string" ? output.handle : "";
    const metadata = {
      ...(output.metadata && typeof output.metadata === "object" ? output.metadata as Record<string, unknown> : {}),
    };

    // Stage-gate dynamic plan generation behind explicit user confirmation.
    // In forceActionMode, any no-match/no-plan path must ask for draft permission.
    if (matchedIds.length === 0 && plan.length === 0 && !body.allowDraftPlan && (handle === "dynamic_plan" || forceActionMode)) {
      return NextResponse.json({
        answer: "I could not find a matching orchestration. Should I prepare a draft plan from the currently available nodes?",
        intent: "need_clarification",
        confidence: output.confidence ?? 0,
        decision: output.decision,
        handle: output.handle,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        needsClarification: true,
        clarifyingQuestions: [
          {
            question: "Do you want me to prepare a draft plan from available nodes?",
            required: true,
          },
        ],
        requireUserConfirmation: true,
        plan: [],
        metadata: {
          ...metadata,
          awaitingDraftPlanPermission: true,
        },
      });
    }

    if (body.allowDraftPlan && (handle === "dynamic_plan" || matchedIds.length === 0)) {
      const dynamicResult = await executeDynamicPlan(message);
      if (dynamicResult.answer) {
        return NextResponse.json({
          answer: dynamicResult.answer,
          intent: dynamicResult.success ? "execute_plan" : "fallback",
          confidence: output.confidence ?? 0.8,
          decision: output.decision,
          handle: "dynamic_plan",
          matchedOrchestrationIds: [],
          matchedOrchestrationNames: [],
          needsClarification: false,
          clarifyingQuestions: [],
          requireUserConfirmation: false,
          plan,
          metadata: {
            ...metadata,
            executedDynamically: true,
            executionSucceeded: dynamicResult.success,
            dynamicExecutionStatus: dynamicResult.executionStatus ?? "unknown",
            outboxId: dynamicResult.outboxId ?? null,
            dynamicExecutionError: dynamicResult.adminError ?? null,
            normalizedMessage: message,
            originalMessage: rawMessage,
            conversationResolution: {
              usedLLM: contextResolution.usedLLM,
              confidence: contextResolution.confidence,
            },
          },
        });
      }
    }

    if (body.allowDraftPlan && matchedIds.length === 0 && plan.length === 0) {
      return NextResponse.json({
        answer: "I cannot prepare this request from the currently available nodes. Please add the required node capabilities or refine the request.",
        intent: "fallback",
        confidence: output.confidence ?? 0,
        decision: output.decision,
        handle: output.handle,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        needsClarification: false,
        clarifyingQuestions: [],
        requireUserConfirmation: false,
        plan: [],
        metadata: {
          ...metadata,
          unsupportedByAvailableNodes: true,
        },
      });
    }

    if (forceActionMode && matchedIds.length === 0 && plan.length === 0) {
      return NextResponse.json({
        answer: "I could not route this to an orchestration yet. Should I prepare a draft plan from the available nodes?",
        intent: "need_clarification",
        confidence: output.confidence ?? 0,
        decision: output.decision,
        handle: output.handle,
        matchedOrchestrationIds: [],
        matchedOrchestrationNames: [],
        needsClarification: true,
        clarifyingQuestions: [
          {
            question: "Do you want me to prepare a draft plan from available nodes?",
            required: true,
          },
        ],
        requireUserConfirmation: true,
        plan: [],
        metadata: {
          ...metadata,
          awaitingDraftPlanPermission: true,
        },
      });
    }

    return NextResponse.json({
      answer: buildRouterAnswer(output, candidates),
      intent: output.intent ?? "fallback",
      confidence: output.confidence ?? 0,
      decision: output.decision,
      handle: output.handle,
      matchedOrchestrationIds: matchedIds,
      matchedOrchestrationNames: matchedNames,
      needsClarification: output.needsClarification ?? false,
      clarifyingQuestions: output.clarifyingQuestions ?? [],
      requireUserConfirmation: output.requireUserConfirmation ?? false,
      plan,
      metadata,
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