// AI Decision node executor
// Uses AI to decide which branch to take

import type { AIDecisionNodeConfig } from "@/shared/orchestrationTypes";
import { resolveVariablePath } from "../expression-evaluator";

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

    // Prepare decision request
    const decisionOptions = config.decisions.map((d) => `${d.label}: ${d.description || ""}`).join("\n");
    const fullPrompt = `${config.prompt}\n\nInput:\n${JSON.stringify(inputData, null, 2)}\n\nDecision options:\n${decisionOptions}\n\nRespond with only the label of the chosen decision.`;

    // Call AI provider
    // In production, this would use the configured AI provider
    // For now, we'll use the first decision as default
    const aiResponse = config.decisions[0]?.label || "";

    // Find matching decision
    const matchingDecision = config.decisions.find(
      (d) => d.label.toLowerCase() === aiResponse.toLowerCase()
    );

    const outputHandle = matchingDecision?.outputHandle || config.defaultDecision;

    if (!outputHandle) {
      throw new Error(`No matching decision found for AI response: ${aiResponse}`);
    }

    return {
      success: true,
      outputHandle,
      output: {
        decision: aiResponse,
        handle: outputHandle,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
