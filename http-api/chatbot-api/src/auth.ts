import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";

type AuthResult = {
  ok: boolean;
  error?: string;
  apiKeyId?: string;
  environmentId?: string;
  source?: "database" | "legacy";
};

type CacheValue = {
  id: string;
  companyId: string;
  targetAppId: string | null;
  environmentId: string;
  allowedOrigins: string[];
  expiresAt: number;
};

export function extractToken(headers: IncomingMessage["headers"]) {
  const apiKeyHeader = headers["x-api-key"];
  if (typeof apiKeyHeader === "string" && apiKeyHeader.trim()) {
    return apiKeyHeader.trim();
  }

  const authHeader = headers.authorization;
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return "";
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function parseOriginFromRequest(request: IncomingMessage) {
  const rawOrigin = typeof request.headers.origin === "string" ? request.headers.origin.trim() : "";
  if (rawOrigin) {
    try {
      return new URL(rawOrigin).hostname.toLowerCase();
    } catch {
      return "";
    }
  }

  const referer = typeof request.headers.referer === "string" ? request.headers.referer.trim() : "";
  if (!referer) {
    return "";
  }

  try {
    return new URL(referer).hostname.toLowerCase();
  } catch {
    return "";
  }
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
    const suffix = rule.slice(1);
    return hostname.endsWith(suffix);
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

export class CompanyApiKeyAuthorizer {
  private readonly cache = new Map<string, CacheValue>();

  constructor(private readonly cacheTtlMs: number) {}

  private getCached(hash: string): CacheValue | null {
    const found = this.cache.get(hash);
    if (!found) return null;
    if (Date.now() >= found.expiresAt) {
      this.cache.delete(hash);
      return null;
    }
    return found;
  }

  private setCached(
    hash: string,
    value: {
      id: string;
      companyId: string;
      targetAppId: string | null;
      environmentId: string;
      allowedOrigins: string[];
    }
  ) {
    this.cache.set(hash, {
      ...value,
      expiresAt: Date.now() + this.cacheTtlMs
    });
  }

  private async isCachedKeyStillActive(apiKeyId: string): Promise<boolean> {
    const result = await getPool().query<{ id: string }>(
      `
        SELECT id
        FROM chatbot_api_keys
        WHERE id = $1
          AND status = 'active'
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `,
      [apiKeyId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async authenticate(
    request: IncomingMessage,
    companyId: string,
    requestedTargetAppId?: string | null
  ): Promise<AuthResult> {
    const token = extractToken(request.headers);

    if (!token) {
      return { ok: false, error: "Missing API key." };
    }

    const hashed = hashToken(token);
    const cached = this.getCached(hashed);

    if (cached) {
      const stillActive = await this.isCachedKeyStillActive(cached.id);
      if (!stillActive) {
        this.cache.delete(hashed);
        return { ok: false, error: "Invalid API key." };
      }

      if (cached.companyId !== companyId) {
        return { ok: false, error: "API key is not allowed for this company." };
      }

      if (cached.targetAppId) {
        if (!requestedTargetAppId) {
          return { ok: false, error: "API key is bound to a target app and requires targetAppName." };
        }

        if (cached.targetAppId !== requestedTargetAppId) {
          return { ok: false, error: "API key is not allowed for this target app." };
        }
      }

      const requestHost = parseOriginFromRequest(request);
      if (!isOriginAllowed(requestHost, cached.allowedOrigins)) {
        return { ok: false, error: "API key is not allowed for this origin." };
      }

      return { ok: true, apiKeyId: cached.id, environmentId: cached.environmentId, source: "database" };
    }

    const result = await getPool().query<{
      id: string;
      company_id: string;
      target_app_id: string | null;
      environment_id: string;
      allowed_origins_json: string[] | null;
    }>(
      `
        SELECT
          k.id,
          cta.company_id,
          k.target_app_id,
          k.environment_id,
          COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json
        FROM chatbot_api_keys k
        INNER JOIN company_target_applications cta ON cta.id = k.target_app_id
        INNER JOIN target_app_environments env ON env.id = k.environment_id AND env.target_app_id = k.target_app_id
        WHERE key_hash = $1
          AND status = 'active'
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `,
      [hashed]
    );

    const row = result.rows[0];

    if (row) {
      const allowedOrigins = Array.isArray(row.allowed_origins_json) ? row.allowed_origins_json : [];
      this.setCached(hashed, {
        id: row.id,
        companyId: row.company_id,
        targetAppId: row.target_app_id,
        environmentId: row.environment_id,
        allowedOrigins
      });
      if (row.company_id !== companyId) {
        return { ok: false, error: "API key is not allowed for this company." };
      }

      if (row.target_app_id) {
        if (!requestedTargetAppId) {
          return { ok: false, error: "API key is bound to a target app and requires targetAppName." };
        }

        if (row.target_app_id !== requestedTargetAppId) {
          return { ok: false, error: "API key is not allowed for this target app." };
        }
      }

      const requestHost = parseOriginFromRequest(request);
      if (!isOriginAllowed(requestHost, allowedOrigins)) {
        return { ok: false, error: "API key is not allowed for this origin." };
      }

      return { ok: true, apiKeyId: row.id, environmentId: row.environment_id, source: "database" };
    }

    // A shared legacy key has no company/target-app binding and therefore
    // cannot safely authorize a multi-tenant request.
    return { ok: false, error: "Invalid API key." };
  }
}

export function authenticateRequest(request: IncomingMessage, expectedApiKey: string): AuthResult {
  const token = extractToken(request.headers);

  if (!token) {
    return { ok: false, error: "Missing API key." };
  }

  if (token !== expectedApiKey) {
    return { ok: false, error: "Invalid API key." };
  }

  return { ok: true };
}
