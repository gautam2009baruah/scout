import assert from "node:assert/strict";
import test from "node:test";

import { buildPlanSummary } from "@/lib/orchestrations/planner/plan-summary";
import type { DraftPlan } from "@/lib/orchestrations/planner/draft-plan";

test("matches the roadmap's own example format for a simple condition branch", () => {
  const draftPlan: DraftPlan = {
    requestText: "Check last month's revenue and notify the right person",
    steps: [
      {
        nodeType: "database",
        label: "Sales database (last month's revenue)",
        justification: "User asked about last month's revenue.",
        params: { schemaId: "sales-db" },
      },
      {
        nodeType: "condition",
        label: "If revenue > $1,000,000",
        justification: "User's request branches on the revenue threshold.",
        params: { conditions: [{ variable: "{{databaseQuery.result}}", operator: "greater_than", value: 1000000 }] },
        branches: {
          true: [{ nodeType: "notification", label: "Notify CEO", justification: "High revenue routes to the CEO.", params: {} }],
          false: [{ nodeType: "notification", label: "Notify VP", justification: "Lower revenue routes to the VP.", params: {} }],
        },
      },
    ],
  };

  const summary = buildPlanSummary(draftPlan);
  assert.equal(
    summary,
    [
      "1. Query: Sales database (last month's revenue)",
      "2. Condition: If revenue > $1,000,000",
      "   → Yes: Notify: Notify CEO",
      "   → No: Notify: Notify VP",
    ].join("\n")
  );
});

test("omits end steps from the visible summary", () => {
  const draftPlan: DraftPlan = {
    requestText: "Summarize the document",
    steps: [
      { nodeType: "ai_task", label: "Summarize", justification: "User asked for a summary.", params: {} },
      { nodeType: "end", label: "Done", justification: "Show the summary.", params: {} },
    ],
  };

  const summary = buildPlanSummary(draftPlan);
  assert.equal(summary, "1. AI Task: Summarize");
  assert.doesNotMatch(summary, /Finish/);
});

test("a plan with only an end step falls back to a friendly empty message", () => {
  const draftPlan: DraftPlan = {
    requestText: "do nothing",
    steps: [{ nodeType: "end", label: "Done", justification: "n/a", params: {} }],
  };
  assert.equal(buildPlanSummary(draftPlan), "This automation doesn't have any visible steps yet.");
});

test("multi-step branches render with 'then' continuation lines", () => {
  const draftPlan: DraftPlan = {
    requestText: "If priority is high, get manager approval before notifying on-call; otherwise log it",
    steps: [
      {
        nodeType: "condition",
        label: "Check priority",
        justification: "Branches on ticket priority.",
        params: { conditions: [{ variable: "{{trigger.input.priority}}", operator: "equals", value: "high" }] },
        branches: {
          true: [
            {
              nodeType: "human_approval",
              label: "Manager approval",
              justification: "High priority requires manager sign-off.",
              params: { approverEmail: "manager@example.com", title: "Approve" },
              branches: {
                approved: [{ nodeType: "api_call", label: "Notify on-call", justification: "Approved alerts go to on-call.", params: {} }],
                rejected: [{ nodeType: "variable", label: "Log rejection", justification: "Track rejected approvals.", params: {} }],
              },
            },
          ],
          false: [{ nodeType: "variable", label: "Log only", justification: "Low priority just gets logged.", params: {} }],
        },
      },
      { nodeType: "end", label: "Done", justification: "No further output.", params: {} },
    ],
  };

  const summary = buildPlanSummary(draftPlan);
  assert.equal(
    summary,
    [
      "1. Condition: Check priority",
      "   → Yes: Approval: Manager approval",
      "      → Approved: API Call: Notify on-call",
      "      → Rejected: Set Variable: Log rejection",
      "   → No: Set Variable: Log only",
    ].join("\n")
  );
});

test("never includes raw parameter values, expressions, or node ids", () => {
  const draftPlan: DraftPlan = {
    requestText: "call an api",
    steps: [
      {
        nodeType: "api_call",
        label: "Call the billing webhook",
        justification: "User asked to call this endpoint.",
        params: { apiUrl: "https://internal.example.com/secret-path", auth: { type: "bearer", bearerToken: "super-secret-token" } },
      },
    ],
  };

  const summary = buildPlanSummary(draftPlan);
  assert.doesNotMatch(summary, /secret/i);
  assert.doesNotMatch(summary, /\{\{/);
  assert.equal(summary, "1. API Call: Call the billing webhook");
});
