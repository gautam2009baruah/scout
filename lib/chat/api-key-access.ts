import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";

export class ChatbotApiKeyAccessError extends Error {
  constructor(message: string, public readonly statusCode = 401) {
    super(message);
    this.name = "ChatbotApiKeyAccessError";
  }
}

type CachedKeyRecord = {
  companyId: string;
  targetAppId: string | null;
  allowedOrigins: string[];
  requiresGuid: boolean;
};

type CacheEntry = {
  record: CachedKeyRecord;
  expiresAt: number;
};

// Avoids re-querying chatbot_api_keys + chatbot_embed_packages on every chat
// message. Expiry is deliberately a single, operator-tunable knob (env var)
// rather than a revalidate-on-hit scheme — bump CHATBOT_EMBED_API_KEY_CACHE_TTL_MS
// to trade freshness for fewer DB round trips, or lower it after revoking a key
// to shrink the exposure window.
const keyCache = new Map<string, CacheEntry>();

function getCacheTtlMs() {
  const parsed = Number(process.env.CHATBOT_EMBED_API_KEY_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 5 * 60_000;
}

function isGuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
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

async function loadKeyRecord(apiKey: string, hashedKey: string): Promise<CachedKeyRecord | null> {
  const cached = keyCache.get(hashedKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.record;
  }

  const result = await getPool().query<{
    company_id: string;
    target_app_id: string | null;
    allowed_origins_json: string[] | null;
  }>(
    `
      SELECT
        cta.company_id,
        k.target_app_id,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json
      FROM chatbot_api_keys k
      INNER JOIN company_target_applications cta ON cta.id = k.target_app_id
      WHERE k.key_hash = $1
        AND k.status = 'active'
        AND k.is_active = true
        AND (k.expires_at IS NULL OR k.expires_at > now())
      LIMIT 1
    `,
    [hashedKey]
  );

  const row = result.rows[0];
  if (!row) {
    keyCache.delete(hashedKey);
    return null;
  }

  const requireGuidPolicy = await getPool().query<{ require_user_guid: boolean }>(
    `
      SELECT COALESCE(bool_or(p.require_user_guid), false) AS require_user_guid
      FROM chatbot_embed_packages p
      INNER JOIN company_target_applications cta ON cta.id = p.target_app_id
      WHERE cta.company_id = $1
        AND p.deleted_at IS NULL
        AND p.api_key_plaintext = $2
        AND ($3::uuid IS NULL OR p.target_app_id = $3)
    `,
    [row.company_id, apiKey, row.target_app_id]
  );

  const record: CachedKeyRecord = {
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    allowedOrigins: Array.isArray(row.allowed_origins_json) ? row.allowed_origins_json : [],
    requiresGuid: requireGuidPolicy.rows[0]?.require_user_guid === true,
  };

  keyCache.set(hashedKey, { record, expiresAt: Date.now() + getCacheTtlMs() });
  return record;
}

export async function assertChatbotApiKeyAccess(request: Request, input: { companyId?: string; targetAppId?: string; userId?: string }) {
  const apiKey = extractApiKey(request);
  if (!apiKey) {
    throw new ChatbotApiKeyAccessError("An API key is required.", 401);
  }

  const companyId = String(input.companyId || "").trim();
  const targetAppId = String(input.targetAppId || "").trim();
  if (!companyId && !targetAppId) {
    throw new ChatbotApiKeyAccessError("A target app or company is required for API key validation.", 400);
  }

  const record = await loadKeyRecord(apiKey, hashToken(apiKey));
  if (!record) {
    throw new ChatbotApiKeyAccessError("Invalid API key.", 401);
  }

  // chatbot_api_keys.target_app_id is NOT NULL, so every key is already bound
  // to exactly one target app (and therefore exactly one company). targetAppId
  // is the primary, sufficient proof of scope; companyId is only cross-checked
  // when the caller happens to supply one — it is never required on its own.
  if (targetAppId && record.targetAppId !== targetAppId) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this target app.", 403);
  }

  if (companyId && record.companyId !== companyId) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this company.", 403);
  }

  const requestHost = parseOriginHost(request);
  if (!isOriginAllowed(requestHost, record.allowedOrigins)) {
    throw new ChatbotApiKeyAccessError("API key is not allowed for this origin.", 403);
  }

  if (record.requiresGuid && !isGuid(String(input.userId || ""))) {
    throw new ChatbotApiKeyAccessError("A valid GUID userId is required for this API key.", 400);
  }
}
