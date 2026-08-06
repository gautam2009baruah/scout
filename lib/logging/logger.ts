// Structured logging seam. Everything server-side should log through this
// instead of console.* so the backend (console today; pino / CloudWatch / OTEL
// tomorrow) can be swapped in ONE place without touching call sites.
//
// Design:
// - JSON, one object per line, in production (LOG_FORMAT=json or NODE_ENV=production).
// - Human-friendly pretty output in development.
// - `error` (and above) is written to STDERR, everything else to STDOUT. Under
//   PM2 that automatically splits errors into the separate `*-error.log` file,
//   so they are trivial to find; the `level` field also makes `jq` filtering easy.
// - Secrets are redacted by key so tokens/passwords never reach the logs.

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fieldsOrError?: Record<string, unknown> | Error): void;
  child(bindings: Record<string, unknown>): Logger;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel(): number {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase() as LogLevel;
  if (raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw];
  return process.env.NODE_ENV === "production" ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;
}

function isJsonFormat(): boolean {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

// Exact (normalized) key names whose values must never be logged.
const REDACT_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "secretciphertext",
  "ciphertext",
  "token",
  "recordertoken",
  "pairingtoken",
  "apikey",
  "authorization",
  "auth",
  "bearer",
  "cookie",
  "accesstoken",
  "refreshtoken",
  "clientsecret",
  "privatekey",
  "serviceaccountjson",
  "imappassword",
  "keyhash",
  "connectionstring",
  "credentials",
  "credential"
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function serializeError(error: Error): Record<string, unknown> {
  return { name: error.name, message: error.message, stack: error.stack };
}

function redact(value: unknown, seen: WeakSet<object>, depth = 0): unknown {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return "[Truncated]";
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((item) => redact(item, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.has(normalizeKey(key)) ? "[REDACTED]" : redact(val, seen, depth + 1);
  }
  return out;
}

function write(record: Record<string, unknown>, level: LogLevel) {
  const stream = level === "error" ? process.stderr : process.stdout;
  if (isJsonFormat()) {
    stream.write(`${JSON.stringify(record)}\n`);
    return;
  }
  const { ts, level: lvl, scope, msg, ...rest } = record;
  const restKeys = Object.keys(rest);
  const suffix = restKeys.length ? ` ${JSON.stringify(rest)}` : "";
  stream.write(`${ts} ${String(lvl).toUpperCase().padEnd(5)} [${scope}] ${msg}${suffix}\n`);
}

function makeLogger(scope: string, bindings: Record<string, unknown>): Logger {
  const minLevel = () => resolveMinLevel();

  function log(level: LogLevel, message: string, fields?: Record<string, unknown>) {
    if (LEVEL_WEIGHT[level] < minLevel()) return;
    const context = redact({ ...bindings, ...(fields || {}) }, new WeakSet()) as Record<string, unknown>;
    write({ ts: new Date().toISOString(), level, scope, msg: message, ...context }, level);
  }

  return {
    debug: (message, fields) => log("debug", message, fields),
    info: (message, fields) => log("info", message, fields),
    warn: (message, fields) => log("warn", message, fields),
    error: (message, fieldsOrError) =>
      log("error", message, fieldsOrError instanceof Error ? { err: fieldsOrError } : fieldsOrError),
    child: (childBindings) => makeLogger(scope, { ...bindings, ...childBindings })
  };
}

export function createLogger(scope: string, bindings: Record<string, unknown> = {}): Logger {
  return makeLogger(scope, bindings);
}

export const logger = createLogger("app");
