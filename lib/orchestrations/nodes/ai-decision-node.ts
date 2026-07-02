// AI Decision node executor
// Uses AI to decide which branch to take

import type { AIDecisionNodeConfig } from "@/shared/orchestrationTypes";
import { resolveVariablePath } from "../expression-evaluator";
import { getLLMProvider } from "@/lib/llm/providers";

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
    const decisionLabel = parseDecisionResponse(aiResponse, config);

    // Find matching decision
    const matchingDecision = config.decisions.find(
      (d) => d.label.toLowerCase() === decisionLabel.toLowerCase()
    );

    if (!matchingDecision) {
      // Use default decision if no match found
      if (config.defaultDecision) {
        return {
          success: true,
          outputHandle: config.defaultDecision,
          output: {
            decision: "default",
            handle: config.defaultDecision,
            aiResponse: decisionLabel,
            reason: "No matching decision found, using default",
          },
        };
      }

      throw new Error(
        `No matching decision found for AI response: "${decisionLabel}". Available options: ${config.decisions.map((d) => d.label).join(", ")}`
      );
    }

    return {
      success: true,
      outputHandle: matchingDecision.outputHandle,
      output: {
        decision: matchingDecision.label,
        handle: matchingDecision.outputHandle,
        aiResponse: decisionLabel,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // If default decision is configured, use it on error
    if (config.defaultDecision) {
      return {
        success: true,
        outputHandle: config.defaultDecision,
        output: {
          decision: "default",
          handle: config.defaultDecision,
          error: errorMessage,
          reason: "Error occurred, using default decision",
        },
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
      return `- "${d.label}"${desc}`;
    })
    .join("\n");

  return [
    "You are a decision-making assistant.",
    "Analyze the provided input and choose the most appropriate decision from the available options.",
    "Respond with ONLY the exact label of the chosen decision.",
    "Do not include explanations, reasoning, or additional text.",
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
    "Input to analyze:",
    inputText,
    "",
    "Respond with only the decision label.",
  ].join("\n");
}

/**
 * Parse AI response to extract decision label
 */
function parseDecisionResponse(
  response: string,
  config: AIDecisionNodeConfig
): string {
  // Clean up response
  const cleaned = response
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "") // Remove quotes
    .replace(/^Decision:\s*/i, "") // Remove "Decision:" prefix
    .split("\n")[0] // Take first line only
    .trim();

  // Try exact match first
  const exactMatch = config.decisions.find(
    (d) => d.label.toLowerCase() === cleaned.toLowerCase()
  );

  if (exactMatch) {
    return exactMatch.label;
  }

  // Try partial match
  const partialMatch = config.decisions.find((d) =>
    cleaned.toLowerCase().includes(d.label.toLowerCase())
  );

  if (partialMatch) {
    return partialMatch.label;
  }

  // Return cleaned response if no match
  return cleaned;
}
