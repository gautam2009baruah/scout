export const HTTP_TRIGGER_RESERVED_SHORT_NAMES = new Set<string>([
  "admin",
  "api",
  "apitrigger",
  "auth",
  "health",
  "internal",
  "login",
  "logout",
  "metrics",
  "status",
  "system",
]);

export const SHORT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

export const DEFAULT_ALLOWED_METHODS = ["POST"] as const;
export const ALL_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  "application/json",
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
] as const;

export const SENSITIVE_HEADER_NAMES = new Set([
  "authorization",
  "proxy-authorization",
  "x-api-key",
  "x-signature",
  "cookie",
  "set-cookie",
]);

export const HTTP_TRIGGER_RESPONSE_CODES = {
  successAccepted: 202,
  invalidInput: 400,
  unauthorized: 401,
  forbidden: 403,
  duplicateName: 409,
  rateLimited: 429,
  suspended: 423,
  internalFailure: 500,
} as const;
