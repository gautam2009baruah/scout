// Generic API Call node executor
// Calls external HTTP APIs and exposes response details to downstream nodes.

import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { request as httpsRequest } from "node:https";
import type { ApiCallNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";

type ExecutionResult = {
  success: boolean;
  statusCode?: number;
  responseHeaders?: Record<string, string>;
  rawResponse?: string;
  parsedJson?: unknown;
  responseBody?: unknown;
  durationMs: number;
  attempts: number;
  output?: Record<string, unknown>;
  error?: string;
  errorDetails?: Record<string, unknown>;
};

type PreparedRequest = {
  method: ApiCallNodeConfig["method"];
  url: URL;
  headers: Headers;
  body?: BodyInit;
  bodyForMtls?: Buffer;
  maskedLog: {
    url: string;
    method: string;
    headers: Record<string, string>;
    bodyPreview: string | null;
  };
};

export async function executeApiCallNode(
  config: ApiCallNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  const retries = clampInt(config.retryAttempts ?? 0, 0, 10);
  const maxAttempts = retries + 1;
  let last: ExecutionResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const startedAt = Date.now();
    try {
      const prepared = await prepareRequest(config, context);

      console.info("[ApiCallNode] Request prepared", {
        attempt,
        maxAttempts,
        method: prepared.maskedLog.method,
        url: prepared.maskedLog.url,
        headers: prepared.maskedLog.headers,
        bodyPreview: prepared.maskedLog.bodyPreview,
      });

      const response = await executeRequest(prepared, config, context);
      const durationMs = Date.now() - startedAt;

      const successStatus = parseSuccessStatusCodes(config.successStatusCodes);
      const statusOk = isSuccessStatus(response.statusCode, successStatus);

      const mappedFields = buildMappedResponseFields(
        response.parsedJson ?? response.responseBody,
        config
      );

      const outputBase: Record<string, unknown> = {
        requestMethod: prepared.method,
        requestUrl: prepared.url.toString(),
        httpStatusCode: response.statusCode,
        responseHeaders: response.responseHeaders,
        responseBody: response.responseBody,
        parsedJson: response.parsedJson,
        rawResponse: response.rawResponse,
        executionDurationMs: durationMs,
        attempts: attempt,
      };

      const outputVariableName = sanitizeOutputVariableName(config.outputVariableName || "apiResult");
      const output: Record<string, unknown> = {
        ...outputBase,
        mappedFields,
        [outputVariableName]: {
          ...outputBase,
          mappedFields,
        },
      };

      if (statusOk) {
        return { success: true, output };
      }

      const non2xxMessage = `API returned status ${response.statusCode}, expected ${config.successStatusCodes || "2xx"}`;
      const failure: ExecutionResult = {
        success: false,
        statusCode: response.statusCode,
        responseHeaders: response.responseHeaders,
        rawResponse: response.rawResponse,
        parsedJson: response.parsedJson,
        responseBody: response.responseBody,
        durationMs,
        attempts: attempt,
        output,
        error: non2xxMessage,
        errorDetails: {
          kind: "http_status",
          expected: config.successStatusCodes || "2xx",
          received: response.statusCode,
        },
      };

      if (isRetryableStatus(response.statusCode) && attempt < maxAttempts) {
        await backoff(config.retryDelayMs ?? 1000, attempt);
        last = failure;
        continue;
      }

      return finalizeFailure(config, failure);
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const normalized = normalizeError(error, config.timeout ?? 30000);

      const failure: ExecutionResult = {
        success: false,
        durationMs,
        attempts: attempt,
        error: errorMessage,
        errorDetails: normalized,
      };

      console.error("[ApiCallNode] Request failed", {
        attempt,
        maxAttempts,
        error: errorMessage,
        details: normalized,
      });

      if (normalized.retryable && attempt < maxAttempts) {
        await backoff(config.retryDelayMs ?? 1000, attempt);
        last = failure;
        continue;
      }

      return finalizeFailure(config, failure);
    }
  }

  return finalizeFailure(
    config,
    last || {
      success: false,
      durationMs: 0,
      attempts: maxAttempts,
      error: "Max retry attempts reached",
      errorDetails: { kind: "retry_exhausted", retryable: false },
    }
  );
}

async function prepareRequest(
  config: ApiCallNodeConfig,
  context: Record<string, unknown>
): Promise<PreparedRequest> {
  const method = (config.method || "POST") as ApiCallNodeConfig["method"];
  const rawUrl = interpolateString(config.apiUrl, context);
  if (!rawUrl) {
    throw new Error("API URL is required");
  }

  const urlWithPath = applyPathVariables(rawUrl, config.pathVariables, context);
  const url = new URL(urlWithPath);
  applyQueryParameters(url, config.queryParameters, context);

  const headers = buildHeaders(config, context);
  applyAuthentication(config, headers, url, context);

  const bodyFormat =
    config.bodyFormat || (method === "GET" || method === "HEAD" || method === "OPTIONS" ? "none" : "json");

  const { body, bodyForMtls, bodyPreview } = await buildBody(
    bodyFormat,
    config,
    context,
    headers,
    method
  );

  return {
    method,
    url,
    headers,
    body,
    bodyForMtls,
    maskedLog: {
      method,
      url: url.toString(),
      headers: maskHeaderRecord(Object.fromEntries(headers.entries())),
      bodyPreview,
    },
  };
}

function buildHeaders(config: ApiCallNodeConfig, context: Record<string, unknown>): Headers {
  const headers = new Headers();

  if (Array.isArray(config.headers)) {
    for (const header of config.headers) {
      if (header?.enabled === false) continue;
      const key = String(header?.key || "").trim();
      if (!key) continue;
      headers.set(key, interpolateString(header.value || "", context));
    }
  } else if (config.headers && typeof config.headers === "object") {
    for (const [key, value] of Object.entries(config.headers)) {
      const name = String(key || "").trim();
      if (!name) continue;
      headers.set(name, interpolateString(String(value), context));
    }
  }

  return headers;
}

function applyAuthentication(
  config: ApiCallNodeConfig,
  headers: Headers,
  url: URL,
  context: Record<string, unknown>
): void {
  const auth = config.auth || { type: "none" };

  if (auth.type === "none") {
    return;
  }

  if (auth.type === "api_key") {
    const location = auth.apiKey?.location || "header";
    const name = auth.apiKey?.name || auth.headerName || "X-API-Key";
    const value = interpolateString(auth.apiKey?.value || auth.value || "", context);

    if (!name || !value) {
      throw new Error("API key auth requires both key name and value");
    }

    if (location === "query") {
      url.searchParams.set(name, value);
    } else {
      headers.set(name, value);
    }
    return;
  }

  if (auth.type === "bearer") {
    const token = interpolateString(auth.bearerToken || auth.token || "", context);
    if (!token) {
      throw new Error("Bearer auth requires a token");
    }
    headers.set("Authorization", `Bearer ${token}`);
    return;
  }

  if (auth.type === "basic") {
    const username = interpolateString(auth.basic?.username || auth.username || "", context);
    const password = interpolateString(auth.basic?.password || auth.password || "", context);
    if (!username) {
      throw new Error("Basic auth requires username");
    }
    const creds = Buffer.from(`${username}:${password}`).toString("base64");
    headers.set("Authorization", `Basic ${creds}`);
    return;
  }

  if (auth.type === "custom_headers") {
    for (const header of auth.customHeaders || []) {
      const key = String(header.key || "").trim();
      if (!key) continue;
      headers.set(key, interpolateString(header.value || "", context));
    }
    return;
  }

  if (auth.type === "oauth2") {
    throw new Error("OAuth2 token should be resolved before request execution");
  }
}

async function buildBody(
  bodyFormat: NonNullable<ApiCallNodeConfig["bodyFormat"]>,
  config: ApiCallNodeConfig,
  context: Record<string, unknown>,
  headers: Headers,
  method: ApiCallNodeConfig["method"]
): Promise<{ body?: BodyInit; bodyForMtls?: Buffer; bodyPreview: string | null }> {
  if (method === "GET" || method === "HEAD" || method === "OPTIONS" || bodyFormat === "none") {
    return { body: undefined, bodyForMtls: undefined, bodyPreview: null };
  }

  if (bodyFormat === "json") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const evaluated = evaluateExpression(config.requestBodyTemplate || "{}", context);
    const payload =
      typeof evaluated === "string" ? normalizeMaybeJsonString(evaluated) : JSON.stringify(evaluated);
    return {
      body: payload,
      bodyForMtls: Buffer.from(payload, "utf8"),
      bodyPreview: truncate(payload, 1000),
    };
  }

  if (bodyFormat === "raw_text") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "text/plain");
    }
    const payload = interpolateString(config.requestBodyTemplate || "", context);
    return {
      body: payload,
      bodyForMtls: Buffer.from(payload, "utf8"),
      bodyPreview: truncate(payload, 1000),
    };
  }

  if (bodyFormat === "xml") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/xml");
    }
    const payload = interpolateString(config.requestBodyTemplate || "", context);
    return {
      body: payload,
      bodyForMtls: Buffer.from(payload, "utf8"),
      bodyPreview: truncate(payload, 1000),
    };
  }

  if (bodyFormat === "url_encoded") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/x-www-form-urlencoded");
    }
    const search = new URLSearchParams();
    for (const item of config.urlEncodedFields || []) {
      if (item?.enabled === false) continue;
      const key = String(item.key || "").trim();
      if (!key) continue;
      search.append(key, interpolateString(item.value || "", context));
    }
    const payload = search.toString();
    return {
      body: payload,
      bodyForMtls: Buffer.from(payload, "utf8"),
      bodyPreview: truncate(payload, 1000),
    };
  }

  if (bodyFormat === "binary") {
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/octet-stream");
    }
    const b64 = interpolateString(config.binaryBodyBase64 || config.requestBodyTemplate || "", context);
    if (!b64) {
      throw new Error("Binary body format requires binaryBodyBase64 or requestBodyTemplate");
    }
    const bytes = Buffer.from(b64, "base64");
    return {
      body: new Uint8Array(bytes),
      bodyForMtls: bytes,
      bodyPreview: `[binary payload: ${bytes.length} bytes]`,
    };
  }

  // form_data
  const form = new FormData();

  for (const item of config.formDataFields || []) {
    if (item?.enabled === false) continue;
    const key = String(item.key || "").trim();
    if (!key) continue;

    if (item.isFile) {
      const filePath = interpolateString(item.filePath || "", context);
      if (!filePath) {
        throw new Error(`Form-data file field '${key}' requires filePath`);
      }
      const file = await readFile(filePath);
      const fileName = interpolateString(item.fileName || basename(filePath), context);
      const blob = new Blob([file], {
        type: interpolateString(item.contentType || "", context) || "application/octet-stream",
      });
      form.append(key, blob, fileName);
    } else {
      form.append(key, interpolateString(item.value || "", context));
    }
  }

  for (const fileUpload of config.fileUploads || []) {
    if (fileUpload?.enabled === false) continue;
    const fieldName = String(fileUpload.fieldName || "").trim();
    if (!fieldName) continue;
    const filePath = interpolateString(fileUpload.filePath || "", context);
    if (!filePath) continue;

    const file = await readFile(filePath);
    const fileName = interpolateString(fileUpload.fileName || basename(filePath), context);
    const blob = new Blob([file], {
      type: interpolateString(fileUpload.contentType || "", context) || "application/octet-stream",
    });
    form.append(fieldName, blob, fileName);
  }

  headers.delete("Content-Type");
  return {
    body: form,
    bodyForMtls: undefined,
    bodyPreview: "[multipart/form-data payload]",
  };
}

async function executeRequest(
  prepared: PreparedRequest,
  config: ApiCallNodeConfig,
  context: Record<string, unknown>
): Promise<{
  statusCode: number;
  responseHeaders: Record<string, string>;
  rawResponse: string;
  parsedJson?: unknown;
  responseBody: unknown;
}> {
  const auth = config.auth || { type: "none" };

  if (auth.type === "oauth2") {
    const token = await resolveOAuth2Token(auth, context);
    prepared.headers.set("Authorization", `Bearer ${token}`);
  }

  if (auth.mtls?.enabled) {
    return await executeMtlsRequest(prepared, auth.mtls, config.timeout ?? 30000);
  }

  const controller = new AbortController();
  const timeout = clampInt(config.timeout ?? 30000, 100, 300000);
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(prepared.url, {
      method: prepared.method,
      headers: prepared.headers,
      body: prepared.body,
      signal: controller.signal,
    });

    const rawResponse = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const parsedJson = tryParseJson(rawResponse, response.headers.get("content-type") || "");

    return {
      statusCode: response.status,
      responseHeaders,
      rawResponse,
      parsedJson,
      responseBody: parsedJson ?? rawResponse,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function executeMtlsRequest(
  prepared: PreparedRequest,
  mtls: NonNullable<NonNullable<ApiCallNodeConfig["auth"]>["mtls"]>,
  timeout: number
): Promise<{
  statusCode: number;
  responseHeaders: Record<string, string>;
  rawResponse: string;
  parsedJson?: unknown;
  responseBody: unknown;
}> {
  const certPath = String(mtls.certPath || "").trim();
  const keyPath = String(mtls.keyPath || "").trim();

  if (!certPath || !keyPath) {
    throw new Error("mTLS is enabled but certPath/keyPath are not configured");
  }

  const cert = await readFile(certPath);
  const key = await readFile(keyPath);
  const ca = mtls.caPath ? await readFile(String(mtls.caPath)) : undefined;

  const requestBody = prepared.bodyForMtls;

  const response = await new Promise<{
    statusCode: number;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>((resolve, reject) => {
    const req = httpsRequest(
      prepared.url,
      {
        method: prepared.method,
        headers: Object.fromEntries(prepared.headers.entries()),
        cert,
        key,
        ca,
        passphrase: mtls.passphrase,
        timeout,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy(new Error(`API request timeout (${timeout}ms)`));
    });

    if (requestBody) {
      req.write(requestBody);
    }

    req.end();
  });

  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (Array.isArray(value)) {
      normalizedHeaders[key] = value.join(", ");
    } else if (value != null) {
      normalizedHeaders[key] = String(value);
    }
  }

  const parsedJson = tryParseJson(response.body, normalizedHeaders["content-type"] || "");

  return {
    statusCode: response.statusCode,
    responseHeaders: normalizedHeaders,
    rawResponse: response.body,
    parsedJson,
    responseBody: parsedJson ?? response.body,
  };
}

async function resolveOAuth2Token(
  auth: NonNullable<ApiCallNodeConfig["auth"]>,
  context: Record<string, unknown>
): Promise<string> {
  const oauth = auth.oauth2 || {};
  const directToken = interpolateString(oauth.accessToken || "", context);
  if (directToken) return directToken;

  const tokenUrl = interpolateString(oauth.tokenUrl || "", context);
  if (!tokenUrl) {
    throw new Error("OAuth2 requires accessToken or tokenUrl");
  }

  const clientId = interpolateString(oauth.clientId || "", context);
  const clientSecret = interpolateString(oauth.clientSecret || "", context);
  if (!clientId || !clientSecret) {
    throw new Error("OAuth2 token request requires clientId and clientSecret");
  }

  const grantType = oauth.grantType || "client_credentials";
  const scope = interpolateString(oauth.scope || "", context);
  const audience = interpolateString(oauth.audience || "", context);

  const params = new URLSearchParams();
  params.set("grant_type", grantType);
  if (scope) params.set("scope", scope);
  if (audience) params.set("audience", audience);

  if (grantType === "password") {
    const username = interpolateString(oauth.username || "", context);
    const password = interpolateString(oauth.password || "", context);
    if (!username || !password) {
      throw new Error("OAuth2 password grant requires username and password");
    }
    params.set("username", username);
    params.set("password", password);
  }

  const headers = new Headers({ "Content-Type": "application/x-www-form-urlencoded" });
  if ((oauth.authStyle || "basic") === "basic") {
    const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    headers.set("Authorization", `Basic ${creds}`);
  } else {
    params.set("client_id", clientId);
    params.set("client_secret", clientSecret);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: params.toString(),
  });

  const text = await response.text();
  const json = tryParseJson(text, response.headers.get("content-type") || "");

  if (!response.ok) {
    throw new Error(
      `OAuth2 token request failed (${response.status}): ${typeof json === "object" && json ? JSON.stringify(json) : text}`
    );
  }

  const token = typeof json === "object" && json ? (json as any).access_token : undefined;
  if (!token) {
    throw new Error("OAuth2 token response did not contain access_token");
  }

  return String(token);
}

function finalizeFailure(
  config: ApiCallNodeConfig,
  failure: ExecutionResult
): { success: boolean; output?: Record<string, unknown>; error?: string } {
  const priorOutput = failure.output || {};
  const payload = {
    ...priorOutput,
    apiCallFailed: true,
    error: failure.error || "API call failed",
    errorDetails: failure.errorDetails || null,
    httpStatusCode: failure.statusCode || null,
    responseHeaders: failure.responseHeaders || {},
    responseBody: failure.responseBody ?? null,
    parsedJson: failure.parsedJson ?? null,
    rawResponse: failure.rawResponse ?? null,
    executionDurationMs: failure.durationMs,
    attempts: failure.attempts,
  };

  if (config.failureStrategy === "continue" || config.failureStrategy === "alert") {
    if (config.failureStrategy === "alert") {
      console.warn("[ApiCallNode] Failure strategy alert", payload);
    }
    return { success: true, output: payload };
  }

  return { success: false, error: failure.error || "API call failed" };
}

function applyPathVariables(
  apiUrl: string,
  pathVariables: ApiCallNodeConfig["pathVariables"],
  context: Record<string, unknown>
): string {
  let url = apiUrl;
  for (const item of pathVariables || []) {
    const name = String(item.name || "").trim();
    if (!name) continue;
    const value = encodeURIComponent(interpolateString(item.value || "", context));
    url = url.replaceAll(`{${name}}`, value).replaceAll(`:${name}`, value);
  }
  return url;
}

function applyQueryParameters(
  url: URL,
  queryParameters: ApiCallNodeConfig["queryParameters"],
  context: Record<string, unknown>
): void {
  for (const item of queryParameters || []) {
    if (item?.enabled === false) continue;
    const key = String(item.key || "").trim();
    if (!key) continue;
    url.searchParams.set(key, interpolateString(item.value || "", context));
  }
}

function normalizeMaybeJsonString(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "{}";
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return trimmed;
  }
  return JSON.stringify(value);
}

function buildMappedResponseFields(response: unknown, config: ApiCallNodeConfig): Record<string, unknown> {
  const mappingObj: Record<string, string> = {
    ...(config.responseMapping || {}),
  };

  for (const item of config.responseFieldMappings || []) {
    const key = String(item.outputKey || "").trim();
    const path = String(item.jsonPath || "").trim();
    if (key && path) {
      mappingObj[key] = path;
    }
  }

  const output: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(mappingObj)) {
    output[key] = extractValueByPath(response, path);
  }

  return output;
}

function extractValueByPath(input: unknown, path: string): unknown {
  if (!path) return undefined;

  const normalized = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  let current: any = input;
  for (const segment of normalized) {
    if (current == null) return undefined;
    current = current[segment];
  }

  return current;
}

function parseSuccessStatusCodes(input?: string): Array<{ from: number; to: number }> {
  if (!input || !input.trim()) {
    return [{ from: 200, to: 299 }];
  }

  const ranges: Array<{ from: number; to: number }> = [];
  for (const chunk of input.split(",")) {
    const token = chunk.trim();
    if (!token) continue;

    if (/^\dxx$/i.test(token)) {
      const base = Number(token[0]) * 100;
      ranges.push({ from: base, to: base + 99 });
      continue;
    }

    if (/^\d{3}-\d{3}$/.test(token)) {
      const [from, to] = token.split("-").map((v) => Number(v));
      ranges.push({ from: Math.min(from, to), to: Math.max(from, to) });
      continue;
    }

    if (/^\d{3}$/.test(token)) {
      const code = Number(token);
      ranges.push({ from: code, to: code });
    }
  }

  return ranges.length > 0 ? ranges : [{ from: 200, to: 299 }];
}

function isSuccessStatus(status: number, ranges: Array<{ from: number; to: number }>): boolean {
  return ranges.some((range) => status >= range.from && status <= range.to);
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function normalizeError(error: unknown, timeoutMs: number): Record<string, unknown> & { retryable: boolean } {
  const message = error instanceof Error ? error.message : String(error);
  const name = error instanceof Error ? error.name : "Error";

  if (name === "AbortError" || message.toLowerCase().includes("timeout")) {
    return {
      kind: "timeout",
      retryable: true,
      message: `API request timeout (${timeoutMs}ms)`,
    };
  }

  if (/401|403|unauthori|forbidden|invalid token|auth/i.test(message)) {
    return {
      kind: "authentication",
      retryable: false,
      message,
    };
  }

  if (/json|parse|unexpected token/i.test(message)) {
    return {
      kind: "invalid_response",
      retryable: false,
      message,
    };
  }

  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|network/i.test(message)) {
    return {
      kind: "network",
      retryable: true,
      message,
    };
  }

  return {
    kind: "request_error",
    retryable: false,
    message,
  };
}

function tryParseJson(payload: string, contentType: string): unknown | undefined {
  const looksJson = /application\/json|\+json/i.test(contentType);
  const trimmed = payload.trim();

  if (!trimmed) return undefined;
  if (!looksJson && !(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function interpolateString(template: string, context: Record<string, unknown>): string {
  const value = evaluateExpression(template || "", context);
  return value == null ? "" : String(value);
}

function sanitizeOutputVariableName(value: string): string {
  const cleaned = String(value || "apiResult").trim().replace(/[^a-zA-Z0-9_]/g, "_");
  return cleaned || "apiResult";
}

function clampInt(value: number, min: number, max: number): number {
  const n = Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, n));
}

async function backoff(baseDelayMs: number, attempt: number): Promise<void> {
  const delay = clampInt(baseDelayMs || 1000, 0, 120000) * Math.pow(2, Math.max(0, attempt - 1));
  await new Promise((resolve) => setTimeout(resolve, delay));
}

function truncate(value: string, max = 500): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function maskHeaderRecord(headers: Record<string, string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    output[key] = shouldMask(key) ? maskValue(value) : value;
  }
  return output;
}

function shouldMask(name: string): boolean {
  return /authorization|api[-_]?key|token|secret|password|x-signature/i.test(name);
}

function maskValue(value: string): string {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
