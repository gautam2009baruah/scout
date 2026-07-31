import assert from "node:assert/strict";
import test from "node:test";

import { handleTurn, MAX_CLARIFICATION_ROUNDS, type PlannerAgentDeps, type PlannerState } from "@/lib/orchestrations/planner/agent";
import { buildDraftingSystemPrompt, validateDraftPlan } from "@/lib/orchestrations/planner/draft-plan";
import type { PlannerContext } from "@/lib/orchestrations/planner/context";
import type { OrchestrationMatch } from "@/lib/orchestrations/planner/matching";

const BASE_INPUT = {
  externalUserId: "ext-user-1",
  companyId: "company-1",
  targetAppId: "target-app-1",
};

const EMPTY_CONTEXT: PlannerContext = {
  companyId: BASE_INPUT.companyId,
  targetAppId: BASE_INPUT.targetAppId,
  schemas: [],
  knowledge: { query: "", chunks: [], citations: [], formattedText: "" },
};

function makeDeps(overrides: Partial<PlannerAgentDeps> = {}): PlannerAgentDeps {
  return {
    findMatchingOrchestration: async () => null,
    buildPlannerContext: async () => EMPTY_CONTEXT,
    draftWithLLM: async () => {
      throw new Error("draftWithLLM not stubbed for this test");
    },
    executeOrchestration: async () => {
      throw new Error("executeOrchestration not stubbed for this test");
    },
    getActivePendingPlanRequest: async () => null,
    ...overrides,
  };
}

// --- Existing-match case ---------------------------------------------------

test("a high-confidence match asks for confirmation, then executes on yes", async () => {
  const match: OrchestrationMatch = {
    orchestrationId: "orch-1",
    name: "Expense Approval",
    description: "Routes expense reports to a manager for approval.",
    summaryText: "Expense Approval\nRoutes expense reports to a manager for approval.",
    score: 0.91,
  };

  let executeCalledWith: unknown = null;
  const deps = makeDeps({
    findMatchingOrchestration: async () => match,
    executeOrchestration: async (input) => {
      executeCalledWith = input;
      return { status: "completed" };
    },
  });

  const first = await handleTurn({ state: null, message: "submit an expense report", ...BASE_INPUT }, deps);
  assert.equal(first.kind, "match_confirmation");
  assert.match(first.message, /Expense Approval/);
  assert.equal(first.state?.phase, "awaiting_match_confirmation");

  const second = await handleTurn({ state: first.state!, message: "yes please", ...BASE_INPUT }, deps);
  assert.equal(second.kind, "match_executed");
  assert.equal(second.state, null);
  assert.ok(executeCalledWith);
  assert.equal((executeCalledWith as { orchestrationId: string }).orchestrationId, "orch-1");
});

// --- Rejected-match-falls-through case -------------------------------------

test("rejecting a proposed match falls through to a draft offer instead of an existing-match run", async () => {
  const match: OrchestrationMatch = {
    orchestrationId: "orch-1",
    name: "Expense Approval",
    description: "Routes expense reports to a manager for approval.",
    summaryText: "Expense Approval",
    score: 0.8,
  };

  let executeCalled = false;
  const deps = makeDeps({
    findMatchingOrchestration: async () => match,
    executeOrchestration: async () => {
      executeCalled = true;
      return { status: "completed" };
    },
  });

  const first = await handleTurn({ state: null, message: "submit an expense report", ...BASE_INPUT }, deps);
  assert.equal(first.kind, "match_confirmation");

  const second = await handleTurn({ state: first.state!, message: "no that's not it", ...BASE_INPUT }, deps);
  assert.equal(second.kind, "draft_confirmation_prompt");
  assert.equal(second.state?.phase, "awaiting_draft_confirmation");
  assert.equal(executeCalled, false, "the matched orchestration must not run once the user rejects it");
});

test("no match found goes straight to a draft offer", async () => {
  const deps = makeDeps({ findMatchingOrchestration: async () => null });
  const result = await handleTurn({ state: null, message: "do something novel", ...BASE_INPUT }, deps);
  assert.equal(result.kind, "draft_confirmation_prompt");
});

// --- Step 8: pending-request lock enforced at the service layer -----------

test("a second drafting request is rejected at the service layer while one is already pending", async () => {
  let draftWithLLMCalled = false;
  const deps = makeDeps({
    getActivePendingPlanRequest: async () => ({ id: "existing-pending-request" }),
    draftWithLLM: async () => {
      draftWithLLMCalled = true;
      throw new Error("drafting must not start while a request is pending");
    },
  });

  const state: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "automate something else while one is already pending",
    clarificationRound: 0,
    clarificationHistory: [],
  };
  const result = await handleTurn({ state, message: "yes", ...BASE_INPUT }, deps);

  assert.equal(result.kind, "blocked_pending_lock");
  assert.equal(result.state, null);
  assert.match(result.message, /already have a request pending/i);
  assert.equal(draftWithLLMCalled, false, "the LLM must never be called once the pending lock rejects the request");
});

test("the pending lock is only checked when accepting a NEW drafting request, not on clarification continuations", async () => {
  let lockCheckCount = 0;
  const deps = makeDeps({
    getActivePendingPlanRequest: async () => {
      lockCheckCount += 1;
      return null;
    },
    draftWithLLM: async () => JSON.stringify({ type: "clarifying_question", question: "What system should this touch?" }),
  });

  const initialState: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "do something",
    clarificationRound: 0,
    clarificationHistory: [],
  };
  const first = await handleTurn({ state: initialState, message: "yes", ...BASE_INPUT }, deps);
  assert.equal(first.kind, "clarifying_question");
  assert.equal(lockCheckCount, 1, "accepting the new drafting request should check the lock exactly once");

  const second = await handleTurn({ state: first.state!, message: "the billing system", ...BASE_INPUT }, deps);
  assert.equal(second.kind, "clarifying_question");
  assert.equal(lockCheckCount, 1, "a clarification-round continuation is not a new request and must not re-check the lock");
});

test("the existing-match path is never blocked by the pending lock", async () => {
  const match: OrchestrationMatch = {
    orchestrationId: "orch-1",
    name: "Expense Approval",
    description: "Routes expense reports to a manager for approval.",
    summaryText: "Expense Approval",
    score: 0.9,
  };
  let lockChecked = false;
  const deps = makeDeps({
    findMatchingOrchestration: async () => match,
    getActivePendingPlanRequest: async () => {
      lockChecked = true;
      return { id: "existing-pending-request" };
    },
    executeOrchestration: async () => ({ status: "completed" }),
  });

  const first = await handleTurn({ state: null, message: "submit an expense report", ...BASE_INPUT }, deps);
  assert.equal(first.kind, "match_confirmation");

  const second = await handleTurn({ state: first.state!, message: "yes", ...BASE_INPUT }, deps);
  assert.equal(second.kind, "match_executed", "running an already-approved match must succeed even with a pending draft outstanding");
  assert.equal(lockChecked, false, "the match-and-run path must never consult the drafting pending-lock");
});

test("declining the draft offer ends the session without drafting", async () => {
  const deps = makeDeps();
  const state: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "do something novel",
    clarificationRound: 0,
    clarificationHistory: [],
  };
  const result = await handleTurn({ state, message: "no thanks", ...BASE_INPUT }, deps);
  assert.equal(result.kind, "declined");
  assert.equal(result.state, null);
});

// --- Clarification round limit ---------------------------------------------

test("clarification rounds are capped at MAX_CLARIFICATION_ROUNDS before asking to rephrase", async () => {
  const deps = makeDeps({
    draftWithLLM: async () => JSON.stringify({ type: "clarifying_question", question: "Which system should this notify?" }),
  });

  let state: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "notify someone about something",
    clarificationRound: 0,
    clarificationHistory: [],
  };

  for (let round = 0; round < MAX_CLARIFICATION_ROUNDS; round += 1) {
    const result = await handleTurn({ state, message: round === 0 ? "yes" : "I'm not sure", ...BASE_INPUT }, deps);
    assert.equal(result.kind, "clarifying_question", `round ${round} should still be clarifying`);
    state = result.state!;
  }

  const finalResult = await handleTurn({ state, message: "still not sure", ...BASE_INPUT }, deps);
  assert.equal(finalResult.kind, "rephrase_requested");
  assert.equal(finalResult.state, null);
});

// --- Schema-validation retry -------------------------------------------------

test("an invalid draft_plan is rejected and the LLM is retried before succeeding", async () => {
  let callCount = 0;
  const deps = makeDeps({
    draftWithLLM: async () => {
      callCount += 1;
      if (callCount === 1) {
        // Missing required "outputVariable" for ai_task.
        return JSON.stringify({
          type: "draft_plan",
          steps: [{ nodeType: "ai_task", label: "Summarize", justification: "User asked for a summary.", params: { instructionMode: "static", instruction: "Summarize", outputFormat: "text" } }],
        });
      }
      return JSON.stringify({
        type: "draft_plan",
        steps: [
          { nodeType: "ai_task", label: "Summarize", justification: "User asked for a summary.", params: { instructionMode: "static", instruction: "Summarize", outputFormat: "text", outputVariable: "summary" } },
          { nodeType: "end", label: "Done", justification: "Show the summary to the user.", params: {} },
        ],
      });
    },
  });

  const state: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "summarize this",
    clarificationRound: 0,
    clarificationHistory: [],
  };
  const result = await handleTurn({ state, message: "yes", ...BASE_INPUT }, deps);
  assert.equal(result.kind, "draft_complete");
  assert.equal(callCount, 2, "the LLM should be retried exactly once after the first invalid draft");
});

test("a draft_plan that never becomes valid ends in a rephrase request, not a broken draft", async () => {
  const deps = makeDeps({
    draftWithLLM: async () =>
      JSON.stringify({ type: "draft_plan", steps: [{ nodeType: "not_a_real_tool", label: "??", justification: "n/a", params: {} }] }),
  });

  const state: PlannerState = {
    phase: "awaiting_draft_confirmation",
    requestText: "do the impossible thing",
    clarificationRound: 0,
    clarificationHistory: [],
  };
  const result = await handleTurn({ state, message: "yes", ...BASE_INPUT }, deps);
  assert.equal(result.kind, "rephrase_requested");
});

test("a draft_plan step missing a justification fails validation", () => {
  const errors = validateDraftPlan([
    { nodeType: "end", label: "Done", justification: "", params: {} },
  ]);
  assert.ok(errors.some((error) => error.includes("justification")));
});

test("planner catalog explains when and how to use switch routing", () => {
  const prompt = buildDraftingSystemPrompt();
  assert.match(prompt, /"name": "switch"/);
  assert.match(prompt, /three or more outcomes/i);
  assert.match(prompt, /route ids as branch keys/i);
});

test("switch draft validation requires matching route and default branches", () => {
  const validStep = {
    nodeType: "switch",
    label: "Route invoice status",
    justification: "The invoice status has four named outcomes requiring different actions.",
    params: {
      variable: "{{invoice.status}}",
      routes: [
        { id: "approved", name: "Approved", operator: "equals", value: "approved", valueType: "auto" },
        { id: "rejected", name: "Rejected", operator: "equals", value: "rejected", valueType: "auto" },
      ],
    },
    branches: {
      approved: [{ nodeType: "end", label: "Approved", justification: "The approved path is complete.", params: {} }],
      rejected: [{ nodeType: "end", label: "Rejected", justification: "The rejected path is complete.", params: {} }],
      default: [{ nodeType: "end", label: "Review", justification: "Unexpected statuses need a safe fallback.", params: {} }],
    },
  };

  assert.deepEqual(validateDraftPlan([validStep]), []);

  const invalidStep = {
    ...validStep,
    branches: {
      approved: validStep.branches.approved,
      unknown: validStep.branches.rejected,
    },
  };
  const errors = validateDraftPlan([invalidStep]);
  assert.ok(errors.some((error) => error.includes("branches.default")));
  assert.ok(errors.some((error) => error.includes("branches.unknown")));
  assert.ok(errors.some((error) => error.includes("branches.rejected")));
});

// --- Drafting branch: 10 example requests of varying ambiguity -------------
//
// These stub draftWithLLM with the response a real model *should* produce
// for a request of the stated ambiguity level, then assert PlannerAgent
// takes the correct path (routing, validation, phase transitions) given
// that response. This tests the state machine's mechanism, not the LLM's
// judgment — judging whether a real model actually produces a good
// draft/question for ambiguous prose is Step 10's eval-harness job (real
// model calls against ~30 requests), not something a deterministic unit
// test should depend on.

type DraftingCase = {
  description: string;
  requestText: string;
  llmResponse: Record<string, unknown>;
  expectedKind: "draft_complete" | "clarifying_question";
};

const DRAFTING_CASES: DraftingCase[] = [
  {
    description: "fully specified: notify a Slack channel",
    requestText: "Send a Slack message to #ops saying the deploy finished",
    llmResponse: {
      type: "draft_plan",
      steps: [
        {
          nodeType: "notification",
          label: "Notify #ops",
          justification: "User explicitly asked to post to Slack #ops with this exact message.",
          params: { channels: { slack: { enabled: true, message: "Deploy finished." } } },
        },
        { nodeType: "end", label: "Done", justification: "No further output needed once the notification is sent.", params: {} },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "fully specified: summarize an attached document",
    requestText: "Summarize the attached document for me",
    llmResponse: {
      type: "draft_plan",
      steps: [
        { nodeType: "file_parser", label: "Read attachment", justification: "User referred to \"the attached document\", so the chat attachment must be read first.", params: { sourceVariablePath: "trigger.input.attachments.0", extractMode: "text", outputVariable: "parsedFile" } },
        { nodeType: "ai_task", label: "Summarize", justification: "User asked for a summary of the document's text.", params: { instructionMode: "static", instruction: "Summarize this document.", outputFormat: "text", outputVariable: "summary" } },
        { nodeType: "end", label: "Show summary", justification: "Return the generated summary to the user.", params: { displayMessage: true, message: "{{summary}}" } },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "fully specified: query overdue invoices and email finance",
    requestText: "Look up outstanding invoices over $10,000 and email finance",
    llmResponse: {
      type: "draft_plan",
      steps: [
        { nodeType: "database", label: "Find large invoices", justification: "User asked to look up invoices over $10,000, which requires querying the invoices schema.", params: { schemaId: "finance-db" } },
        { nodeType: "notification", label: "Email finance", justification: "User explicitly asked to email finance with the results.", params: { channels: { email: { enabled: true, to: "finance@example.com", body: "See attached results." } } } },
        { nodeType: "end", label: "Done", justification: "No further output needed once finance is notified.", params: {} },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "vague: no actionable target",
    requestText: "Do something with the data",
    llmResponse: { type: "clarifying_question", question: "Which data source, and what should be done with it?" },
    expectedKind: "clarifying_question",
  },
  {
    description: "vague: no task at all",
    requestText: "Help me",
    llmResponse: { type: "clarifying_question", question: "What would you like help automating?" },
    expectedKind: "clarifying_question",
  },
  {
    description: "vague: missing recipient and condition",
    requestText: "Notify someone if something goes wrong",
    llmResponse: { type: "clarifying_question", question: "Who should be notified, and what counts as \"something going wrong\"?" },
    expectedKind: "clarifying_question",
  },
  {
    description: "fully specified: extract fields from a PDF and store them",
    requestText: "Extract the invoice number and amount from the uploaded PDF and store them",
    llmResponse: {
      type: "draft_plan",
      steps: [
        { nodeType: "file_parser", label: "Read PDF", justification: "User referred to \"the uploaded PDF\", so the attachment must be read first.", params: { sourceVariablePath: "trigger.input.attachments.0", extractMode: "text", outputVariable: "parsedFile" } },
        { nodeType: "ai_extraction", label: "Extract fields", justification: "User asked specifically for invoice number and amount to be extracted.", params: { schema: { invoiceNumber: { type: "string" }, amount: { type: "number" } }, outputVariable: "extracted" } },
        { nodeType: "variable", label: "Store values", justification: "User asked for the extracted values to be stored.", params: { variables: [{ name: "invoiceNumber", value: "{{extracted.invoiceNumber}}" }] } },
        { nodeType: "end", label: "Done", justification: "No further output needed once the values are stored.", params: {} },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "fully specified with a conditional branch",
    requestText: "If the ticket priority is high, alert the on-call engineer, otherwise just log it",
    llmResponse: {
      type: "draft_plan",
      steps: [
        {
          nodeType: "condition",
          label: "Check priority",
          justification: "User's request is conditional on the ticket's priority field.",
          params: { conditions: [{ variable: "{{trigger.input.priority}}", operator: "equals", value: "high" }] },
          branches: {
            true: [{ nodeType: "notification", label: "Alert on-call", justification: "User said to alert the on-call engineer when priority is high.", params: { channels: { email: { enabled: true, to: "oncall@example.com", body: "High priority ticket." } } } }],
            false: [{ nodeType: "variable", label: "Log only", justification: "User said to just log it otherwise.", params: { variables: [{ name: "logged", value: "true" }] } }],
          },
        },
        { nodeType: "end", label: "Done", justification: "No further output needed once the branch completes.", params: {} },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "fully specified: knowledge base lookup",
    requestText: "Search the knowledge base for our refund policy and tell me",
    llmResponse: {
      type: "draft_plan",
      steps: [
        { nodeType: "knowledge_search", label: "Find refund policy", justification: "User asked to search the knowledge base for the refund policy.", params: { query: "refund policy", outputVariable: "policySearch" } },
        { nodeType: "ai_task", label: "Answer from passages", justification: "User asked to be told the policy, so the retrieved passages need to be turned into an answer.", params: { instructionMode: "static", instruction: "Answer using the retrieved passages.", input: "{{policySearch}}", outputFormat: "text", outputVariable: "answer" } },
        { nodeType: "end", label: "Show answer", justification: "Return the generated answer to the user.", params: { displayMessage: true, message: "{{answer}}" } },
      ],
    },
    expectedKind: "draft_complete",
  },
  {
    description: "vague: open-ended multi-step process with no concrete steps named",
    requestText: "Automate my onboarding process",
    llmResponse: { type: "clarifying_question", question: "What are the specific steps in your onboarding process you'd like automated?" },
    expectedKind: "clarifying_question",
  },
];

for (const testCase of DRAFTING_CASES) {
  test(`drafting branch — ${testCase.description}`, async () => {
    const deps = makeDeps({ draftWithLLM: async () => JSON.stringify(testCase.llmResponse) });
    const state: PlannerState = {
      phase: "awaiting_draft_confirmation",
      requestText: testCase.requestText,
      clarificationRound: 0,
      clarificationHistory: [],
    };
    const result = await handleTurn({ state, message: "yes", ...BASE_INPUT }, deps);
    assert.equal(result.kind, testCase.expectedKind);

    if (result.kind === "draft_complete") {
      assert.equal(validateDraftPlan(result.draftPlan.steps).length, 0, "canned draft_plan fixtures must themselves be schema-valid");
      const missingJustification = result.draftPlan.steps.some((step) => !step.justification?.trim());
      assert.equal(missingJustification, false, "every drafted step must carry a justification (Step 6)");
    }
  });
}
