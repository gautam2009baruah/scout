// PlannerAgent (Step 4): the conversational loop behind the AI Planner —
// check for an existing orchestration first, confirm with the user, and
// only fall through to drafting a new one if nothing matches.
//
// Deliberately stateless: handleTurn takes the previous PlannerState (or
// null to start fresh) and returns the next one. The chat entry point built
// in Step 7 owns persisting that state between messages (e.g. on the
// pending-approval record / conversation row) — this module doesn't touch
// the database for session state itself, only for the match search, the
// grounding context, and executing a matched orchestration.

import { getOrchestrationById, getNodes, getConnections, createExecution } from "../db";
import { OrchestrationEngine } from "../engine";
import { getLLMProvider } from "@/lib/llm/providers";
import { checkExternalUserAccess } from "@/lib/chat/access-validator";
import { findMatchingOrchestration, type OrchestrationMatch } from "./matching";
import { getActivePendingPlanRequest } from "./pending-requests";
import { buildPlannerContext, type PlannerContext } from "./context";
import {
  buildDraftingSystemPrompt,
  buildDraftingUserPrompt,
  buildDraftingContextText,
  parseDraftingLLMResponse,
  validateDraftPlan,
  type DraftPlan,
  type DraftPlanStep,
} from "./draft-plan";
import { buildPlanSummary } from "./plan-summary";

export const MAX_CLARIFICATION_ROUNDS = 3;
const MAX_SCHEMA_RETRY_ATTEMPTS = 2;

export type PlannerPhase = "awaiting_match_confirmation" | "awaiting_draft_confirmation" | "drafting_clarification";

export type PlannerState = {
  phase: PlannerPhase;
  requestText: string;
  pendingMatch?: OrchestrationMatch;
  clarificationRound: number;
  clarificationHistory: Array<{ question: string; answer: string }>;
  lastQuestion?: string;
};

export type PlannerTurnResult =
  | { kind: "match_confirmation"; message: string; state: PlannerState }
  | { kind: "match_executed"; message: string; executionStatus: "completed" | "paused" | "failed"; state: null }
  | { kind: "draft_confirmation_prompt"; message: string; state: PlannerState }
  | { kind: "clarifying_question"; message: string; state: PlannerState }
  | { kind: "draft_complete"; message: string; draftPlan: DraftPlan; state: null }
  | { kind: "rephrase_requested"; message: string; state: null }
  | { kind: "declined"; message: string; state: null }
  | { kind: "blocked_pending_lock"; message: string; state: null };

export type PlannerTurnInput = {
  state: PlannerState | null;
  message: string;
  externalUserId: string;
  companyId: string;
  targetAppId: string;
};

export type PlannerAgentDeps = {
  findMatchingOrchestration: typeof findMatchingOrchestration;
  buildPlannerContext: typeof buildPlannerContext;
  draftWithLLM: (input: { companyId: string; systemPrompt: string; userPrompt: string; contextText: string }) => Promise<string>;
  executeOrchestration: (input: {
    orchestrationId: string;
    externalUserId: string;
    companyId: string;
    targetAppId: string;
    requestText: string;
  }) => Promise<{ status: "completed" | "paused" | "failed"; error?: string }>;
  // Step 8: the pending-request lock's service-layer read. Injectable
  // (rather than a direct import call inside handleTurn) so it can be
  // stubbed in tests without a real database — see getActivePendingPlanRequest
  // in ./pending-requests.ts for the real implementation.
  getActivePendingPlanRequest: (input: { targetAppId: string; externalUserId: string }) => Promise<{ id: string } | null>;
};

async function defaultDraftWithLLM(input: { companyId: string; systemPrompt: string; userPrompt: string; contextText: string }) {
  const provider = await getLLMProvider(input.companyId);
  return provider.generate_answer(input.systemPrompt, input.userPrompt, input.contextText);
}

async function defaultExecuteOrchestration(input: {
  orchestrationId: string;
  externalUserId: string;
  companyId: string;
  targetAppId: string;
  requestText: string;
}): Promise<{ status: "completed" | "paused" | "failed"; error?: string }> {
  const orchestration = await getOrchestrationById(input.orchestrationId);
  if (!orchestration) {
    return { status: "failed", error: "Matched orchestration no longer exists." };
  }

  const execution = await createExecution({
    orchestrationId: input.orchestrationId,
    orchestrationVersion: orchestration.version,
    context: {},
    triggerData: {
      triggerType: "chatbot",
      companyId: input.companyId,
      targetAppId: input.targetAppId,
      userMessage: input.requestText,
      source: "ai_planner_match",
    },
    triggeredBy: input.externalUserId,
  });

  const nodes = await getNodes(input.orchestrationId);
  const connections = await getConnections(input.orchestrationId);
  const engine = new OrchestrationEngine(execution, nodes, connections);
  const result = await engine.execute();

  return { status: result.status, error: result.error };
}

export const defaultPlannerAgentDeps: PlannerAgentDeps = {
  findMatchingOrchestration,
  buildPlannerContext,
  draftWithLLM: defaultDraftWithLLM,
  executeOrchestration: defaultExecuteOrchestration,
  getActivePendingPlanRequest,
};

type YesNo = "yes" | "no" | "unclear";

const YES_PATTERN = /^\s*(y|yes|yeah|yep|sure|ok|okay|please|go ahead|do it|run it|confirm)\b/i;
const NO_PATTERN = /^\s*(n|no|nope|nah|cancel|don't|do not|not (that|this|it))\b/i;

function interpretYesNo(message: string): YesNo {
  const trimmed = message.trim();
  if (YES_PATTERN.test(trimmed)) return "yes";
  if (NO_PATTERN.test(trimmed)) return "no";
  return "unclear";
}

function describeMatch(match: OrchestrationMatch): string {
  return match.description?.trim() || match.summaryText;
}

async function offerDraft(requestText: string): Promise<PlannerTurnResult> {
  return {
    kind: "draft_confirmation_prompt",
    message: "None of the available automations can do that yet. Can I create a draft plan for you to submit for admin approval?",
    state: {
      phase: "awaiting_draft_confirmation",
      requestText,
      clarificationRound: 0,
      clarificationHistory: [],
    },
  };
}

async function startMatching(input: PlannerTurnInput, deps: PlannerAgentDeps): Promise<PlannerTurnResult> {
  const match = await deps.findMatchingOrchestration({
    userRequestText: input.message,
    externalUserId: input.externalUserId,
    companyId: input.companyId,
    targetAppId: input.targetAppId,
  });

  if (!match) {
    return offerDraft(input.message);
  }

  return {
    kind: "match_confirmation",
    message: `I found an existing automation that might do this: "${match.name}" — ${describeMatch(match)}. Would you like me to run it?`,
    state: {
      phase: "awaiting_match_confirmation",
      requestText: input.message,
      pendingMatch: match,
      clarificationRound: 0,
      clarificationHistory: [],
    },
  };
}

async function runDraftingRound(
  input: {
    requestText: string;
    clarificationRound: number;
    clarificationHistory: Array<{ question: string; answer: string }>;
    companyId: string;
    targetAppId: string;
    externalUserId: string;
  },
  deps: PlannerAgentDeps
): Promise<PlannerTurnResult> {
  const context = await deps.buildPlannerContext({
    companyId: input.companyId,
    targetAppId: input.targetAppId,
    userId: input.externalUserId,
    requestText: input.requestText,
  });

  const systemPrompt = buildDraftingSystemPrompt();
  const userPrompt = buildDraftingUserPrompt({
    requestText: input.requestText,
    clarificationHistory: input.clarificationHistory,
  });
  const contextText = buildDraftingContextText(context);

  let lastValidationErrors: string[] = [];

  for (let attempt = 0; attempt <= MAX_SCHEMA_RETRY_ATTEMPTS; attempt += 1) {
    const retryNote = lastValidationErrors.length
      ? `\n\nYour previous draft_plan failed validation:\n${lastValidationErrors.join("\n")}\nFix these issues and respond again with the same JSON shape.`
      : "";

    const raw = await deps.draftWithLLM({
      companyId: input.companyId,
      systemPrompt,
      userPrompt: userPrompt + retryNote,
      contextText,
    });

    const parsed = parseDraftingLLMResponse(raw);

    if (parsed.type === "error") {
      lastValidationErrors = [parsed.message];
      continue;
    }

    if (parsed.type === "clarifying_question") {
      if (input.clarificationRound >= MAX_CLARIFICATION_ROUNDS) {
        return {
          kind: "rephrase_requested",
          message: "I still need more information to draft this automatically. Could you try rephrasing your request with more detail?",
          state: null,
        };
      }

      return {
        kind: "clarifying_question",
        message: parsed.question,
        state: {
          phase: "drafting_clarification",
          requestText: input.requestText,
          clarificationRound: input.clarificationRound + 1,
          clarificationHistory: input.clarificationHistory,
          lastQuestion: parsed.question,
        },
      };
    }

    const errors = validateDraftPlan(parsed.steps);
    if (errors.length === 0) {
      const draftPlan: DraftPlan = { requestText: input.requestText, steps: parsed.steps };
      return {
        kind: "draft_complete",
        message: [
          "I've put together a draft plan and I'm submitting it for admin approval. Here's what it will do:",
          "",
          buildPlanSummary(draftPlan),
        ].join("\n"),
        draftPlan,
        state: null,
      };
    }

    lastValidationErrors = errors;
  }

  return {
    kind: "rephrase_requested",
    message: "I wasn't able to put together a valid draft plan for that request. Could you try rephrasing it?",
    state: null,
  };
}

/**
 * Advances a planner conversation by one user message. See the module
 * comment for why this is stateless — callers persist PlannerState between
 * turns however suits their transport (Step 7's chat route, or a test).
 */
export async function handleTurn(input: PlannerTurnInput, deps: PlannerAgentDeps = defaultPlannerAgentDeps): Promise<PlannerTurnResult> {
  if (!input.state) {
    return startMatching(input, deps);
  }

  if (input.state.phase === "awaiting_match_confirmation") {
    const answer = interpretYesNo(input.message);

    if (answer === "yes" && input.state.pendingMatch) {
      const outcome = await deps.executeOrchestration({
        orchestrationId: input.state.pendingMatch.orchestrationId,
        externalUserId: input.externalUserId,
        companyId: input.companyId,
        targetAppId: input.targetAppId,
        requestText: input.state.requestText,
      });

      const message =
        outcome.status === "completed"
          ? `Done — I ran "${input.state.pendingMatch.name}" for you.`
          : outcome.status === "paused"
            ? `I started "${input.state.pendingMatch.name}" — it needs one more thing from you before it can finish.`
            : `I tried to run "${input.state.pendingMatch.name}" but it failed: ${outcome.error || "unknown error"}.`;

      return { kind: "match_executed", message, executionStatus: outcome.status, state: null };
    }

    // "no" or an unclear reply both mean this isn't the right match — fall
    // through to offering a fresh draft rather than guessing.
    return offerDraft(input.state.requestText);
  }

  if (input.state.phase === "awaiting_draft_confirmation") {
    const answer = interpretYesNo(input.message);

    if (answer !== "yes") {
      return {
        kind: "declined",
        message: "No problem — let me know if you'd like to describe it differently.",
        state: null,
      };
    }

    // Step 8: the pending-request lock, enforced here at the service layer
    // rather than only in the chat UI (Step 7's disabled entry), so it can't
    // be bypassed by calling this function/the API directly. Checked once,
    // right before a NEW drafting request is accepted — not on every
    // clarification-round continuation below, since those aren't new
    // requests. The existing-match path (startMatching/awaiting_match_confirmation
    // above) deliberately does NOT check this lock — running an
    // already-approved orchestration is a different, safe action.
    await checkExternalUserAccess(input.externalUserId, "ai_planner_draft");
    const pendingLock = await deps.getActivePendingPlanRequest({
      targetAppId: input.targetAppId,
      externalUserId: input.externalUserId,
    });
    if (pendingLock) {
      return {
        kind: "blocked_pending_lock",
        message: "You already have a request pending admin approval. Please wait for that to be resolved before submitting a new one.",
        state: null,
      };
    }

    return runDraftingRound(
      {
        requestText: input.state.requestText,
        clarificationRound: input.state.clarificationRound,
        clarificationHistory: input.state.clarificationHistory,
        companyId: input.companyId,
        targetAppId: input.targetAppId,
        externalUserId: input.externalUserId,
      },
      deps
    );
  }

  // drafting_clarification: the incoming message answers state.lastQuestion.
  const clarificationHistory = [
    ...input.state.clarificationHistory,
    { question: input.state.lastQuestion || "", answer: input.message },
  ];

  return runDraftingRound(
    {
      requestText: input.state.requestText,
      clarificationRound: input.state.clarificationRound,
      clarificationHistory,
      companyId: input.companyId,
      targetAppId: input.targetAppId,
      externalUserId: input.externalUserId,
    },
    deps
  );
}

export type { DraftPlan, DraftPlanStep };
