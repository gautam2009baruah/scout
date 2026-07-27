// Step 10: AI Planner evaluation harness.
//
// Runs a fixed set of >=30 realistic requests through the REAL Step 7 entry
// point (POST /api/chatbot/ai-planner — real LLM calls, real matching
// against the real database, real embedding similarity) and reports
// pass/fail with a diff for every failure. Re-run this after any prompt,
// model, or matching-threshold change (see Step 3b's DEFAULT_MATCH_CONFIDENCE_THRESHOLD)
// to catch regressions before they reach a pilot group — this is a
// pre-flight check, not a fast unit test: it needs a running dev server, a
// real chatbot API key, and a real configured LLM/embedding provider.
//
// Deliberately NOT using PlannerAgent's fake-LLM unit tests
// (tests/planner-agent.test.ts) as a substitute: those test the state
// machine's mechanism with a stubbed LLM; this tests whether the actually
// configured model produces good real-world judgment — the one thing those
// unit tests explicitly punt on (see that file's own comment on the
// drafting-branch test cases).
//
// Usage:
//   node --import ./scripts/db/load-env.mjs --import tsx scripts/eval-ai-planner.ts
// or: npm run eval:ai-planner
//
// Required env vars (see .env.local): EVAL_CHATBOT_API_KEY, EVAL_ORIGIN,
// EVAL_COMPANY_ID, EVAL_TARGET_APP_ID. Optional: EVAL_BASE_URL (default
// http://localhost:3000).

import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db/pool";
import { createOrchestration, createNode, createConnection, publishOrchestration, getOrchestrations } from "@/lib/orchestrations/db";
import { MAX_CLARIFICATION_ROUNDS } from "@/lib/orchestrations/planner/agent";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}. See this file's header comment for the full list.`);
    process.exit(1);
  }
  return value;
}

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3000";
const API_KEY = requireEnv("EVAL_CHATBOT_API_KEY");
const ORIGIN = requireEnv("EVAL_ORIGIN");
const COMPANY_ID = requireEnv("EVAL_COMPANY_ID");
const TARGET_APP_ID = requireEnv("EVAL_TARGET_APP_ID");

const MATCHABLE_FIXTURE_NAME = "Eval Harness Fixture: Vendor Risk Alert (matchable)";
const NON_MATCHABLE_FIXTURE_NAME = "Eval Harness Fixture: Legacy Invoice Reminder (not matchable)";

// Fixed template strings PlannerAgent itself always emits verbatim (see
// lib/orchestrations/planner/agent.ts) — asserting on these, not on
// LLM-generated prose, is what makes most of these checks reliable rather
// than another layer of "does the model phrase it nicely" guessing.
const MATCH_FOUND_MARKER = "I found an existing automation that might do this";
const NO_MATCH_MARKER = "None of the available automations can do that yet";
const DRAFT_SUBMITTED_MARKER = "I've put together a draft plan and I'm submitting it for admin approval";
const PENDING_LOCK_MARKER = "You already have a request pending admin approval";

type AiPlannerReply = { answer?: string; conversationId?: string; intent?: string; message?: string };

async function callAiPlanner(input: { userId: string; message: string; conversationId?: string }): Promise<AiPlannerReply> {
  const response = await fetch(`${BASE_URL}/api/chatbot/ai-planner`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY, Origin: ORIGIN },
    body: JSON.stringify({
      companyId: COMPANY_ID,
      targetAppId: TARGET_APP_ID,
      userId: input.userId,
      message: input.message,
      conversationId: input.conversationId,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { answer: `[HTTP ${response.status}] ${body?.message || "request failed"}` };
  }
  return body;
}

/** Keeps answering clarifying questions with a generic filler until the
 * draft either completes or gives up — used where a test case only cares
 * about the eventual outcome, not the exact number of clarification rounds. */
async function driveToOutcome(userId: string, firstMessage: string): Promise<AiPlannerReply[]> {
  const turns: AiPlannerReply[] = [];
  let reply = await callAiPlanner({ userId, message: firstMessage });
  turns.push(reply);

  if (typeof reply.answer === "string" && reply.answer.includes(NO_MATCH_MARKER)) {
    reply = await callAiPlanner({ userId, message: "yes", conversationId: reply.conversationId });
    turns.push(reply);
  }

  let rounds = 0;
  while (
    rounds <= MAX_CLARIFICATION_ROUNDS + 1 &&
    typeof reply.answer === "string" &&
    !reply.answer.includes(DRAFT_SUBMITTED_MARKER) &&
    reply.intent === "need_clarification"
  ) {
    reply = await callAiPlanner({ userId, message: "please use a reasonable default", conversationId: reply.conversationId });
    turns.push(reply);
    rounds += 1;
  }

  return turns;
}

type CaseResult = { category: string; name: string; passed: boolean; expected: string; actual: string };
const results: CaseResult[] = [];
const generatedExternalUserIds: string[] = [];

function record(category: string, name: string, passed: boolean, expected: string, actual: string) {
  results.push({ category, name, passed, expected, actual });
}

function freshUserId(): string {
  const id = randomUUID();
  generatedExternalUserIds.push(id);
  return id;
}

// --- Fixture setup ----------------------------------------------------------

async function findFixtureByName(name: string): Promise<string | null> {
  const all = await getOrchestrations({ companyId: COMPANY_ID });
  return all.find((o) => o.name === name)?.id || null;
}

let cachedInternalUserId: string | null = null;

// publishOrchestration()'s auto-trigger-creation path (for chatbot triggers,
// which these fixtures use) attributes the created orchestration_triggers
// row to this id, and that column's NOT NULL-ness hasn't been audited/relaxed
// the way orchestrations.created_by/published_by were in Step 7 — so unlike
// createOrchestration's now-optional createdById, this needs a real internal
// control-panel user, not a system placeholder.
async function resolveInternalUserId(): Promise<string> {
  if (cachedInternalUserId) return cachedInternalUserId;
  const result = await getPool().query<{ id: string }>(
    `SELECT user_id AS id FROM user_company_roles WHERE company_id = $1 AND deleted_at IS NULL LIMIT 1`,
    [COMPANY_ID]
  );
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`No internal user found for company ${COMPANY_ID} — can't publish eval fixtures.`);
  }
  cachedInternalUserId = id;
  return id;
}

async function ensureFixture(input: { name: string; description: string; matchable: boolean }): Promise<string> {
  const existingId = await findFixtureByName(input.name);
  if (existingId) return existingId;

  const internalUserId = await resolveInternalUserId();
  const orchestration = await createOrchestration({
    companyId: COMPANY_ID,
    targetAppId: TARGET_APP_ID,
    name: input.name,
    description: input.description,
    createdById: internalUserId,
  });

  const trigger = await createNode({
    orchestrationId: orchestration.id,
    nodeType: "trigger",
    label: "Chat trigger",
    positionX: 0,
    positionY: 0,
    config: { type: "trigger", triggerType: "chatbot" },
  });
  const notify = await createNode({
    orchestrationId: orchestration.id,
    nodeType: "notification",
    label: input.name,
    positionX: 260,
    positionY: 0,
    config: {
      type: "notification",
      channels: { email: { enabled: true, to: "eval-harness@example.com", body: input.description } },
    },
  });
  const end = await createNode({
    orchestrationId: orchestration.id,
    nodeType: "end",
    label: "Done",
    positionX: 520,
    positionY: 0,
    config: { type: "end" },
  });
  await createConnection({ orchestrationId: orchestration.id, sourceNodeId: trigger.id, targetNodeId: notify.id });
  await createConnection({ orchestrationId: orchestration.id, sourceNodeId: notify.id, targetNodeId: end.id });

  await publishOrchestration(orchestration.id, internalUserId);

  await getPool().query(`UPDATE orchestrations SET matchable_without_validation = $2 WHERE id = $1`, [
    orchestration.id,
    input.matchable,
  ]);

  return orchestration.id;
}

async function ensureFixtures(): Promise<void> {
  await ensureFixture({
    name: MATCHABLE_FIXTURE_NAME,
    description: "Sends a risk alert email to compliance whenever a vendor's risk score is flagged.",
    matchable: true,
  });
  await ensureFixture({
    name: NON_MATCHABLE_FIXTURE_NAME,
    description: "Sends a reminder email about overdue invoices to finance.",
    matchable: false,
  });
}

// --- Test cases --------------------------------------------------------------

const SHOULD_MATCH_REQUESTS = [
  "Alert compliance whenever a vendor gets flagged for risk",
  "Send a risk notification to the compliance team for flagged vendors",
  "Notify compliance about vendor risk flags",
  "I need compliance to know when a vendor's risk score gets flagged",
  "Set up an alert for compliance when vendor risk is flagged",
  "Whenever a vendor is risk-flagged, let compliance know by email",
  "Can you alert compliance for flagged vendor risk scores?",
  "Ping compliance every time a vendor gets a risk flag",
];

const SHOULD_NOT_MATCH_REQUESTS = [
  "Whenever a new employee is onboarded, send a welcome email to hr@example.com with their name",
  "Post a weekly summary of open support tickets to the #support Slack channel",
  "Extract the invoice number and total from an uploaded PDF and store them as variables",
  "Search the knowledge base for our data retention policy and tell me what it says",
  "If a contract value exceeds $50,000, require CFO approval before proceeding",
  "Summarize the attached meeting notes and email the summary to the team",
  "Log a variable called lastSyncTime set to the current trigger time",
  "Call our internal inventory API and format the response as a table",
];

const AMBIGUOUS_REQUESTS = [
  "Automate the vendor process",
  "Help me with onboarding",
  "Set up something for approvals",
  "I need a notification workflow",
  "Can you build me an automation for reports",
  "Make something happen when things change",
  "Set up an alert",
  "Automate my daily tasks",
];

const SHOULD_NEVER_MATCH_NON_APPROVED_REQUESTS = [
  "Send a reminder about overdue invoices to finance",
  "Notify finance when invoices are overdue",
  "I need an overdue invoice reminder sent to finance@example.com",
  "Alert finance about late invoice payments",
  "Can you remind finance about outstanding invoices?",
];

async function runShouldMatchCase(requestText: string) {
  const userId = freshUserId();
  const reply = await callAiPlanner({ userId, message: requestText });
  const answer = reply.answer || "";
  const passed = answer.includes(MATCH_FOUND_MARKER) && answer.includes(MATCHABLE_FIXTURE_NAME);
  record(
    "(a) should match",
    requestText,
    passed,
    `contains "${MATCH_FOUND_MARKER}" and the fixture name`,
    answer
  );
}

async function runShouldNotMatchCase(requestText: string) {
  const userId = freshUserId();
  const reply = await callAiPlanner({ userId, message: requestText });
  const answer = reply.answer || "";
  const passed = answer.includes(NO_MATCH_MARKER);
  record("(b) should not match / falls through to drafting", requestText, passed, `contains "${NO_MATCH_MARKER}"`, answer);
}

async function runAmbiguousCase(requestText: string) {
  const userId = freshUserId();
  const first = await callAiPlanner({ userId, message: requestText });
  if (!(first.answer || "").includes(NO_MATCH_MARKER)) {
    record(
      "(c) ambiguous — needs clarification",
      requestText,
      false,
      `first turn offers to draft (contains "${NO_MATCH_MARKER}")`,
      first.answer || ""
    );
    return;
  }
  const second = await callAiPlanner({ userId, message: "yes", conversationId: first.conversationId });
  const answer = second.answer || "";
  // A genuinely ambiguous request should make the model ask something back
  // rather than confidently produce a complete plan on the first attempt.
  const passed = second.intent === "need_clarification" && !answer.includes(DRAFT_SUBMITTED_MARKER);
  record(
    "(c) ambiguous — needs clarification",
    requestText,
    passed,
    "asks a clarifying question instead of completing a draft immediately",
    answer
  );
}

async function runNeverMatchNonApprovedCase(requestText: string) {
  const userId = freshUserId();
  const reply = await callAiPlanner({ userId, message: requestText });
  const answer = reply.answer || "";
  const passed = answer.includes(NO_MATCH_MARKER) && !answer.includes(NON_MATCHABLE_FIXTURE_NAME);
  record(
    "(d) matchable_without_validation=false never matches",
    requestText,
    passed,
    `contains "${NO_MATCH_MARKER}" and never names the non-approved fixture`,
    answer
  );
}

async function runPendingLockCase() {
  const userId = freshUserId();
  const firstRequest = "Log a variable named evalLockTest set to true whenever triggered";

  const firstTurns = await driveToOutcome(userId, firstRequest);
  const firstCompleted = firstTurns[firstTurns.length - 1];
  const firstSubmitted = (firstCompleted.answer || "").includes(DRAFT_SUBMITTED_MARKER);

  if (!firstSubmitted) {
    record(
      "(e) pending-request lock",
      "first request reaches draft_complete",
      false,
      `contains "${DRAFT_SUBMITTED_MARKER}"`,
      firstCompleted.answer || ""
    );
    return;
  }

  const secondRequestFirstTurn = await callAiPlanner({ userId, message: "Also notify #ops on Slack whenever a deploy finishes" });
  const secondConfirm = await callAiPlanner({
    userId,
    message: "yes",
    conversationId: secondRequestFirstTurn.conversationId,
  });
  const answer = secondConfirm.answer || "";
  const passed = answer.includes(PENDING_LOCK_MARKER);
  record(
    "(e) pending-request lock",
    "second drafting request while first is unresolved is blocked",
    passed,
    `contains "${PENDING_LOCK_MARKER}"`,
    answer
  );
}

// --- Cleanup -------------------------------------------------------------

async function cleanupGeneratedData(): Promise<void> {
  if (generatedExternalUserIds.length === 0) return;
  const pool = getPool();
  await pool.query(`DELETE FROM ai_planner_pending_requests WHERE external_user_id = ANY($1::text[])`, [generatedExternalUserIds]);
  await pool.query(`DELETE FROM ai_planner_sessions WHERE external_user_id = ANY($1::text[])`, [generatedExternalUserIds]);
  await pool.query(`DELETE FROM conversations WHERE external_user_id = ANY($1::text[])`, [generatedExternalUserIds]);
}

// --- Report ----------------------------------------------------------------

function printReport(): boolean {
  const byCategory = new Map<string, CaseResult[]>();
  for (const result of results) {
    const list = byCategory.get(result.category) || [];
    list.push(result);
    byCategory.set(result.category, list);
  }

  let totalPassed = 0;
  console.log("\n=== AI Planner Eval Harness Report ===\n");

  for (const [category, cases] of byCategory) {
    const passed = cases.filter((c) => c.passed).length;
    totalPassed += passed;
    console.log(`${category}: ${passed}/${cases.length} passed`);
    for (const c of cases) {
      if (!c.passed) {
        console.log(`  ✗ FAIL: ${c.name}`);
        console.log(`      expected: ${c.expected}`);
        console.log(`      actual:   ${c.actual}`);
      }
    }
  }

  console.log(`\nTotal: ${totalPassed}/${results.length} passed\n`);
  return totalPassed === results.length;
}

// --- Main --------------------------------------------------------------

async function main() {
  console.log(`Running AI Planner eval harness against ${BASE_URL} (company ${COMPANY_ID}, target app ${TARGET_APP_ID})...`);
  await ensureFixtures();

  for (const requestText of SHOULD_MATCH_REQUESTS) await runShouldMatchCase(requestText);
  for (const requestText of SHOULD_NOT_MATCH_REQUESTS) await runShouldNotMatchCase(requestText);
  for (const requestText of AMBIGUOUS_REQUESTS) await runAmbiguousCase(requestText);
  for (const requestText of SHOULD_NEVER_MATCH_NON_APPROVED_REQUESTS) await runNeverMatchNonApprovedCase(requestText);
  await runPendingLockCase();

  await cleanupGeneratedData();

  const allPassed = printReport();
  await getPool().end();
  process.exit(allPassed ? 0 : 1);
}

main().catch(async (error) => {
  console.error("Eval harness crashed:", error);
  await getPool().end();
  process.exit(1);
});
