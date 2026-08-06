// Plain-JS mirror of lib/logging/logger.ts for the .mjs workers, which cannot
// import TypeScript. Keep the output shape identical so both feed the same
// downstream pipeline. See logger.ts for the design notes.

const LEVEL_WEIGHT = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveMinLevel() {
  const raw = String(process.env.LOG_LEVEL || "").toLowerCase();
  if (raw in LEVEL_WEIGHT) return LEVEL_WEIGHT[raw];
  return process.env.NODE_ENV === "production" ? LEVEL_WEIGHT.info : LEVEL_WEIGHT.debug;
}

function isJsonFormat() {
  if (process.env.LOG_FORMAT === "json") return true;
  if (process.env.LOG_FORMAT === "pretty") return false;
  return process.env.NODE_ENV === "production";
}

const REDACT_KEYS = new Set([
  "password", "passwd", "secret", "secretciphertext", "ciphertext", "token",
  "recordertoken", "pairingtoken", "apikey", "authorization", "auth", "bearer",
  "cookie", "accesstoken", "refreshtoken", "clientsecret", "privatekey",
  "serviceaccountjson", "imappassword", "keyhash", "connectionstring",
  "credentials", "credential"
]);

function normalizeKey(key) {
  return key.toLowerCase().replace(/[_-]/g, "");
}

function serializeError(error) {
  return { name: error.name, message: error.message, stack: error.stack };
}

function redact(value, seen, depth = 0) {
  if (value instanceof Error) return serializeError(value);
  if (value === null || typeof value !== "object") return value;
  if (depth > 6) return "[Truncated]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redact(item, seen, depth + 1));
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = REDACT_KEYS.has(normalizeKey(key)) ? "[REDACTED]" : redact(val, seen, depth + 1);
  }
  return out;
}

function write(record, level) {
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

function makeLogger(scope, bindings) {
  function log(level, message, fields) {
    if (LEVEL_WEIGHT[level] < resolveMinLevel()) return;
    const context = redact({ ...bindings, ...(fields || {}) }, new WeakSet());
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

export function createLogger(scope, bindings = {}) {
  return makeLogger(scope, bindings);
}

export const logger = createLogger("app");
