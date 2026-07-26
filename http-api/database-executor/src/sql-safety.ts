// Ported from lib/orchestrations/nodes/database-node.ts. This service is a
// standalone, independently-downloadable package (see
// app/api/admin/database-executor/download/route.ts) with no dependency on
// the main app's lib/ folder, so the validation logic is duplicated here
// rather than imported. Keep the two in sync if either changes.

const FORBIDDEN_SQL_PATTERNS: RegExp[] = [
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|execute|call|copy|vacuum|analyze|comment)\b/i,
  /--/,
  /\/\*/,
  /\*\//,
  /\bunion\b/i,
  /\binto\b/i,
];

export type SqlValidationResult = { valid: true } | { valid: false; error: string };

export function validateSafeSelectQuery(
  sql: string,
  options: { allowSelectStar: boolean },
): SqlValidationResult {
  const trimmed = sql.trim();

  if (!trimmed) {
    return { valid: false, error: "SQL is empty." };
  }

  const statementCount = trimmed.split(";").filter((part) => part.trim()).length;
  if (statementCount > 1) {
    return { valid: false, error: "Only a single SQL statement is allowed." };
  }

  const normalized = trimmed.endsWith(";") ? trimmed.slice(0, -1).trim() : trimmed;
  if (!/^select\b/i.test(normalized)) {
    return { valid: false, error: "Only SELECT queries are allowed." };
  }

  for (const pattern of FORBIDDEN_SQL_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, error: "Unsafe SQL detected. Only safe SELECT queries are allowed." };
    }
  }

  if (!/\bfrom\b/i.test(normalized)) {
    return { valid: false, error: "SQL must include a FROM clause." };
  }

  if (!options.allowSelectStar && /\bselect\s+(?:distinct\s+)?(?:[a-zA-Z_][\w]*\.)?\*/i.test(normalized)) {
    return { valid: false, error: "SELECT * is not allowed for this deployment." };
  }

  return { valid: true };
}

export function ensureRowLimit(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;\s*$/, "");

  if (/\blimit\s+\d+\b/i.test(trimmed)) {
    return trimmed;
  }

  if (/\bfetch\s+first\s+\d+\s+rows\s+only\b/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} LIMIT ${maxRows}`;
}
