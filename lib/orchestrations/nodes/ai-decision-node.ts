// AI Decision node executor
// Uses AI to decide which branch to take or which orchestration plan to propose.

import type {
  AIDecisionNodeConfig,
  AIDecisionStructuredResult,
  AIDecisionOption,
} from "@/shared/orchestrationTypes";
import { resolveVariablePath } from "../expression-evaluator";
import { getLLMProvider } from "@/lib/llm/providers";

type ParsedDecisionResponse = {
  structured?: Partial<AIDecisionStructuredResult>;
  label?: string;
  rawText: string;
};

/**
 * Use AI to analyze input and decide which path to take
 * Returns an output handle for conditional routing
 */
export async function executeAIDecisionNode(
  config: AIDecisionNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  outputHandle?: string;
  error?: string;
}> {
  try {
    // Get input data
    const inputData = resolveVariablePath(config.inputSource, context);

    if (!inputData) {
      throw new Error(`Input source "${config.inputSource}" not found in context`);
    }

    // Prepare input text
    let inputText: string;
    if (typeof inputData === "string") {
      inputText = inputData;
    } else {
      inputText = JSON.stringify(inputData, null, 2);
    }

    // Build decision prompt
    const systemPrompt = buildDecisionSystemPrompt(config);
    const userPrompt = buildDecisionUserPrompt(inputText, config);

    // Call AI provider
    const provider = await getLLMProvider();
    const aiResponse = await provider.generate_answer(systemPrompt, userPrompt, "");

    // Parse AI decision
    const parsed = parseDecisionResponse(aiResponse, config);
    const selectedDecision = resolveDecision(parsed, config);

    if (!selectedDecision) {
      const errorDetails = parsed.structured?.reason || parsed.label || parsed.rawText;

      if (config.defaultDecision) {
        return {
          success: true,
          outputHandle: config.defaultDecision,
          output: buildDecisionOutput({
            decision: "default",
            handle: config.defaultDecision,
            aiResponse: parsed,
            reason: `No matching decision found, using default. ${errorDetails ? `Model response: ${errorDetails}` : ""}`.trim(),
            structured: parsed.structured,
          }),
        };
      }

      throw new Error(
        `No matching decision found for AI response. Available options: ${config.decisions.map((d) => d.label).join(", ")}. Model response: ${errorDetails}`
      );
    }

    return {
      success: true,
      outputHandle: selectedDecision.outputHandle,
      output: buildDecisionOutput({
        decision: selectedDecision.label,
        handle: selectedDecision.outputHandle,
        aiResponse: parsed,
        structured: parsed.structured,
      }),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // If default decision is configured, use it on error
    if (config.defaultDecision) {
      return {
        success: true,
        outputHandle: config.defaultDecision,
        output: buildDecisionOutput({
          decision: "default",
          handle: config.defaultDecision,
          error: errorMessage,
          reason: "Error occurred, using default decision",
        }),
      };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Build system prompt for decision making
 */
function buildDecisionSystemPrompt(config: AIDecisionNodeConfig): string {
  const decisionsList = config.decisions
    .map((d) => {
      const desc = d.description ? ` - ${d.description}` : "";
      const aliases = d.aliases && d.aliases.length > 0 ? ` aliases: ${d.aliases.join(", ")}` : "";
      const keywords = d.keywords && d.keywords.length > 0 ? ` keywords: ${d.keywords.join(", ")}` : "";
      return `- "${d.label}"${desc}${aliases}${keywords}`;
    })
    .join("\n");

  return [
    "You are an orchestration router and decision-making assistant.",
    "Analyze the provided input and choose the most appropriate decision from the available options.",
    "When the request is actionable, you may also propose a plan, matching orchestration metadata, or clarifying questions.",
    "Return JSON only, with this shape:",
    '{"intent":"chat|workflow_match|need_clarification|propose_plan|execute_plan|fallback","confidence":0,"selectedDecisionLabel":"","selectedDecisionHandle":"","matchedOrchestrationIds":[],"matchedOrchestrationNames":[],"needsClarification":false,"clarifyingQuestions":[],"requireUserConfirmation":false,"plan":[],"reason":"","message":"","metadata":{}}',
    "If you do not have enough information, set intent to need_clarification and include clarifyingQuestions.",
    "If you found one or more matching orchestrations, set intent to workflow_match and include the strongest match in selectedDecisionLabel/selectedDecisionHandle when applicable.",
    "If you can outline a safe actionable plan, set intent to propose_plan and fill plan with node-by-node steps.",
    "Do not include markdown fences or extra commentary.",
    "",
    "Available decisions:",
    decisionsList,
  ].join("\n");
}

/**
 * Build user prompt for decision
 */
function buildDecisionUserPrompt(
  inputText: string,
  config: AIDecisionNodeConfig
): string {
  return [
    config.prompt,
    "",
    "Available decision labels:",
    config.decisions.map((d) => `- ${d.label}`).join("\n"),
    "",
    "Input to analyze:",
    inputText,
    "",
    "Return the JSON response described in the system instructions.",
  ].join("\n");
}

/**
 * Parse AI response to extract decision label
 */
function parseDecisionResponse(
  response: string,
  config: AIDecisionNodeConfig
): ParsedDecisionResponse {
  const cleaned = response
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  const parsed = tryParseDecisionJson(cleaned);
  if (parsed) {
    return {
      structured: parsed,
      label: extractLabelFromStructuredResult(parsed, config),
      rawText: cleaned,
    };
  }

  const label = cleaned
    .replace(/^Decision:\s*/i, "")
    .split("\n")[0]
    .trim();

  return { label, rawText: cleaned };
}

function tryParseDecisionJson(text: string): Partial<AIDecisionStructuredResult> | null {
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }

    return parsed as Partial<AIDecisionStructuredResult>;
  } catch {
    return null;
  }
}

function extractLabelFromStructuredResult(
  result: Partial<AIDecisionStructuredResult>,
  config: AIDecisionNodeConfig
): string {
  const explicitLabel = typeof result.selectedDecisionLabel === "string" ? result.selectedDecisionLabel.trim() : "";
  if (explicitLabel) {
    return explicitLabel;
  }

  const explicitHandle = typeof result.selectedDecisionHandle === "string" ? result.selectedDecisionHandle.trim() : "";
  if (explicitHandle) {
    const matchingDecision = config.decisions.find((decision) => decision.outputHandle === explicitHandle);
    if (matchingDecision) {
      return matchingDecision.label;
    }
  }

  return typeof result.intent === "string" ? result.intent : "";
}

function resolveDecision(
  parsed: ParsedDecisionResponse,
  config: AIDecisionNodeConfig
): AIDecisionOption | null {
  const structuredLabel = parsed.structured?.selectedDecisionLabel;
  const structuredHandle = parsed.structured?.selectedDecisionHandle;
  const fallbackLabel = parsed.label || "";

  const byLabel = [structuredLabel, fallbackLabel].find((value) => typeof value === "string" && value.trim().length > 0);
  if (byLabel) {
    const exactMatch = config.decisions.find((decision) => decision.label.toLowerCase() === byLabel.toLowerCase());
    if (exactMatch) {
      return exactMatch;
    }

    const aliasMatch = config.decisions.find((decision) => {
      const candidates = [
        ...(decision.aliases || []),
        ...(decision.keywords || []),
        decision.description || "",
      ]
        .filter(Boolean)
        .map((item) => item.toLowerCase());

      return candidates.some((candidate) => byLabel.toLowerCase().includes(candidate));
    });

    if (aliasMatch) {
      return aliasMatch;
    }
  }

  if (typeof structuredHandle === "string" && structuredHandle.trim()) {
    const handleMatch = config.decisions.find((decision) => decision.outputHandle === structuredHandle.trim());
    if (handleMatch) {
      return handleMatch;
    }
  }

  return null;
}

function buildDecisionOutput({
  decision,
  handle,
  aiResponse,
  structured,
  reason,
  error,
}: {
  decision: string;
  handle: string;
  aiResponse?: ParsedDecisionResponse;
  structured?: Partial<AIDecisionStructuredResult>;
  reason?: string;
  error?: string;
}): Record<string, unknown> {
  return {
    decision,
    handle,
    aiResponse: aiResponse?.rawText ?? aiResponse?.label ?? "",
    intent: structured?.intent ?? (decision === "default" ? "fallback" : undefined),
    confidence: structured?.confidence,
    matchedOrchestrationIds: structured?.matchedOrchestrationIds ?? [],
    matchedOrchestrationNames: structured?.matchedOrchestrationNames ?? [],
    needsClarification: structured?.needsClarification ?? false,
    clarifyingQuestions: structured?.clarifyingQuestions ?? [],
    requireUserConfirmation: structured?.requireUserConfirmation ?? false,
    plan: structured?.plan ?? [],
    message: structured?.message,
    reason,
    error,
    metadata: structured?.metadata ?? {},
  };
}
