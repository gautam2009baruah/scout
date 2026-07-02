// Expression evaluator for orchestration variable expressions
// Supports {{variable.path}} syntax and conditions

/**
 * Evaluate variable expressions in strings
 * Example: "Hello {{customer.name}}" -> "Hello John"
 */
export function evaluateExpression(
  template: string | Record<string, unknown>,
  context: Record<string, unknown>
): any {
  if (typeof template === "string") {
    return evaluateStringExpression(template, context);
  }

  if (typeof template === "object" && template !== null) {
    return evaluateObjectExpression(template, context);
  }

  return template;
}

/**
 * Evaluate expressions in a string template
 */
function evaluateStringExpression(
  template: string,
  context: Record<string, unknown>
): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, expr) => {
    const value = resolveVariablePath(expr.trim(), context);
    return value !== undefined ? String(value) : "";
  });
}

/**
 * Recursively evaluate expressions in an object
 */
function evaluateObjectExpression(
  obj: Record<string, unknown>,
  context: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = evaluateStringExpression(value, context);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = evaluateObjectExpression(value as Record<string, unknown>, context);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "string"
          ? evaluateStringExpression(item, context)
          : item
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Resolve a variable path like "customer.name" or "workflow.CreateInvoice.invoiceId"
 */
export function resolveVariablePath(
  path: string,
  context: Record<string, unknown>
): unknown {
  const parts = path.split(".");
  let current: any = context;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === "object" && part in current) {
      current = current[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a condition expression
 * Used by condition nodes and connection conditions
 */
export function evaluateCondition(
  variable: string,
  operator: string,
  value: unknown,
  context: Record<string, unknown>
): boolean {
  const actualValue = resolveVariablePath(variable, context);

  switch (operator) {
    case "equals":
      return actualValue === value;

    case "not_equals":
      return actualValue !== value;

    case "contains":
      return (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        actualValue.includes(value)
      );

    case "not_contains":
      return (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        !actualValue.includes(value)
      );

    case "greater_than":
      return (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue > value
      );

    case "less_than":
      return (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue < value
      );

    case "exists":
      return actualValue !== undefined && actualValue !== null;

    case "not_exists":
      return actualValue === undefined || actualValue === null;

    case "empty":
      return (
        actualValue === undefined ||
        actualValue === null ||
        actualValue === "" ||
        (Array.isArray(actualValue) && actualValue.length === 0) ||
        (typeof actualValue === "object" && Object.keys(actualValue).length === 0)
      );

    case "not_empty":
      return !(
        actualValue === undefined ||
        actualValue === null ||
        actualValue === "" ||
        (Array.isArray(actualValue) && actualValue.length === 0) ||
        (typeof actualValue === "object" && Object.keys(actualValue).length === 0)
      );

    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}

/**
 * Set a variable in the context using a path
 */
export function setVariablePath(
  path: string,
  value: unknown,
  context: Record<string, unknown>
): void {
  const parts = path.split(".");
  let current: any = context;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Delete a variable from the context using a path
 */
export function deleteVariablePath(
  path: string,
  context: Record<string, unknown>
): void {
  const parts = path.split(".");
  let current: any = context;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      return;
    }
    current = current[part];
  }

  delete current[parts[parts.length - 1]];
}
