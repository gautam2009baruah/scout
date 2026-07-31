// Step 6b: a rough, plain-language rendering of a draft plan for the chat
// message sent to the *requester* after a draft is submitted for admin
// approval (Step 7). The requester never sees the builder graph — this is
// the text-only substitute: an ordered list with arrows for branches, no
// node ids, no raw params, no {{expression}} internals. Draws only on
// step.nodeType and step.label (both already short and human-authored by
// the drafting LLM — see draft-plan.ts) plus the branch handle name.

import type { DraftPlan, DraftPlanStep } from "./draft-plan";

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  trigger: "Trigger",
  workflow: "Run Workflow",
  data_capture: "Capture Data",
  ai_extraction: "Extract",
  ai_task: "AI Task",
  knowledge_search: "Search",
  condition: "Condition",
  switch: "Switch / Router",
  human_approval: "Approval",
  notification: "Notify",
  variable: "Set Variable",
  data_formatter: "Format Data",
  api_call: "API Call",
  database: "Query",
  file_parser: "Read File",
  for_each: "For Each",
  end: "Finish",
};

function typeDisplayName(nodeType: string): string {
  return TYPE_DISPLAY_NAMES[nodeType] || nodeType;
}

function branchLabel(nodeType: string, handle: string): string {
  if (nodeType === "condition") {
    if (handle === "true") return "Yes";
    if (handle === "false") return "No";
  }
  if (nodeType === "human_approval") {
    if (handle === "approved") return "Approved";
    if (handle === "rejected") return "Rejected";
  }
  return handle ? handle.charAt(0).toUpperCase() + handle.slice(1) : handle;
}

function describeStep(step: DraftPlanStep): string {
  return `${typeDisplayName(step.nodeType)}: ${step.label}`;
}

function renderBranches(step: DraftPlanStep, indent: string, lines: string[]): void {
  if (!step.branches) return;

  for (const [handle, branchSteps] of Object.entries(step.branches)) {
    const visible = branchSteps.filter((branchStep) => branchStep.nodeType !== "end");
    const label = branchLabel(step.nodeType, handle);

    if (visible.length === 0) {
      lines.push(`${indent}→ ${label}: (no action)`);
      continue;
    }

    lines.push(`${indent}→ ${label}: ${describeStep(visible[0])}`);
    renderBranches(visible[0], `${indent}   `, lines);

    for (const extra of visible.slice(1)) {
      lines.push(`${indent}  then ${describeStep(extra)}`);
      renderBranches(extra, `${indent}     `, lines);
    }
  }
}

/**
 * Renders a draft plan as a plain-language, chat-safe summary:
 *   1. Query: Sales database (last month's revenue)
 *   2. Condition: If revenue > $1,000,000
 *      → Yes: Notify CEO
 *      → No: Notify VP
 *
 * "end" steps are omitted — they're a structural wrap-up, not something a
 * requester needs to sanity-check what they asked for.
 */
export function buildPlanSummary(draftPlan: DraftPlan): string {
  const lines: string[] = [];
  let index = 1;

  for (const step of draftPlan.steps) {
    if (step.nodeType === "end") continue;
    lines.push(`${index}. ${describeStep(step)}`);
    renderBranches(step, "   ", lines);
    index += 1;
  }

  if (lines.length === 0) {
    return "This automation doesn't have any visible steps yet.";
  }

  return lines.join("\n");
}
