import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";

export class ChatbotApiKeyAccessError extends Error {
  constructor(message: string, public readonly statusCode = 401) {
    super(message);
    this.name = "ChatbotApiKeyAccessError";
  }
}

function extractApiKey(request: Request) {
  const apiKeyHeader = request.headers.get("x-api-key");
  if (apiKeyHeader && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeOriginRule(rule: string) {
  const value = String(rule || "").trim().toLowerCase();
  if (!value) return "";

  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

function matchesOriginRule(hostname: string, rule: string) {
  if (!rule) return false;
  if (rule.startsWith("*.")) {
    return hostname.endsWith(rule.slice(1));
  }
  return hostname === rule;
}

function isOriginAllowed(hostname: string, rules: string[]) {
  if (rules.length === 0) {
    return true;
  }

  if (!hostname) {
    return false;
  }

  const normalized = rules.map(normalizeOriginRule).filter(Boolean);
  return normalized.some((rule) => matchesOriginRule(hostname, rule));
}

function parseOriginHost(request: Request) {
  const origin = request.headers.get("origin")?.trim() || "";
  if (origin) {
    try {
      return new URL(origin).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  const referer = request.headers.get("referer")?.trim() || "";
  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export async function assertChatbotApiKeyAccess(request: Request, input: { companyId: string; targetAppId?: string }) {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    // Keep backward compatibility for internal first-party callers that do not use embed API keys.
    return;
  }

  const companyId = String(input.companyId || "").trim();
  const targetAppId = String(input.targetAppId || "").trim();
  if (!companyId) {
    throw new ChatbotApiKeyAccessError("Company is required for API key validation.", 400);
  }

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string | null;
    allowed_origins_json: string[] | null;
  }>(
    `
      SELECT
        k.id,
        k.company_id,
        k.target_app_id,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json
      FROM chatbot_api_keys k
      WHERE k.key_hash = $1
        AND k.status = 'active'
        AND k.is_active = true
        AND (k.expires_at IS NULL OR k.expires_at > now())
      LIMIT 1
    `,
    [hashToken(apiKey)]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new ChatbotApiKeyAccessError("Invalid API key.", 401);
  }

  const row = result.rows[0];
  if (row.company_id !== companyId) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this company.", 403);
  }

  if (row.target_app_id && (!targetAppId || row.target_app_id !== targetAppId)) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this target app.", 403);
  }

  const requestHost = parseOriginHost(request);
  const allowedOrigins = Array.isArray(row.allowed_origins_json) ? row.allowed_origins_json : [];
  if (!isOriginAllowed(requestHost, allowedOrigins)) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this origin.", 403);
  }
}
