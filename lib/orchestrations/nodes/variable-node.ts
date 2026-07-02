// Variable node executor
// Create, update, transform, or delete variables

import type { VariableNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression, setVariablePath, deleteVariablePath } from "../expression-evaluator";

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

    switch (config.operation) {
      case "create":
      case "update":
        if (config.value !== undefined) {
          // Literal value
          setVariablePath(config.variableName, config.value, output);
        } else if (config.expression) {
          // Expression to evaluate
          const value = evaluateExpression(config.expression, context);
          setVariablePath(config.variableName, value, output);
        } else {
          throw new Error("Either value or expression is required");
        }
        break;

      case "transform":
        if (!config.expression) {
          throw new Error("Expression is required for transform operation");
        }
        const transformedValue = evaluateExpression(config.expression, context);
        setVariablePath(config.variableName, transformedValue, output);
        break;

      case "delete":
        deleteVariablePath(config.variableName, context);
        break;

      default:
        throw new Error(`Unknown operation: ${config.operation}`);
    }

    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}
