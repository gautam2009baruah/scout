// Self-contained structured logger for the standalone database-executor
// reference service (it cannot import the main app's lib). Mirrors the output
// shape of lib/logging/logger.ts: JSON in production, pretty in dev, and errors
// written to stderr so PM2/Docker split them into a separate stream.

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function minLevel(): number {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase() as LogLevel;
  if (raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw];
  return process.env.NODE_ENV === "production" ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;
}

function isJsonOutput(): boolean {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fieldsOrError?: Record<string, unknown> | Error): void;
}

export function createLogger(scope: string): Logger {
  function emit(level: LogLevel, message: string, fields?: Record<string, unknown>) {
    if (LEVEL_WEIGHT[level] < minLevel()) return;
    const normalized = fields
      ? Object.fromEntries(
          Object.entries(fields).map(([key, value]) =>
            value instanceof Error ? [key, { name: value.name, message: value.message, stack: value.stack }] : [key, value]
          )
        )
      : {};
    const record = { ts: new Date().toISOString(), level, scope, msg: message, ...normalized };
    const stream = level === "error" ? process.stderr : process.stdout;
    if (isJsonOutput()) {
      stream.write(`${JSON.stringify(record)}\n`);
    } else {
      const rest = Object.keys(normalized).length ? ` ${JSON.stringify(normalized)}` : "";
      stream.write(`${record.ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${rest}\n`);
    }
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fieldsOrError) =>
      emit("error", message, fieldsOrError instanceof Error ? { err: fieldsOrError } : fieldsOrError)
  };
}
