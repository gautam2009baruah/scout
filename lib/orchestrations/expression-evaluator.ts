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
  // Check if it's a variable reference (starts with {{)
  if (path.startsWith('{{') && path.endsWith('}}')) {
    path = path.slice(2, -2).trim();
  }
  
  const parts = path.split(".");
  let current: any = context;

  console.log(`    🔍 Resolving path: "${path}"`);
  console.log(`    📂 Path parts:`, parts);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (current === null || current === undefined) {
      console.warn(`    ⚠️  Path resolution failed at step ${i + 1}/${parts.length}: "${part}"`);
      console.warn(`    💡 Current value is ${current === null ? 'null' : 'undefined'}`);
      return undefined;
    }

    if (typeof current === "object" && part in current) {
      current = current[part];
      console.log(`    ✓ Step ${i + 1}/${parts.length}: "${part}" →`, current, `(type: ${typeof current})`);
    } else {
      console.warn(`    ❌ Path resolution failed at step ${i + 1}/${parts.length}: "${part}" not found`);
      console.warn(`    💡 Available keys at this level:`, Object.keys(current as object));
      return undefined;
    }
  }

  console.log(`    ✅ Resolved to:`, current);
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
  
  console.log(`    📌 Variable: "${variable}"`);
  console.log(`    📌 Actual value from context:`, actualValue, `(type: ${typeof actualValue})`);
  console.log(`    📌 Expected value:`, value, `(type: ${typeof value})`);
  console.log(`    📌 Operator: "${operator}"`);

  let result = false;

  switch (operator) {
    case "equals":
      result = actualValue === value;
      if (!result && actualValue == value) {
        console.warn(`    ⚠️  Values are loosely equal (==) but not strictly equal (===)`);
        console.warn(`    💡 Tip: Check data types - "${actualValue}" vs ${value}`);
      }
      break;

    case "not_equals":
      result = actualValue !== value;
      break;

    case "contains":
      result = (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        actualValue.includes(value)
      );
      if (!result) {
        if (typeof actualValue !== "string") {
          console.warn(`    ⚠️  Actual value is not a string (got ${typeof actualValue})`);
        }
        if (typeof value !== "string") {
          console.warn(`    ⚠️  Expected value is not a string (got ${typeof value})`);
        }
      }
      break;

    case "not_contains":
      result = (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        !actualValue.includes(value)
      );
      break;

    case "greater_than":
      result = (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue > value
      );
      if (!result) {
        if (typeof actualValue !== "number") {
          console.warn(`    ⚠️  Actual value is not a number (got ${typeof actualValue})`);
          console.warn(`    💡 Tip: Use Number(${actualValue}) or parse the value`);
        }
        if (typeof value !== "number") {
          console.warn(`    ⚠️  Expected value is not a number (got ${typeof value})`);
        }
      }
      break;

    case "less_than":
      result = (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue < value
      );
      if (!result) {
        if (typeof actualValue !== "number") {
          console.warn(`    ⚠️  Actual value is not a number (got ${typeof actualValue})`);
        }
        if (typeof value !== "number") {
          console.warn(`    ⚠️  Expected value is not a number (got ${typeof value})`);
        }
      }
      break;

    case "greater_or_equal":
      result = (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue >= value
      );
      break;

    case "less_or_equal":
      result = (
        typeof actualValue === "number" &&
        typeof value === "number" &&
        actualValue <= value
      );
      break;

    case "starts_with":
      result = (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        actualValue.startsWith(value)
      );
      break;

    case "ends_with":
      result = (
        typeof actualValue === "string" &&
        typeof value === "string" &&
        actualValue.endsWith(value)
      );
      break;

    case "exists":
      result = actualValue !== undefined && actualValue !== null;
      break;

    case "not_exists":
      result = actualValue === undefined || actualValue === null;
      break;

    case "empty":
      result = (
        actualValue === undefined ||
        actualValue === null ||
        actualValue === "" ||
        (Array.isArray(actualValue) && actualValue.length === 0) ||
        (typeof actualValue === "object" && Object.keys(actualValue).length === 0)
      );
      break;

    case "not_empty":
      result = !(
        actualValue === undefined ||
        actualValue === null ||
        actualValue === "" ||
        (Array.isArray(actualValue) && actualValue.length === 0) ||
        (typeof actualValue === "object" && Object.keys(actualValue).length === 0)
      );
      break;

    default:
      console.error(`    ❌ Unknown operator: "${operator}"`);
      throw new Error(`Unknown operator: ${operator}`);
  }
  
  console.log(`    📊 Comparison result: ${result ? '✅ TRUE' : '❌ FALSE'}`);
  return result;
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
