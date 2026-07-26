import type {
  ForEachNodeConfig,
  ForEachBodyNodeType,
  ApiCallNodeConfig,
  NotificationNodeConfig,
  AIExtractionNodeConfig,
  VariableNodeConfig,
  DataFormatterNodeConfig,
} from "@/shared/orchestrationTypes";
import { resolveVariablePath, setVariablePath } from "../expression-evaluator";
import { executeApiCallNode } from "./api-call-node";
import { executeNotificationNode } from "./notification-node";
import { executeAIExtractionNode } from "./ai-extraction-node";
import { executeVariableNode } from "./variable-node";
import { executeDataFormatterNode } from "./data-formatter-node";

// Hard ceiling independent of the configured maxIterations, since each
// iteration can fan out a real side effect (API call, notification, LLM call)
// per item — a misconfigured node should not be able to hammer an external
// service or run away an LLM bill unbounded.
const HARD_ITERATION_CEILING = 500;

type BodyResult = { success: boolean; output?: Record<string, unknown>; error?: string };

function runBodyNode(
  bodyNodeType: ForEachBodyNodeType,
  bodyConfig: ForEachNodeConfig["bodyConfig"],
  context: Record<string, unknown>
): Promise<BodyResult> {
  switch (bodyNodeType) {
    case "api_call":
      return executeApiCallNode(bodyConfig as ApiCallNodeConfig, context);
    case "notification":
      return executeNotificationNode(bodyConfig as NotificationNodeConfig, context);
    case "ai_extraction":
      return executeAIExtractionNode(bodyConfig as AIExtractionNodeConfig, context);
    case "variable":
      return executeVariableNode(bodyConfig as VariableNodeConfig, context);
    case "data_formatter":
      return executeDataFormatterNode(bodyConfig as DataFormatterNodeConfig, context);
    default:
      throw new Error(`Unsupported For Each action type: ${bodyNodeType}`);
  }
}

type IterationResult = {
  index: number;
  item: unknown;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
};

export async function executeForEachNode(
  config: ForEachNodeConfig,
  context: Record<string, unknown>
): Promise<{ success: boolean; output?: Record<string, unknown>; error?: string }> {
  try {
    const sourcePath = String(config.sourceVariablePath || "").trim();
    const outputVariable = String(config.outputVariable || "loopResults").trim();
    const itemVariableName = String(config.itemVariableName || "item").trim() || "item";
    const continueOnItemFailure = config.continueOnItemFailure !== false;

    if (!sourcePath) throw new Error("For Each source variable path is required");
    if (!outputVariable) throw new Error("For Each output variable is required");
    if (!config.bodyNodeType) {
      throw new Error("For Each requires a valid action to run per item");
    }

    const items = resolveVariablePath(sourcePath, context);
    if (!Array.isArray(items)) {
      throw new Error(`No array found at "${sourcePath}". For Each requires a list to iterate.`);
    }

    const maxIterations = Math.max(1, Math.min(HARD_ITERATION_CEILING, Math.floor(Number(config.maxIterations) || 100)));
    const truncated = items.length > maxIterations;
    const itemsToProcess = items.slice(0, maxIterations);

    const results: IterationResult[] = [];

    for (let index = 0; index < itemsToProcess.length; index += 1) {
      const item = itemsToProcess[index];
      const iterationContext: Record<string, unknown> = {
        ...context,
        [itemVariableName]: item,
        itemIndex: index,
      };

      try {
        const result = await runBodyNode(config.bodyNodeType, config.bodyConfig, iterationContext);
        results.push({ index, item, success: result.success, output: result.output, error: result.error });

        if (!result.success && !continueOnItemFailure) {
          break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to run iteration";
        results.push({ index, item, success: false, error: message });

        if (!continueOnItemFailure) {
          break;
        }
      }
    }

    const succeeded = results.filter((result) => result.success).length;
    const failed = results.length - succeeded;

    const output: Record<string, unknown> = {};
    setVariablePath(outputVariable, results, output);
    setVariablePath(`${outputVariable}Meta`, {
      totalItems: items.length,
      processedItems: results.length,
      succeeded,
      failed,
      truncated,
    }, output);

    return { success: true, output };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to run For Each node"
    };
  }
}
