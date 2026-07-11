import type { NextRequest } from "next/server";
import type { HttpApiTriggerConfig } from "@/shared/orchestrationTypes";
import {
  constantTimeCompareHex,
  constantTimeHashCompare,
  decryptSecret,
  decodeJwt,
  signHmacSha256,
  verifyHs256Jwt,
} from "./security";

function parseBearerToken(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (!normalized.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return normalized.slice(7).trim();
}

function parseBasicCredentials(value: string | null): { username: string; password: string } | null {
  if (!value || !value.toLowerCase().startsWith("basic ")) {
    return null;
  }

  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) {
      return null;
    }
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

function matchesIpAllowlist(clientIp: string | null, ipAllowlist: string[]): boolean {
  if (!ipAllowlist.length) {
    return true;
  }

  if (!clientIp) {
    return false;
  }

  return ipAllowlist.some((allowed) => allowed.trim() === clientIp);
}

export type AuthResult = {
  ok: boolean;
  status: number;
  code: string;
  message?: string;
  principal?: string | null;
  authType?: string;
};

export function authenticateHttpTriggerRequest(input: {
  request: NextRequest;
  config: HttpApiTriggerConfig;
  clientIp: string | null;
  bodyText: string;
}): AuthResult {
  const { request, config, clientIp, bodyText } = input;

  if (!matchesIpAllowlist(clientIp, config.ipAllowlist || [])) {
    return {
      ok: false,
      status: 403,
      code: "IP_NOT_ALLOWED",
      message: "Caller IP is not allowlisted",
    };
  }

  const authType = config.auth?.type || "none";

  if (authType === "none") {
    return { ok: true, status: 200, code: "AUTHENTICATED", principal: null, authType };
  }

  if (authType === "api_key") {
    const headerName = (config.auth.headerName || "x-api-key").toLowerCase();
    const provided = request.headers.get(headerName);

    if (!provided) {
      return { ok: false, status: 401, code: "MISSING_API_KEY", message: "API key is required" };
    }

    const credential = (config.auth.credentials || []).find((item) => item.isActive && constantTimeHashCompare(provided, item.secretHash));

    if (!credential) {
      return { ok: false, status: 401, code: "INVALID_API_KEY", message: "Invalid API key" };
    }

    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      principal: `apiKey:${credential.id}`,
      authType,
    };
  }

  if (authType === "basic") {
    const parsed = parseBasicCredentials(request.headers.get("authorization"));
    if (!parsed) {
      return { ok: false, status: 401, code: "MISSING_BASIC_AUTH", message: "Basic auth credentials are required" };
    }

    const credential = (config.auth.credentials || []).find((item) => {
      if (!item.isActive) return false;
      if (item.username !== parsed.username) return false;
      return constantTimeHashCompare(parsed.password, item.passwordHash);
    });

    if (!credential) {
      return { ok: false, status: 401, code: "INVALID_BASIC_AUTH", message: "Invalid username or password" };
    }

    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      principal: `basic:${credential.username}`,
      authType,
    };
  }

  if (authType === "oauth2_jwt") {
    const jwtConfig = config.auth.jwt;
    const token = parseBearerToken(request.headers.get(jwtConfig.headerName || "authorization"));
    if (!token) {
      return { ok: false, status: 401, code: "MISSING_BEARER_TOKEN", message: "Bearer token is required" };
    }

    const decoded = decodeJwt(token);
    if (!decoded.valid || !decoded.payload) {
      return { ok: false, status: 401, code: "INVALID_JWT", message: "JWT token is malformed" };
    }

    const payload = decoded.payload;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const skew = Number(jwtConfig.clockSkewSeconds || 60);

    const exp = Number(payload.exp);
    if (Number.isFinite(exp) && nowSeconds > exp + skew) {
      return { ok: false, status: 401, code: "JWT_EXPIRED", message: "JWT has expired" };
    }

    if (jwtConfig.issuer && payload.iss !== jwtConfig.issuer) {
      return { ok: false, status: 403, code: "JWT_ISSUER_MISMATCH", message: "JWT issuer is not allowed" };
    }

    if (jwtConfig.audience && payload.aud !== jwtConfig.audience) {
      return { ok: false, status: 403, code: "JWT_AUDIENCE_MISMATCH", message: "JWT audience is not allowed" };
    }

    if (jwtConfig.sharedSecretHash) {
      const sharedSecret = decryptSecret(jwtConfig.sharedSecretEnc || "");
      if (!sharedSecret || !constantTimeHashCompare(sharedSecret, jwtConfig.sharedSecretHash)) {
        return { ok: false, status: 401, code: "JWT_SHARED_SECRET_MISSING", message: "JWT shared secret is missing or invalid" };
      }

      if (!verifyHs256Jwt(token, sharedSecret)) {
        return { ok: false, status: 401, code: "JWT_SIGNATURE_INVALID", message: "JWT signature validation failed" };
      }
    }

    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      principal: typeof payload.sub === "string" ? payload.sub : "jwt:anonymous",
      authType,
    };
  }

  if (authType === "hmac") {
    const hmacConfig = config.auth.hmac;
    const keyId = request.headers.get(hmacConfig.keyIdHeader.toLowerCase());
    const signature = request.headers.get(hmacConfig.signatureHeader.toLowerCase());
    const timestamp = request.headers.get(hmacConfig.timestampHeader.toLowerCase());
    const nonce = request.headers.get(hmacConfig.nonceHeader.toLowerCase());

    if (!keyId || !signature || !timestamp || !nonce) {
      return { ok: false, status: 401, code: "MISSING_HMAC_HEADERS", message: "HMAC authentication headers are required" };
    }

    const credential = (hmacConfig.credentials || []).find((item) => item.isActive && item.keyId === keyId);
    if (!credential) {
      return { ok: false, status: 401, code: "INVALID_HMAC_KEY", message: "Unknown HMAC key id" };
    }

    const rawSecret = decryptSecret(credential.secretEnc || "");
    if (!rawSecret || !constantTimeHashCompare(rawSecret, credential.secretHash)) {
      return { ok: false, status: 401, code: "INVALID_HMAC_SECRET", message: "Stored HMAC secret is invalid" };
    }

    const payload = [request.method.toUpperCase(), request.nextUrl.pathname, request.nextUrl.search, timestamp, nonce, bodyText].join("\n");
    const expectedSignature = signHmacSha256(payload, rawSecret);

    if (!constantTimeCompareHex(expectedSignature, signature)) {
      return { ok: false, status: 401, code: "INVALID_HMAC_SIGNATURE", message: "HMAC signature verification failed" };
    }

    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      principal: `hmac:${keyId}`,
      authType,
    };
  }

  if (authType === "m_tls") {
    const certSubject = request.headers.get("x-client-cert-subject");
    const required = config.auth.mutualTls.required;
    const allowlist = config.auth.mutualTls.subjectAllowlist || [];

    if (required && !certSubject) {
      return { ok: false, status: 401, code: "CLIENT_CERT_REQUIRED", message: "Mutual TLS certificate is required" };
    }

    if (certSubject && allowlist.length > 0 && !allowlist.includes(certSubject)) {
      return { ok: false, status: 403, code: "CLIENT_CERT_FORBIDDEN", message: "Client certificate subject is not allowed" };
    }

    return {
      ok: true,
      status: 200,
      code: "AUTHENTICATED",
      principal: certSubject || "m_tls:anonymous",
      authType,
    };
  }

  return {
    ok: false,
    status: 401,
    code: "UNSUPPORTED_AUTH_TYPE",
    message: "Authentication mode is not supported",
  };
}
