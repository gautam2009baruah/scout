import type {
  HttpApiAuthConfig,
  HttpApiBasicCredential,
  HttpApiHmacCredential,
  HttpApiTriggerConfig,
} from "@/shared/orchestrationTypes";
import {
  normalizeShortName,
  validateShortNameFormat,
  isShortNameInUse,
} from "./endpoint-resolution";
import { encryptSecret, hashSecret } from "./security";

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeMethods(value: unknown): HttpApiTriggerConfig["allowedMethods"] {
  const allowed = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;
  if (!Array.isArray(value) || value.length === 0) return ["POST"];

  const normalized = value
    .map((item) => String(item).toUpperCase())
    .filter((item) => (allowed as readonly string[]).includes(item));

  return (normalized.length ? normalized : ["POST"]) as HttpApiTriggerConfig["allowedMethods"];
}

function normalizeFieldRules(value: unknown): HttpApiTriggerConfig["headers"] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = item as Record<string, unknown>;
      const name = String(row.name || "").trim();
      if (!name) return null;
      return {
        name,
        required: toBoolean(row.required, false),
        pattern: row.pattern ? String(row.pattern) : undefined,
        description: row.description ? String(row.description) : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

function ensureHashedSecret(plainOrHash: unknown): string {
  const value = String(plainOrHash || "").trim();
  if (!value) return "";

  if (/^[a-f0-9]{64}$/i.test(value)) {
    return value.toLowerCase();
  }

  return hashSecret(value);
}

function normalizeApiKeyAuth(value: Record<string, unknown>): HttpApiAuthConfig {
  const credentials = Array.isArray(value.credentials) ? value.credentials : [];

  return {
    type: "api_key",
    headerName: String(value.headerName || "x-api-key"),
    credentials: credentials
      .map((item) => {
        const row = item as Record<string, unknown>;
        const id = String(row.id || "").trim();
        const secretHash = ensureHashedSecret(row.secretHash || row.secret || row.value);

        if (!id || !secretHash) return null;
        return {
          id,
          label: String(row.label || id),
          secretHash,
          isActive: toBoolean(row.isActive, true),
          createdAt: row.createdAt ? String(row.createdAt) : undefined,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null),
  };
}

function normalizeBasicAuth(value: Record<string, unknown>): HttpApiAuthConfig {
  const credentials = Array.isArray(value.credentials) ? value.credentials : [];

  return {
    type: "basic",
    credentials: credentials
      .map((item) => {
        const row = item as Record<string, unknown>;
        const id = String(row.id || "").trim();
        const username = String(row.username || "").trim();
        const passwordHash = ensureHashedSecret(row.passwordHash || row.password);

        if (!id || !username || !passwordHash) return null;

        const credential: HttpApiBasicCredential = {
          id,
          username,
          passwordHash,
          isActive: toBoolean(row.isActive, true),
          createdAt: row.createdAt ? String(row.createdAt) : undefined,
        };

        return credential;
      })
      .filter((item): item is HttpApiBasicCredential => item !== null),
  };
}

function normalizeJwtAuth(value: Record<string, unknown>): HttpApiAuthConfig {
  const jwtRaw = (value.jwt || {}) as Record<string, unknown>;
  const sharedSecretRaw = String(jwtRaw.sharedSecret || "").trim();
  const existingEncrypted = String(jwtRaw.sharedSecretEnc || "").trim();
  const sharedSecretEnc = sharedSecretRaw
    ? encryptSecret(sharedSecretRaw)
    : existingEncrypted || undefined;

  const sharedSecretHash = sharedSecretRaw
    ? ensureHashedSecret(sharedSecretRaw)
    : jwtRaw.sharedSecretHash
      ? ensureHashedSecret(jwtRaw.sharedSecretHash)
      : undefined;

  return {
    type: "oauth2_jwt",
    jwt: {
      headerName: String(jwtRaw.headerName || "authorization"),
      issuer: jwtRaw.issuer ? String(jwtRaw.issuer) : undefined,
      audience: jwtRaw.audience ? String(jwtRaw.audience) : undefined,
      sharedSecretHash,
      sharedSecretEnc,
      clockSkewSeconds: toNumber(jwtRaw.clockSkewSeconds, 60),
    },
  };
}

function normalizeHmacAuth(value: Record<string, unknown>): HttpApiAuthConfig {
  const hmacRaw = (value.hmac || {}) as Record<string, unknown>;
  const credentials = Array.isArray(hmacRaw.credentials) ? hmacRaw.credentials : [];

  return {
    type: "hmac",
    hmac: {
      keyIdHeader: String(hmacRaw.keyIdHeader || "x-hmac-key-id"),
      signatureHeader: String(hmacRaw.signatureHeader || "x-hmac-signature"),
      timestampHeader: String(hmacRaw.timestampHeader || "x-signature-timestamp"),
      nonceHeader: String(hmacRaw.nonceHeader || "x-signature-nonce"),
      algorithm: "sha256",
      credentials: credentials
        .map((item) => {
          const row = item as Record<string, unknown>;
          const keyId = String(row.keyId || "").trim();
          const secretRaw = String(row.secret || "").trim();
          const secretEncRaw = String(row.secretEnc || "").trim();
          const secretHash = ensureHashedSecret(row.secretHash || row.secret);
          const secretEnc = secretRaw ? encryptSecret(secretRaw) : secretEncRaw || undefined;

          if (!keyId || !secretHash || !secretEnc) return null;

          const credential: HttpApiHmacCredential = {
            keyId,
            secretHash,
            secretEnc,
            isActive: toBoolean(row.isActive, true),
            createdAt: row.createdAt ? String(row.createdAt) : undefined,
          };

          return credential;
        })
        .filter((item): item is HttpApiHmacCredential => item !== null),
    },
  };
}

function normalizeMutualTlsAuth(value: Record<string, unknown>): HttpApiAuthConfig {
  const mutualTls = (value.mutualTls || {}) as Record<string, unknown>;
  const subjectAllowlist = Array.isArray(mutualTls.subjectAllowlist)
    ? mutualTls.subjectAllowlist.map((v) => String(v).trim()).filter(Boolean)
    : [];

  return {
    type: "m_tls",
    mutualTls: {
      required: toBoolean(mutualTls.required, true),
      subjectAllowlist,
    },
  };
}

export function normalizeHttpApiAuth(value: unknown): HttpApiAuthConfig {
  const auth = (value || {}) as Record<string, unknown>;
  const type = String(auth.type || "none");

  if (type === "api_key") return normalizeApiKeyAuth(auth);
  if (type === "basic") return normalizeBasicAuth(auth);
  if (type === "oauth2_jwt") return normalizeJwtAuth(auth);
  if (type === "hmac") return normalizeHmacAuth(auth);
  if (type === "m_tls") return normalizeMutualTlsAuth(auth);

  return { type: "none" };
}

export async function buildHttpApiTriggerConfig(raw: Record<string, unknown>, orchestrationId?: string): Promise<HttpApiTriggerConfig> {
  const shortName = normalizeShortName(String(raw.shortName || ""));
  const shortNameErrors = validateShortNameFormat(shortName);
  if (shortNameErrors.length > 0) {
    throw new Error(shortNameErrors.join(", "));
  }

  const duplicate = await isShortNameInUse(shortName, orchestrationId);
  if (duplicate) {
    throw new Error("Short name already in use by another orchestration");
  }

  const auth = normalizeHttpApiAuth(raw.auth);

  return {
    type: "http_api",
    shortName,
    allowedMethods: normalizeMethods(raw.allowedMethods),
    allowedContentTypes: Array.isArray(raw.allowedContentTypes)
      ? raw.allowedContentTypes.map((v) => String(v).toLowerCase().trim()).filter(Boolean)
      : ["application/json"],
    maxPayloadBytes: Math.max(1024, toNumber(raw.maxPayloadBytes, 1024 * 1024)),
    requireBody: toBoolean(raw.requireBody, false),
    headers: normalizeFieldRules(raw.headers),
    queryParameters: normalizeFieldRules(raw.queryParameters),
    pathParameters: normalizeFieldRules(raw.pathParameters),
    auth,
    ipAllowlist: Array.isArray(raw.ipAllowlist)
      ? raw.ipAllowlist.map((v) => String(v).trim()).filter(Boolean)
      : [],
    rateLimit: {
      enabled: toBoolean((raw.rateLimit as Record<string, unknown>)?.enabled, true),
      maxRequests: Math.max(1, toNumber((raw.rateLimit as Record<string, unknown>)?.maxRequests, 60)),
      windowSeconds: Math.max(1, toNumber((raw.rateLimit as Record<string, unknown>)?.windowSeconds, 60)),
      throttleDelayMs: Math.max(0, toNumber((raw.rateLimit as Record<string, unknown>)?.throttleDelayMs, 0)),
    },
    replayProtection: {
      enabled: auth.type === "none"
        ? false
        : toBoolean((raw.replayProtection as Record<string, unknown>)?.enabled, true),
      timestampHeader: String((raw.replayProtection as Record<string, unknown>)?.timestampHeader || "x-signature-timestamp"),
      nonceHeader: String((raw.replayProtection as Record<string, unknown>)?.nonceHeader || "x-signature-nonce"),
      maxAgeSeconds: Math.max(30, toNumber((raw.replayProtection as Record<string, unknown>)?.maxAgeSeconds, 300)),
    },
    enforceHttps: toBoolean(raw.enforceHttps, true),
    status: (String(raw.status || "active") === "suspended" || String(raw.status || "active") === "revoked")
      ? (String(raw.status) as "suspended" | "revoked")
      : "active",
  };
}
