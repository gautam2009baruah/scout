// Minimal JSON Schema (draft-07-ish) validator covering exactly the subset
// used by config/planner-tools.json: type, properties, required, enum,
// items, minimum/maximum, pattern. No external dependency — matches this
// codebase's existing convention of hand-rolled validation for a fixed,
// known schema shape (e.g. database-node.ts's validateSafeSelectQuery)
// rather than pulling in a general-purpose library for one narrow use.

export type JsonSchema = {
  type?: "object" | "string" | "number" | "integer" | "boolean" | "array";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  pattern?: string;
  description?: string;
  [key: string]: unknown;
};

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

export function validateAgainstJsonSchema(value: unknown, schema: JsonSchema, path = "$"): string[] {
  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`];
  }

  switch (schema.type) {
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        return [`${path}: expected an object`];
      }

      const obj = value as Record<string, unknown>;
      const errors: string[] = [];

      for (const key of schema.required || []) {
        if (isEmptyValue(obj[key])) {
          errors.push(`${path}.${key}: required field is missing`);
        }
      }

      if (schema.properties) {
        for (const [key, propertySchema] of Object.entries(schema.properties)) {
          if (key in obj && obj[key] !== undefined) {
            errors.push(...validateAgainstJsonSchema(obj[key], propertySchema, `${path}.${key}`));
          }
        }
      }

      return errors;
    }
    case "array": {
      if (!Array.isArray(value)) {
        return [`${path}: expected an array`];
      }
      if (!schema.items) {
        return [];
      }
      return value.flatMap((item, index) => validateAgainstJsonSchema(item, schema.items!, `${path}[${index}]`));
    }
    case "string": {
      if (typeof value !== "string") {
        return [`${path}: expected a string`];
      }
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        return [`${path}: does not match required pattern`];
      }
      return [];
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return [`${path}: expected a number`];
      }
      const errors: string[] = [];
      if (schema.type === "integer" && !Number.isInteger(value)) {
        errors.push(`${path}: expected an integer`);
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push(`${path}: below minimum ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push(`${path}: above maximum ${schema.maximum}`);
      }
      return errors;
    }
    case "boolean": {
      return typeof value === "boolean" ? [] : [`${path}: expected a boolean`];
    }
    default:
      // No type constraint (e.g. condition.value, which is intentionally
      // untyped in planner-tools.json) — anything goes.
      return [];
  }
}
