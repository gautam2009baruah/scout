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
    if (!config.conditions || config.conditions.length === 0) {
      return { success: false, error: "No conditions defined" };
    }

    // Evaluate conditions with individual logic operators
    // Start with first condition result
    let finalResult = evaluateCondition(
      config.conditions[0].variable,
      config.conditions[0].operator,
      config.conditions[0].value,
      context
    );

    // Apply logic operators between conditions (left-to-right evaluation)
    for (let i = 0; i < config.conditions.length - 1; i++) {
      const currentCondition = config.conditions[i];
      const nextCondition = config.conditions[i + 1];
      const logicOperator = currentCondition.logicAfter || "and"; // Default to AND

      const nextResult = evaluateCondition(
        nextCondition.variable,
        nextCondition.operator,
        nextCondition.value,
        context
      );

      // Apply the logic operator
      if (logicOperator === "and") {
        finalResult = finalResult && nextResult;
      } else {
        finalResult = finalResult || nextResult;
      }
    }

    return {
      success: true,
      outputHandle: finalResult ? "true" : "false",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
