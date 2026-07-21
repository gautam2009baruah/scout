import type { DatabaseNodeConfig } from "@/shared/orchestrationTypes";
import { getPool } from "@/lib/db/pool";
import { getLLMProvider } from "@/lib/llm/providers";
import { resolveVariablePath, setVariablePath } from "../expression-evaluator";

type DatabaseNodeRuntimeOptions = {
  companyId?: string;
  targetAppId?: string | null;
  executionId?: string;
  nodeId?: string;
};

type DatabaseSchemaRow = {
  id: string;
  target_app_id: string;
  database_name: string;
  database_type: string;
  schema_json: Record<string, unknown>;
};

type ValidationResult = {
  valid: boolean;
  error?: string;
};

type DatabaseReadinessAssessment = {
  ready: boolean;
  confidence: number;
  question?: string;
  reason?: string;
  missingInformation?: string[];
};

const FORBIDDEN_SQL_PATTERNS: RegExp[] = [
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|merge|execute|call|copy|vacuum|analyze|comment)\b/i,
  /--/,
  /\/\*/,
  /\*\//,
  /\bunion\b/i,
  /\binto\b/i,
];

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function getMaxRows(config: DatabaseNodeConfig): number {
  const parsed = Number(config.maxRows);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function normalizeSchemaSummary(rawSchema: unknown): string {
  const schemaObject = (rawSchema && typeof rawSchema === "object" ? rawSchema : {}) as Record<string, unknown>;
  const rawTables = Array.isArray(schemaObject.tables) ? schemaObject.tables : [];

  const tableLines = rawTables
    .map((tableItem) => {
      const table = (tableItem && typeof tableItem === "object" ? tableItem : {}) as Record<string, unknown>;
      const tableName = normalizeText(table.name);
      if (!tableName) return "";
      const isExposed = table.isExposed !== false;
      if (!isExposed) return "";

      const rawColumns = Array.isArray(table.columns) ? table.columns : [];
      const columns = rawColumns
        .map((columnItem) => {
          const column = (columnItem && typeof columnItem === "object" ? columnItem : {}) as Record<string, unknown>;
          const columnName = normalizeText(column.name);
          if (!columnName) return "";
          if (column.isExposed === false) return "";
          const columnType = normalizeText(column.type);
          return columnType ? `${columnName} (${columnType})` : columnName;
        })
        .filter(Boolean);

      if (columns.length === 0) {
        return `${tableName}: [no exposed columns]`;
      }

      return `${tableName}: ${columns.join(", ")}`;
    })
    .filter(Boolean);

  return tableLines.join("\n");
}

function firstNonEmptyString(values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function buildSqlGenerationPrompt(input: {
  userRequest: string;
  extractedInput: unknown;
  additionalContext: unknown;
  schemaSummary: string;
  maxRows: number;
  customInstructions: string;
  allowSelectStar: boolean;
}) {
  const extractedJson =
    input.extractedInput === undefined ? "null" : JSON.stringify(input.extractedInput, null, 2);
  const additionalContextJson =
    input.additionalContext === undefined ? "null" : JSON.stringify(input.additionalContext, null, 2);

  const systemPrompt = [
    "You are an expert SQL generation assistant for workflow automation.",
    "Generate exactly one read-only SQL SELECT query.",
    "Rules:",
    "1) Output only JSON: {\"sql\": \"...\", \"reasoning\": \"...\"}",
    "2) SQL must start with SELECT.",
    "3) Never use INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, MERGE, EXEC, UNION, INTO.",
    `4) Avoid SELECT * unless truly necessary.${input.allowSelectStar ? "" : " SELECT * is disallowed."}`,
    `5) Use concise projection and include LIMIT ${input.maxRows} (or equivalent row cap syntax).`,
    "6) Use schema metadata only.",
    "7) Treat extracted JSON fields and the latest clarification as authoritative query parameters.",
    "8) Use the original user request for business intent, but never interpret workflow-control text such as 'start workflow' or an orchestration name as the database query.",
    input.customInstructions ? `9) Additional instructions: ${input.customInstructions}` : "",
  ].filter(Boolean).join("\n");

  const userPrompt = [
    `User request: ${input.userRequest || "(empty)"}`,
    "Extracted input JSON:",
    extractedJson,
    "Additional context:",
    additionalContextJson,
    "Schema metadata:",
    input.schemaSummary || "(no schema metadata)",
  ].join("\n\n");

  return { systemPrompt, userPrompt };
}

async function assessDatabaseRequestReadiness(input: {
  provider: Awaited<ReturnType<typeof getLLMProvider>>;
  userRequest: string;
  extractedInput: unknown;
  additionalContext: unknown;
  schemaSummary: string;
  customInstructions: string;
}): Promise<DatabaseReadinessAssessment> {
  const systemPrompt = [
    "You are a schema-aware database request planner.",
    "Before SQL is generated, decide whether the user's complete request can be mapped to the available schema without making a material business assumption.",
    "A request is ready when it identifies a meaningful result to retrieve and provides any criteria necessary for that stated result.",
    "Do not require the user to know table names, column names, SQL, joins, or other implementation details.",
    "Use natural-language intent, extracted values, configured instructions, and schema metadata together.",
    "If multiple reasonable schema mappings would materially change the result, ask one concise question that best resolves the ambiguity.",
    "If the request merely asks to fetch or retrieve unspecified data, it is not ready.",
    "Do not ask for optional filters or preferences when a safe, useful query already follows from the request.",
    "Never invent missing business intent or filter values.",
    "Return JSON only:",
    '{"ready":true|false,"confidence":0-1,"question":"single question or empty string","missingInformation":["..."],"reason":"..."}.',
  ].join("\n");
  const requestContext = JSON.stringify({
    userRequest: input.userRequest,
    extractedInput: input.extractedInput ?? null,
    additionalContext: input.additionalContext ?? null,
    customInstructions: input.customInstructions || null,
  });
  const userPrompt = [
    "Request context:",
    requestContext,
    "Available schema:",
    input.schemaSummary || "(no exposed schema metadata)",
  ].join("\n\n");

  const raw = await input.provider.generate_answer(systemPrompt, userPrompt, input.schemaSummary);
  const parsed = parseJsonObject(raw || "");
  const question = normalizeText(parsed?.question);
  const confidence = Math.max(0, Math.min(1, Number(parsed?.confidence) || 0));
  const missingInformation = Array.isArray(parsed?.missingInformation)
    ? parsed.missingInformation
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
    : [];

  if (parsed?.ready === false && confidence >= 0.65 && question) {
    return {
      ready: false,
      confidence,
      question,
      missingInformation,
      reason: normalizeText(parsed?.reason),
    };
  }

  return {
    ready: true,
    confidence,
    missingInformation: [],
    reason: normalizeText(parsed?.reason),
  };
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const fencedJson = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const cleaned = (fencedJson ? fencedJson[1] : raw).trim();
  if (!cleaned) return null;
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function isChatbotTriggerContext(context: Record<string, unknown>): boolean {
  const trigger = context.trigger as Record<string, unknown> | undefined;
  const triggerInput = trigger?.input as Record<string, unknown> | undefined;
  return (
    triggerInput?.triggerType === "chatbot"
    || trigger?.type === "chatbot"
    || context.triggerType === "chatbot"
  );
}

function parseSqlFromLLMResponse(response: string): { sql: string; reasoning?: string } {
  const fencedJson = response.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fencedJson ? fencedJson[1] : response).trim();

  try {
    const parsed = JSON.parse(raw) as { sql?: unknown; reasoning?: unknown };
    return {
      sql: normalizeText(parsed.sql),
      reasoning: normalizeText(parsed.reasoning) || undefined,
    };
  } catch {
    return { sql: raw };
  }
}

function validateSafeSelectQuery(
  sql: string,
  options: { allowSelectStar: boolean; maxRows: number }
): ValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { valid: false, error: "Generated SQL is empty." };
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
    return { valid: false, error: "Generated SQL must include FROM clause." };
  }

  if (!options.allowSelectStar && /\bselect\s+(?:distinct\s+)?(?:[a-zA-Z_][\w]*\.)?\*/i.test(normalized)) {
    return { valid: false, error: "SELECT * is not allowed for this node configuration." };
  }

  return { valid: true };
}

function ensureRowLimit(sql: string, maxRows: number): string {
  const trimmed = sql.trim().replace(/;\s*$/, "");
  if (/\blimit\s+\d+\b/i.test(trimmed)) {
    return trimmed;
  }

  if (/\bfetch\s+first\s+\d+\s+rows\s+only\b/i.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed} LIMIT ${maxRows}`;
}

function scoreTableMatch(
  tableName: string,
  columns: string[],
  keys: string[],
  requestText: string
): number {
  const normalizedTable = tableName.toLowerCase();
  const columnSet = new Set(columns.map((column) => column.toLowerCase()));
  let score = 0;

  if (requestText.includes(normalizedTable)) {
    score += 2;
  }

  for (const key of keys) {
    const normalizedKey = key.toLowerCase();
    if (columnSet.has(normalizedKey)) {
      score += 3;
    } else if (Array.from(columnSet).some((column) => column.includes(normalizedKey) || normalizedKey.includes(column))) {
      score += 1;
    }
  }

  return score;
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

function toSqlLiteral(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return `'${escapeSqlString(trimmed)}'`;
  }
  return `'${escapeSqlString(JSON.stringify(value))}'`;
}

function buildFallbackSelectQuery(input: {
  schema: Record<string, unknown>;
  extractedInput: unknown;
  userRequest: string;
  maxRows: number;
}) {
  const schemaObject = (input.schema && typeof input.schema === "object" ? input.schema : {}) as Record<string, unknown>;
  const rawTables = Array.isArray(schemaObject.tables) ? schemaObject.tables : [];
  const extractedObject =
    input.extractedInput && typeof input.extractedInput === "object" && !Array.isArray(input.extractedInput)
      ? (input.extractedInput as Record<string, unknown>)
      : {};

  const extractedKeys = Object.keys(extractedObject);
  const normalizedRequest = input.userRequest.toLowerCase();

  const candidates = rawTables
    .map((tableItem) => {
      const table = (tableItem && typeof tableItem === "object" ? tableItem : {}) as Record<string, unknown>;
      const tableName = normalizeText(table.name);
      if (!tableName || table.isExposed === false) return null;

      const columns = (Array.isArray(table.columns) ? table.columns : [])
        .map((columnItem) => {
          const column = (columnItem && typeof columnItem === "object" ? columnItem : {}) as Record<string, unknown>;
          const columnName = normalizeText(column.name);
          if (!columnName || column.isExposed === false) return "";
          return columnName;
        })
        .filter(Boolean);

      if (columns.length === 0) return null;

      return {
        tableName,
        columns,
        score: scoreTableMatch(tableName, columns, extractedKeys, normalizedRequest),
      };
    })
    .filter((item): item is { tableName: string; columns: string[]; score: number } => Boolean(item));

  if (candidates.length === 0) {
    return `SELECT 1 LIMIT ${input.maxRows}`;
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates[0];

  const whereClauses: string[] = [];
  for (const [key, value] of Object.entries(extractedObject)) {
    const matchedColumn = selected.columns.find((column) => column.toLowerCase() === key.toLowerCase());
    if (!matchedColumn) continue;
    const literal = toSqlLiteral(value);
    if (!literal) continue;
    whereClauses.push(`${matchedColumn} = ${literal}`);
  }

  const projectedColumns = selected.columns.slice(0, 8).join(", ");
  const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
  return `SELECT ${projectedColumns} FROM ${selected.tableName}${whereSql} LIMIT ${input.maxRows}`;
}

async function getActiveSchemaById(input: {
  schemaId: string;
  companyId: string;
  targetAppId?: string | null;
}): Promise<DatabaseSchemaRow | null> {
  return (
    await getPool().query<DatabaseSchemaRow>(
      `
        SELECT
          schemas.id,
          schemas.target_app_id,
          schemas.database_name,
          schemas.database_type,
          schemas.schema_json
        FROM target_app_database_schemas schemas
        INNER JOIN company_target_applications cta ON cta.id = schemas.target_app_id
        WHERE schemas.id = $1
          AND cta.company_id = $2
          AND cta.deleted_at IS NULL
          AND schemas.deleted_at IS NULL
          AND schemas.is_active = true
          AND ($3::uuid IS NULL OR schemas.target_app_id = $3::uuid)
        LIMIT 1
      `,
      [input.schemaId, input.companyId, input.targetAppId || null]
    )
  ).rows[0] || null;
}

export async function executeDatabaseNode(
  config: DatabaseNodeConfig,
  context: Record<string, unknown>,
  runtimeOptions: DatabaseNodeRuntimeOptions = {}
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  paused?: boolean;
  outputHandle?: string;
  clarification?: {
    missingFields: string[];
    message: string;
    questions: string[];
    timeoutMinutes: number;
    expiresAt: string;
    fieldDefinitions: Array<{
      key: string;
      type: string;
      description?: string;
    }>;
  };
  error?: string;
}> {
  try {
    const schemaId = normalizeText(config.schemaId);
    if (!schemaId) {
      throw new Error("Database schema selection is required.");
    }

    const companyId =
      normalizeText(runtimeOptions.companyId) ||
      firstNonEmptyString([
        resolveVariablePath("companyId", context),
        resolveVariablePath("trigger.input.companyId", context),
      ]);

    if (!companyId) {
      throw new Error("Unable to resolve company context for Database Node.");
    }

    const targetAppId =
      normalizeText(runtimeOptions.targetAppId) ||
      firstNonEmptyString([
        resolveVariablePath("targetAppId", context),
        resolveVariablePath("trigger.input.targetAppId", context),
      ]) ||
      null;

    const schemaRow = await getActiveSchemaById({
      schemaId,
      companyId,
      targetAppId,
    });

    if (!schemaRow) {
      throw new Error("Selected database schema is unavailable or inactive for this target app.");
    }

    const userRequestPath = normalizeText(config.userRequestVariablePath) || "userMessage";
    const extractedPath = normalizeText(config.extractedInputVariablePath) || "extracted";
    const additionalContextPath = normalizeText(config.additionalContextVariablePath);
    const outputVariable = normalizeText(config.outputVariable) || "databaseQuery";

    const originalUserRequest = firstNonEmptyString([
      resolveVariablePath(userRequestPath, context),
      resolveVariablePath("trigger.input.userMessage", context),
      resolveVariablePath("trigger.input.message", context),
      resolveVariablePath("message", context),
      resolveVariablePath("query", context),
    ]);
    const latestUserMessage = firstNonEmptyString([
      resolveVariablePath("latestUserMessage", context),
      resolveVariablePath("_chatbot.latestUserMessage", context),
    ]);
    const priorClarifications = resolveVariablePath("_chatbot.databaseClarifications", context);
    const clarificationMessages = Array.isArray(priorClarifications)
      ? priorClarifications
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .map((value) => value.trim())
      : [];
    if (
      latestUserMessage
      && latestUserMessage !== originalUserRequest
      && !clarificationMessages.includes(latestUserMessage)
    ) {
      clarificationMessages.push(latestUserMessage);
    }
    const userRequest = [
      originalUserRequest || "Database request",
      ...clarificationMessages.map((value, index) => `Clarification ${index + 1}: ${value}`),
    ].join("\n");

    const extractedInput = resolveVariablePath(extractedPath, context);
    const additionalContext = additionalContextPath
      ? resolveVariablePath(additionalContextPath, context)
      : undefined;

    const maxRows = getMaxRows(config);
    const allowSelectStar = config.allowSelectStar === true;
    const schemaSummary = normalizeSchemaSummary(schemaRow.schema_json);
    const provider = await getLLMProvider(companyId);
    const readiness = await assessDatabaseRequestReadiness({
      provider,
      userRequest,
      extractedInput,
      additionalContext,
      schemaSummary,
      customInstructions: normalizeText(config.customInstructions),
    });

    if (!readiness.ready) {
      if (!isChatbotTriggerContext(context)) {
        throw new Error(
          `Database request needs clarification: ${readiness.question || readiness.reason || "insufficient query intent"}`
        );
      }

      const timeoutMinutes = Math.max(1, Number(config.clarificationTimeoutMinutes) || 15);
      const question = readiness.question || "What data would you like to retrieve?";
      const expiresAt = new Date(Date.now() + timeoutMinutes * 60 * 1000).toISOString();
      const partialPayload = {
        schemaName: schemaRow.database_name,
        databaseType: schemaRow.database_type,
        capturedInput: {
          userRequest,
          extractedInput,
          additionalContext,
        },
        readiness: {
          confidence: readiness.confidence,
          reason: readiness.reason || null,
          missingInformation: readiness.missingInformation || [],
        },
        notExecuted: true,
      };
      const output: Record<string, unknown> = {};
      setVariablePath(outputVariable, partialPayload, output);

      return {
        success: true,
        paused: true,
        output,
        outputHandle: "clarification",
        clarification: {
          missingFields: ["database_request_clarification"],
          message: question,
          questions: [question],
          timeoutMinutes,
          expiresAt,
          fieldDefinitions: [{
            key: "database_request_clarification",
            type: "string",
            description: question,
          }],
        },
      };
    }

    const prompt = buildSqlGenerationPrompt({
      userRequest,
      extractedInput,
      additionalContext,
      schemaSummary,
      maxRows,
      customInstructions: normalizeText(config.customInstructions),
      allowSelectStar,
    });

    const aiResponse = await provider.generate_answer(
      prompt.systemPrompt,
      prompt.userPrompt,
      schemaSummary
    );

    const parsed = parseSqlFromLLMResponse(aiResponse);
    let generatedSql = parsed.sql;

    if (!generatedSql) {
      generatedSql = buildFallbackSelectQuery({
        schema: schemaRow.schema_json,
        extractedInput,
        userRequest,
        maxRows,
      });
    }

    generatedSql = ensureRowLimit(generatedSql, maxRows);
    const validation = validateSafeSelectQuery(generatedSql, { allowSelectStar, maxRows });

    if (!validation.valid) {
      throw new Error(validation.error || "Generated SQL failed safety validation.");
    }

    const outputPayload = {
      schemaName: schemaRow.database_name,
      databaseType: schemaRow.database_type,
      generatedQuery: generatedSql,
      sqlValidation: {
        valid: true,
        mode: "select_only",
      },
      generationMeta: {
        provider: provider.provider,
        model: provider.model,
        userRequestPath,
        extractedInputPath: extractedPath,
        additionalContextPath: additionalContextPath || null,
        maxRows,
      },
      capturedInput: {
        userRequest,
        extractedInput,
        additionalContext,
      },
      reasoning: parsed.reasoning || null,
      notExecuted: true,
    };

    const output: Record<string, unknown> = {};
    setVariablePath(outputVariable, outputPayload, output);

    return {
      success: true,
      output,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown database node error";
    return {
      success: false,
      error: errorMessage,
      output: {
        databaseNodeError: {
          message: errorMessage,
          notExecuted: true,
        },
      },
    };
  }
}
