export type ApiConfig = {
  port: number;
  host: string;
  legacyApiKey: string;
  allowedOrigins: string[];
  requestBodyLimitBytes: number;
  companyCacheTtlMs: number;
  targetAppCacheTtlMs: number;
  authCacheTtlMs: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
};

function parseNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOrigins(value: string | undefined) {
  if (!value) return ["*"];
  const entries = value.split(",").map((item) => item.trim()).filter(Boolean);
  return entries.length > 0 ? entries : ["*"];
}

export function getApiConfig(): ApiConfig {
  const legacyApiKey = process.env.CHATBOT_API_KEY?.trim() || "";

  return {
    port: parseNumber(process.env.CHATBOT_API_PORT, 4200),
    host: process.env.CHATBOT_API_HOST?.trim() || "0.0.0.0",
    legacyApiKey,
    allowedOrigins: parseOrigins(process.env.CHATBOT_API_ALLOWED_ORIGINS),
    requestBodyLimitBytes: parseNumber(process.env.CHATBOT_API_BODY_LIMIT_BYTES, 262144),
    companyCacheTtlMs: parseNumber(process.env.CHATBOT_API_COMPANY_CACHE_TTL_MS, 300000),
    targetAppCacheTtlMs: parseNumber(process.env.CHATBOT_API_TARGET_APP_CACHE_TTL_MS, 300000),
    authCacheTtlMs: parseNumber(process.env.CHATBOT_API_AUTH_CACHE_TTL_MS, 300000),
    rateLimitWindowMs: parseNumber(process.env.CHATBOT_API_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: parseNumber(process.env.CHATBOT_API_RATE_LIMIT_MAX_REQUESTS, 60)
  };
}
