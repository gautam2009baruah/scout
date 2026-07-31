// Draft-plan shape the planner LLM produces, plus prompt construction and
// schema validation against config/planner-tools.json (Step 2).

import plannerToolsJson from "@/config/planner-tools.json";
import { validateAgainstJsonSchema, type JsonSchema } from "./schema-validate";
import type { PlannerContext } from "./context";

export type PlannerTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
};

const PLANNER_TOOLS = plannerToolsJson as unknown as PlannerTool[];

// "trigger" is the AI Planner orchestration's fixed entry point, not
// something the planner would ever choose to insert (see its own
// description in config/planner-tools.json) — never offered to the LLM.
export const DRAFTABLE_TOOLS: PlannerTool[] = PLANNER_TOOLS.filter((tool) => tool.name !== "trigger");

export type DraftPlanStep = {
  nodeType: string;
  label: string;
  // One-sentence, human-readable reason this step (and its param choices)
  // were included — e.g. "used the Q3 report table because the user said
  // 'last month's earnings'". Required so every drafted node carries its
  // own explanation forward into the visual builder (Step 6).
  justification: string;
  params: Record<string, unknown>;
  // Branches keyed by output handle (e.g. "true"/"false" for condition,
  // "approved"/"rejected" for human_approval, or route ids plus "default"
  // for switch). Only meaningful for nodes with named output handles.
  branches?: Record<string, DraftPlanStep[]>;
};

export type DraftPlan = {
  requestText: string;
  steps: DraftPlanStep[];
};

export type DraftingLLMResponse =
  | { type: "clarifying_question"; question: string }
  | { type: "draft_plan"; steps: DraftPlanStep[] };

export function buildDraftingSystemPrompt(): string {
  return [
    "You are the AI Planner for a workflow orchestration platform.",
    "Given a user's request, either ask ONE specific clarifying question if required information is genuinely missing, or produce a complete draft plan as an ordered sequence of tool calls.",
    "Respond with STRICT JSON only — no markdown code fences, no prose before or after. One of exactly two shapes:",
    '{"type":"clarifying_question","question":"..."}',
    'or',
    '{"type":"draft_plan","steps":[{"nodeType":"...","label":"...","justification":"...","params":{...}}]}',
    "Rules:",
    "1) Only use nodeType values from the tool list below — never invent one.",
    "2) Populate params using exactly the field names in that tool's input_schema.",
    "3) For a yes/no decision, use a \"condition\" step with branches keyed \"true\" and \"false\". For three or more outcomes based on one value, use a \"switch\" step: give every route a stable lowercase id, use those exact route ids as branch keys, and include a \"default\" branch. Switch routes are evaluated top-to-bottom and only the first match runs. Use \"approved\"/\"rejected\" branch keys for a \"human_approval\" step.",
    "4) Every complete draft plan should end with an \"end\" step that sets a clear, user-facing message. The \"end\" step is always its own separate entry in the \"steps\" array (or in a \"branches\" array) — NEVER nest it, or any other step, as a property inside another step's object.",
    "5) Prefer the smallest correct sequence of steps. Do not add steps the request doesn't call for.",
    "6) Only ask a clarifying question when the plan genuinely cannot be drafted without it — prefer reasonable defaults over asking.",
    "7) The tool catalog and any schema/knowledge-base context provided below are complete and sufficient for this task — never respond that information is insufficient; if truly blocked, ask a clarifying_question instead.",
    "8) Every step requires a one-sentence \"justification\" explaining why that step and its param choices were made — ground it in specifics: the user's own wording, a value carried over from an earlier step, or a cited knowledge-base source (e.g. \"used the Q3 report table because the user said 'last month's earnings'\", or \"routes to CEO because the retrieved policy states approvals over $1M require CEO sign-off, citing Approval Limits Policy\"). Never write a generic justification like \"this step does X\" — say why THIS choice, for THIS request.",
    "",
    "Available tools:",
    JSON.stringify(DRAFTABLE_TOOLS, null, 2),
  ].join("\n");
}

export function buildDraftingUserPrompt(input: {
  requestText: string;
  clarificationHistory: Array<{ question: string; answer: string }>;
}): string {
  const parts = [`User request: ${input.requestText}`];

  if (input.clarificationHistory.length > 0) {
    parts.push(
      "Clarification so far:",
      input.clarificationHistory.map((entry) => `Q: ${entry.question}\nA: ${entry.answer}`).join("\n")
    );
  }

  return parts.join("\n\n");
}

export function buildDraftingContextText(context: PlannerContext): string {
  const schemaText = context.schemas.length
    ? context.schemas
        .map((schema) => `Database "${schema.databaseName}" (schemaId: ${schema.id}, type: ${schema.databaseType}):\n${schema.schemaSummary}`)
        .join("\n\n")
    : "No database schemas are configured for this target app.";

  const knowledgeText = context.knowledge.formattedText || "No relevant knowledge base passages were found for this request.";

  return [
    "Available database schemas (for use with the \"database\" tool's schemaId param):",
    schemaText,
    "",
    "Relevant knowledge base passages (for grounding \"reasoning\" about policy/business rules):",
    knowledgeText,
  ].join("\n");
}

/**
 * Parses the LLM's raw text response into a DraftingLLMResponse, unwrapping
 * a ```json fence if present (same tolerance pattern used by
 * ai-extraction-node.ts / database-node.ts for LLM JSON output).
 */
export function parseDraftingLLMResponse(raw: string): DraftingLLMResponse | { type: "error"; message: string } {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fenced ? fenced[1] : raw).trim();

  if (!cleaned) {
    return { type: "error", message: "Empty response from the planning model." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { type: "error", message: "Planning model did not return valid JSON." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { type: "error", message: "Planning model response was not a JSON object." };
  }

  const payload = parsed as Record<string, unknown>;

  if (payload.type === "clarifying_question") {
    const question = String(payload.question ?? "").trim();
    if (!question) {
      return { type: "error", message: "clarifying_question response had no question text." };
    }
    return { type: "clarifying_question", question };
  }

  if (payload.type === "draft_plan") {
    if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
      return { type: "error", message: "draft_plan response had no steps." };
    }
    return { type: "draft_plan", steps: payload.steps as DraftPlanStep[] };
  }

  return { type: "error", message: `Unrecognized response type: ${String(payload.type)}` };
}

function findTool(nodeType: string): PlannerTool | undefined {
  return DRAFTABLE_TOOLS.find((tool) => tool.name === nodeType);
}

const ALLOWED_STEP_KEYS = new Set(["nodeType", "label", "justification", "params", "branches"]);

/**
 * Validates every step (recursing into branches) against the matching
 * tool's input_schema from config/planner-tools.json. This is the gate
 * Step 4 point 6 requires before a draft plan is ever handed back to the
 * caller — an LLM-drafted plan that references an unknown nodeType or gets
 * a required param wrong fails here rather than surfacing at execution time.
 */
export function validateDraftPlan(steps: DraftPlanStep[], path = "$"): string[] {
  const errors: string[] = [];

  steps.forEach((step, index) => {
    const stepPath = `${path}[${index}]`;

    if (!step || typeof step !== "object") {
      errors.push(`${stepPath}: step is not an object`);
      return;
    }

    const tool = findTool(step.nodeType);
    if (!tool) {
      errors.push(`${stepPath}: unknown nodeType "${step.nodeType}"`);
      return;
    }

    // Catches a real failure mode seen from live models: nesting another
    // step object inside this one's params-sibling keys (e.g. an "end" key
    // alongside nodeType/label/params) instead of adding it as its own
    // sibling entry in the steps array. Silently accepting extra keys would
    // let that step vanish from the graph converter's output.
    const unexpectedKeys = Object.keys(step).filter((key) => !ALLOWED_STEP_KEYS.has(key));
    if (unexpectedKeys.length > 0) {
      errors.push(
        `${stepPath}: unexpected field(s) ${unexpectedKeys.map((key) => `"${key}"`).join(", ")} — a step must be a flat object with only nodeType/label/justification/params/branches. Did you mean to add a separate sibling step instead of nesting it here?`
      );
    }

    if (typeof step.justification !== "string" || !step.justification.trim()) {
      errors.push(`${stepPath}.justification: required — one sentence explaining why this step was chosen`);
    }

    errors.push(...validateAgainstJsonSchema(step.params ?? {}, tool.input_schema, `${stepPath}.params`));

    if (step.nodeType === "switch") {
      const routes = Array.isArray(step.params?.routes) ? step.params.routes : [];
      const routeIds = new Set<string>();
      routes.forEach((route, routeIndex) => {
        const id = route && typeof route === "object" ? String((route as Record<string, unknown>).id ?? "").trim() : "";
        if (!id) return;
        if (id === "default") {
          errors.push(`${stepPath}.params.routes[${routeIndex}].id: "default" is reserved for the fallback output`);
        }
        if (routeIds.has(id)) {
          errors.push(`${stepPath}.params.routes[${routeIndex}].id: duplicate route id "${id}"`);
        }
        routeIds.add(id);
      });

      const branchKeys = Object.keys(step.branches ?? {});
      if (!branchKeys.includes("default")) {
        errors.push(`${stepPath}.branches.default: switch steps require a default branch`);
      }
      for (const branchKey of branchKeys) {
        if (branchKey !== "default" && !routeIds.has(branchKey)) {
          errors.push(`${stepPath}.branches.${branchKey}: no switch route has this id`);
        }
      }
      for (const routeId of routeIds) {
        if (!branchKeys.includes(routeId)) {
          errors.push(`${stepPath}.branches.${routeId}: switch route requires a matching branch`);
        }
      }
    }

    if (step.branches) {
      for (const [handle, branchSteps] of Object.entries(step.branches)) {
        if (!Array.isArray(branchSteps)) {
          errors.push(`${stepPath}.branches.${handle}: expected an array of steps`);
          continue;
        }
        errors.push(...validateDraftPlan(branchSteps, `${stepPath}.branches.${handle}`));
      }
    }
  });

  return errors;
}
