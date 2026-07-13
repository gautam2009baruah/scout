import type { IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { getPool } from "@/lib/db/pool";

type AuthResult = {
  ok: boolean;
  error?: string;
  apiKeyId?: string;
  source?: "database" | "legacy";
};

type CacheValue = {
  id: string;
  companyId: string;
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

export class CompanyApiKeyAuthorizer {
  private readonly cache = new Map<string, CacheValue>();

  constructor(
    private readonly cacheTtlMs: number,
    private readonly legacyApiKey: string
  ) {}

  private getCached(hash: string): CacheValue | null {
    const found = this.cache.get(hash);
    if (!found) return null;
    if (Date.now() >= found.expiresAt) {
      this.cache.delete(hash);
      return null;
    }
    return found;
  }

  private setCached(hash: string, value: { id: string; companyId: string }) {
    this.cache.set(hash, {
      ...value,
      expiresAt: Date.now() + this.cacheTtlMs
    });
  }

  async authenticate(request: IncomingMessage, companyId: string): Promise<AuthResult> {
    const token = extractToken(request.headers);

    if (!token) {
      return { ok: false, error: "Missing API key." };
    }

    const hashed = hashToken(token);
    const cached = this.getCached(hashed);

    if (cached) {
      if (cached.companyId !== companyId) {
        return { ok: false, error: "API key is not allowed for this company." };
      }
      return { ok: true, apiKeyId: cached.id, source: "database" };
    }

    const result = await getPool().query<{ id: string; company_id: string }>(
      `
        SELECT id, company_id
        FROM chatbot_api_keys
        WHERE key_hash = $1
          AND is_active = true
          AND (expires_at IS NULL OR expires_at > now())
        LIMIT 1
      `,
      [hashed]
    );

    const row = result.rows[0];

    if (row) {
      this.setCached(hashed, { id: row.id, companyId: row.company_id });
      if (row.company_id !== companyId) {
        return { ok: false, error: "API key is not allowed for this company." };
      }
      return { ok: true, apiKeyId: row.id, source: "database" };
    }

    if (this.legacyApiKey && token === this.legacyApiKey) {
      return { ok: true, source: "legacy" };
    }

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
