// Condition node executor
// Evaluates conditions and routes accordingly

import type { ConditionNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateCondition } from "../expression-evaluator";

export async function executeConditionNode(
  config: ConditionNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  outputHandle?: string;
  error?: string;
}> {
  try {
    // Evaluate all conditions
    const results = config.conditions.map((condition) =>
      evaluateCondition(condition.variable, condition.operator, condition.value, context)
    );

    // Apply logic (AND or OR)
    const finalResult =
      config.logic === "and"
        ? results.every((r) => r === true)
        : results.some((r) => r === true);

    return {
      success: true,
      outputHandle: finalResult ? "true" : "false",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
