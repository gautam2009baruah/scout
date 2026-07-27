// Structural/behavioral checks for the ai_planner node type (admin-authored
// AI Planner drafting entry point, replacing the old auto-provisioned stub —
// see components/admin/node-properties-panel.tsx's AiPlannerConfig and
// lib/orchestrations/db.ts's publishOrchestration()). Real DB behavior
// (publish-time uniqueness per (company, target app, trigger type), the
// friendly error on conflict) can't be reproduced without a live Postgres
// instance — see conversation history for that live verification.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { isNodeCompatibleWithTrigger } from "../lib/orchestrations/node-compatibility";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

test("ai_planner is compatible with every trigger type", () => {
  const triggerTypes = ["manual", "chatbot", "schedule", "email", "http_api"] as const;
  for (const triggerType of triggerTypes) {
    assert.equal(
      isNodeCompatibleWithTrigger("ai_planner", triggerType),
      true,
      `ai_planner should be usable with a "${triggerType}" trigger`
    );
  }
});

test("ai_planner is never draftable by the LLM (excluded from planner-tools.json and node-catalog.json)", () => {
  const plannerTools = readFileSync(join(repoRoot, "config", "planner-tools.json"), "utf8");
  const nodeCatalog = readFileSync(join(repoRoot, "config", "node-catalog.json"), "utf8");

  assert.doesNotMatch(
    plannerTools,
    /ai_planner/,
    "config/planner-tools.json must never list ai_planner as a draftable tool — it's an admin/designer-only structural marker"
  );
  assert.doesNotMatch(
    nodeCatalog,
    /"ai_planner"/,
    "config/node-catalog.json must not list ai_planner — adding it there would fail scripts/validate-planner-tools.mjs's cross-check"
  );
});

test("matching.ts's getEffectiveMatchConfidenceThreshold reads from the per-node config, not a company column", () => {
  const source = readFileSync(join(repoRoot, "lib", "orchestrations", "planner", "matching.ts"), "utf8");

  assert.match(
    source,
    /getEffectiveMatchConfidenceThreshold\(\s*companyId: string,\s*targetAppId: string \| null\s*\)/,
    "getEffectiveMatchConfidenceThreshold must take (companyId, targetAppId) — guards against reverting to the old company-column-only signature"
  );
  assert.match(
    source,
    /ai_planner_drafting_trigger_type\s*=\s*'chatbot'/,
    "must scope the lookup to the orchestration registered as the chatbot drafting entry point"
  );
});

test("publishOrchestration enforces at most one ai_planner node and scoped drafting-entry uniqueness", () => {
  const source = readFileSync(join(repoRoot, "lib", "orchestrations", "db.ts"), "utf8");

  assert.match(
    source,
    /aiPlannerNodes\.length > 1/,
    "publishOrchestration must reject a graph with more than one ai_planner node"
  );
  assert.match(
    source,
    /ai_planner_drafting_trigger_type/,
    "publishOrchestration must compute/write ai_planner_drafting_trigger_type"
  );
});
