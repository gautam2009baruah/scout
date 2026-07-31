import type { SwitchNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateCondition, resolveVariablePath } from "../expression-evaluator";

export type SwitchNodeResult = {
  success: boolean;
  output?: Record<string, unknown>;
  outputHandle?: string;
  error?: string;
};

export async function executeSwitchNode(
  config: SwitchNodeConfig,
  context: Record<string, unknown>
): Promise<SwitchNodeResult> {
  try {
    const variable = String(config.variable || "").trim();
    const routes = Array.isArray(config.routes) ? config.routes : [];

    if (!variable) {
      return { success: false, error: "Switch variable is required" };
    }

    const actualValue = resolveVariablePath(variable, context);

    for (const route of routes) {
      if (!route?.id || !route?.name || !route?.operator) continue;

      let comparisonValue = route.value;
      const valueType = route.valueType || "auto";
      if (valueType === "number" || (valueType === "auto" && typeof actualValue === "number")) {
        comparisonValue = Number(route.value);
      } else if (valueType === "boolean" || (valueType === "auto" && typeof actualValue === "boolean")) {
        comparisonValue = route.value === true || String(route.value).toLowerCase() === "true";
      } else if (valueType === "text") {
        comparisonValue = String(route.value ?? "");
      }

      if (evaluateCondition(variable, route.operator, comparisonValue, context, route.caseSensitive === true)) {
        return {
          success: true,
          outputHandle: route.id,
          output: {
            switchResult: {
              variable,
              matchedRouteId: route.id,
              matchedRouteName: route.name,
              usedDefault: false,
            },
          },
        };
      }
    }

    return {
      success: true,
      outputHandle: "default",
      output: {
        switchResult: {
          variable,
          matchedRouteId: "default",
          matchedRouteName: "Default",
          usedDefault: true,
        },
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unable to evaluate switch routes",
    };
  }
}
