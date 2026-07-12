import type { NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import type { HttpApiTriggerConfig, HttpMethod } from "@/shared/orchestrationTypes";
import { DEFAULT_ALLOWED_CONTENT_TYPES } from "./constants";
import { hashSecret } from "./security";

export type RequestValidationResult = {
  valid: boolean;
  status: number;
  code: string;
  message?: string;
  details?: Record<string, unknown>;
  headers: Record<string, string>;
  query: Record<string, string | string[]>;
  contentType: string | null;
  bodyText: string;
  bodyJson: unknown;
  payloadSize: number;
  pathParameters: Record<string, string>;
};

function parseHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return headers;
}

function parseQuery(url: URL): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  const grouped = new Map<string, string[]>();

  url.searchParams.forEach((value, key) => {
    const existing = grouped.get(key) || [];
    existing.push(value);
    grouped.set(key, existing);
  });

  grouped.forEach((values, key) => {
    query[key] = values.length === 1 ? values[0] : values;
  });

  return query;
}

function mapPathParameters(pathSegments: string[], config: HttpApiTriggerConfig): Record<string, string> {
  const mapped: Record<string, string> = {};
  const configured = config.pathParameters || [];

  for (let i = 0; i < configured.length; i += 1) {
    const param = configured[i];
    const value = pathSegments[i];
    if (value) {
      mapped[param.name] = decodeURIComponent(value);
    }
  }

  return mapped;
}

async function reserveReplayNonce(input: {
  triggerId: string;
  nonce: string;
  maxAgeSeconds: number;
}): Promise<boolean> {
  const pool = getPool();
  const nonceHash = hashSecret(input.nonce);

  const cleanupResult = await pool.query(
    `DELETE FROM api_trigger_request_nonces
     WHERE expires_at < now()`
  );
  void cleanupResult;

  const insert = await pool.query(
    `INSERT INTO api_trigger_request_nonces (trigger_id, nonce_hash, expires_at)
     VALUES ($1, $2, now() + ($3::text || ' seconds')::interval)
     ON CONFLICT (trigger_id, nonce_hash) DO NOTHING`,
    [input.triggerId, nonceHash, input.maxAgeSeconds]
  );

  return (insert.rowCount ?? 0) > 0;
}

export async function enforceRateLimit(input: {
  triggerId: string;
  clientKey: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<{ allowed: boolean; remaining: number }> {
  const pool = getPool();

  await pool.query(
    `DELETE FROM api_trigger_rate_limit_windows
     WHERE updated_at < now() - interval '1 day'`
  );

  const result = await pool.query<{ request_count: number }>(
    `INSERT INTO api_trigger_rate_limit_windows (trigger_id, client_key, window_start, request_count, updated_at)
     VALUES (
       $1,
       $2,
       to_timestamp(floor(extract(epoch from now()) / $3) * $3),
       1,
       now()
     )
     ON CONFLICT (trigger_id, client_key, window_start)
     DO UPDATE SET request_count = api_trigger_rate_limit_windows.request_count + 1, updated_at = now()
     RETURNING request_count`,
    [input.triggerId, input.clientKey, input.windowSeconds]
  );

  const count = result.rows[0]?.request_count || 0;
  return {
    allowed: count <= input.maxRequests,
    remaining: Math.max(0, input.maxRequests - count),
  };
}

export async function validateHttpRequest(
  request: NextRequest,
  pathSegments: string[],
  triggerId: string,
  config: HttpApiTriggerConfig
): Promise<RequestValidationResult> {
  const method = request.method.toUpperCase() as HttpMethod;
  const headers = parseHeaders(request);
  const query = parseQuery(request.nextUrl);
  const pathParameters = mapPathParameters(pathSegments, config);

  const allowedMethods = (config.allowedMethods?.length ? config.allowedMethods : ["POST"]).map((m) => m.toUpperCase());
  if (!allowedMethods.includes(method)) {
    return {
      valid: false,
      status: 400,
      code: "METHOD_NOT_ALLOWED",
      message: "HTTP method is not allowed for this trigger",
      headers,
      query,
      contentType: null,
      bodyText: "",
      bodyJson: null,
      payloadSize: 0,
      pathParameters,
    };
  }

  for (const rule of config.headers || []) {
    const current = headers[rule.name.toLowerCase()];
    if (rule.pattern && current) {
      try {
        const regex = new RegExp(rule.pattern);
        if (!regex.test(current)) {
          return {
            valid: false,
            status: 400,
            code: "HEADER_PATTERN_MISMATCH",
            message: `Header ${rule.name} has an invalid value`,
            headers,
            query,
            contentType: null,
            bodyText: "",
            bodyJson: null,
            payloadSize: 0,
            pathParameters,
          };
        }
      } catch {
        return {
          valid: false,
          status: 400,
          code: "INVALID_HEADER_PATTERN",
          message: `Header rule for ${rule.name} has an invalid regex`,
          headers,
          query,
          contentType: null,
          bodyText: "",
          bodyJson: null,
          payloadSize: 0,
          pathParameters,
        };
      }
    }
  }

  for (const rule of config.queryParameters || []) {
    const current = query[rule.name];
    if (current === undefined || current === "") continue;

    if (rule.pattern) {
      try {
        const regex = new RegExp(rule.pattern);
        const text = Array.isArray(current) ? current.join(",") : String(current);
        if (!regex.test(text)) {
          return {
            valid: false,
            status: 400,
            code: "QUERY_PATTERN_MISMATCH",
            message: `Query parameter ${rule.name} has an invalid value`,
            headers,
            query,
            contentType: null,
            bodyText: "",
            bodyJson: null,
            payloadSize: 0,
            pathParameters,
          };
        }
      } catch {
        return {
          valid: false,
          status: 400,
          code: "INVALID_QUERY_PATTERN",
          message: `Query rule for ${rule.name} has an invalid regex`,
          headers,
          query,
          contentType: null,
          bodyText: "",
          bodyJson: null,
          payloadSize: 0,
          pathParameters,
        };
      }
    }
  }

  for (let i = 0; i < (config.pathParameters || []).length; i += 1) {
    const rule = config.pathParameters[i];
    const current = pathParameters[rule.name];
    if (!current) continue;

    if (rule.pattern) {
      try {
        const regex = new RegExp(rule.pattern);
        if (!regex.test(current)) {
          return {
            valid: false,
            status: 400,
            code: "PATH_PATTERN_MISMATCH",
            message: `Path parameter ${rule.name} has an invalid value`,
            headers,
            query,
            contentType: null,
            bodyText: "",
            bodyJson: null,
            payloadSize: 0,
            pathParameters,
          };
        }
      } catch {
        return {
          valid: false,
          status: 400,
          code: "INVALID_PATH_PATTERN",
          message: `Path rule for ${rule.name} has an invalid regex`,
          headers,
          query,
          contentType: null,
          bodyText: "",
          bodyJson: null,
          payloadSize: 0,
          pathParameters,
        };
      }
    }
  }

  const contentTypeHeader = (request.headers.get("content-type") || "").split(";")[0]?.trim().toLowerCase();
  const contentType = contentTypeHeader || null;
  const allowedContentTypes = (config.allowedContentTypes?.length ? config.allowedContentTypes : [...DEFAULT_ALLOWED_CONTENT_TYPES]).map((v) => v.toLowerCase());

  if (contentType && !allowedContentTypes.includes(contentType)) {
    return {
      valid: false,
      status: 400,
      code: "UNSUPPORTED_CONTENT_TYPE",
      message: `Content-Type ${contentType} is not accepted`,
      headers,
      query,
      contentType,
      bodyText: "",
      bodyJson: null,
      payloadSize: 0,
      pathParameters,
    };
  }

  const bodyText = await request.text();
  const payloadSize = Buffer.byteLength(bodyText, "utf8");
  const maxPayloadBytes = Number(config.maxPayloadBytes || 1024 * 1024);

  if (payloadSize > maxPayloadBytes) {
    return {
      valid: false,
      status: 400,
      code: "PAYLOAD_TOO_LARGE",
      message: `Payload exceeds max size of ${maxPayloadBytes} bytes`,
      headers,
      query,
      contentType,
      bodyText,
      bodyJson: null,
      payloadSize,
      pathParameters,
    };
  }

  const methodsThatTypicallyUseBody = new Set(["POST", "PUT", "PATCH", "DELETE"]);
  if (config.requireBody && methodsThatTypicallyUseBody.has(method) && !bodyText) {
    return {
      valid: false,
      status: 400,
      code: "REQUEST_BODY_REQUIRED",
      message: "Request body is required for this trigger",
      headers,
      query,
      contentType,
      bodyText,
      bodyJson: null,
      payloadSize,
      pathParameters,
    };
  }

  let bodyJson: unknown = null;
  if (bodyText && contentType === "application/json") {
    try {
      bodyJson = JSON.parse(bodyText);
    } catch {
      return {
        valid: false,
        status: 400,
        code: "INVALID_JSON_BODY",
        message: "Request body is not valid JSON",
        headers,
        query,
        contentType,
        bodyText,
        bodyJson: null,
        payloadSize,
        pathParameters,
      };
    }
  }

  // "None" means callers can invoke the endpoint without security headers.
  // Replay protection is meaningful only alongside an authenticated request.
  if (config.auth.type !== "none" && config.replayProtection?.enabled) {
    const timestampHeader = config.replayProtection.timestampHeader || "x-signature-timestamp";
    const nonceHeader = config.replayProtection.nonceHeader || "x-signature-nonce";
    const rawTimestamp = headers[timestampHeader.toLowerCase()];
    const nonce = headers[nonceHeader.toLowerCase()];

    if (!rawTimestamp || !nonce) {
      return {
        valid: false,
        status: 400,
        code: "REPLAY_HEADERS_REQUIRED",
        message: "Replay protection headers are required",
        headers,
        query,
        contentType,
        bodyText,
        bodyJson,
        payloadSize,
        pathParameters,
      };
    }

    const sentAt = Number(rawTimestamp);
    if (!Number.isFinite(sentAt)) {
      return {
        valid: false,
        status: 400,
        code: "INVALID_SIGNATURE_TIMESTAMP",
        message: "Invalid replay timestamp header",
        headers,
        query,
        contentType,
        bodyText,
        bodyJson,
        payloadSize,
        pathParameters,
      };
    }

    const maxAgeSeconds = Number(config.replayProtection.maxAgeSeconds || 300);
    const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - sentAt);
    if (skewSeconds > maxAgeSeconds) {
      return {
        valid: false,
        status: 401,
        code: "REQUEST_EXPIRED",
        message: "Request timestamp is outside the allowed replay window",
        headers,
        query,
        contentType,
        bodyText,
        bodyJson,
        payloadSize,
        pathParameters,
      };
    }

    const nonceAccepted = await reserveReplayNonce({
      triggerId,
      nonce,
      maxAgeSeconds,
    });

    if (!nonceAccepted) {
      return {
        valid: false,
        status: 401,
        code: "REPLAY_DETECTED",
        message: "Request nonce has already been used",
        headers,
        query,
        contentType,
        bodyText,
        bodyJson,
        payloadSize,
        pathParameters,
      };
    }
  }

  return {
    valid: true,
    status: 200,
    code: "VALID",
    headers,
    query,
    contentType,
    bodyText,
    bodyJson,
    payloadSize,
    pathParameters,
  };
}
