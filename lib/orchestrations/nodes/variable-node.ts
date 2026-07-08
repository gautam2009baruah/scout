// Variable node executor
// Set one or more variables with literal values or expressions

import type { VariableNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression, setVariablePath } from "../expression-evaluator";

export async function executeVariableNode(
  config: VariableNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    const output: Record<string, unknown> = {};

    if (!config.variables || config.variables.length === 0) {
      throw new Error("At least one variable is required");
    }

    // Process each variable
    for (const variable of config.variables) {
      if (!variable.name) {
        throw new Error("Variable name is required");
      }
      if (variable.value === undefined || variable.value === "") {
        throw new Error(`Value is required for variable: ${variable.name}`);
      }

      // Check if value contains variable expressions or math operators
      const valueStr = String(variable.value);
      const hasExpression = valueStr.includes('{{') || /[+\-*/()]/.test(valueStr);

      if (hasExpression) {
        // Evaluate as expression
        const evaluatedValue = evaluateExpression(valueStr, context);
        setVariablePath(variable.name, evaluatedValue, output);
      } else {
        // Store as literal value
        setVariablePath(variable.name, variable.value, output);
      }
    }

    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
