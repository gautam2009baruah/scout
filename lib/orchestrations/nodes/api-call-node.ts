// API Call node executor
// Makes HTTP requests to external APIs with flexible configuration
// Supports various authentication types, payload templating, and response mapping

import type { ApiCallNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";

/**
 * Execute an external API call with flexible configuration
 * Supports GET, POST, PUT, PATCH, DELETE with auth and response mapping
 */
export async function executeApiCallNode(
  config: ApiCallNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  let attempt = 0;
  const maxAttempts = config.retryAttempts + 1;

  while (attempt < maxAttempts) {
    try {
      const result = await executeApiRequest(config, context);

      if (result.success) {
        return result;
      }

      // Determine if error is retryable
      const isRetryable =
        result.isRetryable &&
        attempt < maxAttempts - 1;

      if (isRetryable) {
        // Calculate backoff delay
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        console.log(
          `API call failed (attempt ${attempt + 1}/${maxAttempts}), retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      // Not retryable or max attempts reached
      return handleFailure(config, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      if (attempt < maxAttempts - 1) {
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        console.log(
          `API call error (attempt ${attempt + 1}/${maxAttempts}): ${errorMessage}, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      return handleFailure(config, {
        success: false,
        error: errorMessage,
        isRetryable: false,
      });
    }
  }

  return {
    success: false,
    error: "Max retry attempts reached",
  };
}

/**
 * Execute a single API request attempt
 */
async function executeApiRequest(
  config: ApiCallNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  isRetryable?: boolean;
  statusCode?: number;
  responseData?: any;
  responseHeaders?: Record<string, string>;
  error?: string;
}> {
  // Evaluate API URL (supports variable expressions)
  const apiUrl = evaluateExpression(config.apiUrl, context);

  if (!apiUrl) {
    throw new Error("API URL is required");
  }

  // Build request headers
  const headers = new Headers();

  // Add custom headers
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers)) {
      const evaluatedValue = evaluateExpression(String(value), context);
      headers.set(key, String(evaluatedValue));
    }
  }

  // Add authentication
  if (config.auth && config.auth.type !== "none") {
    const authHeader = buildAuthHeader(config.auth, context);
    if (authHeader) {
      const [headerName, headerValue] = authHeader;
      headers.set(headerName, headerValue);
    }
  }

  // Set default content-type if not set
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  // Build request body
  let body: string | undefined;
  if (config.requestBodyTemplate && config.method !== "GET") {
    const evaluatedBody = evaluateExpression(
      config.requestBodyTemplate,
      context
    );
    body = typeof evaluatedBody === "string" 
      ? evaluatedBody 
      : JSON.stringify(evaluatedBody);
  }

  // Log request details
  console.log(`\n${"█".repeat(80)}`);
  console.log("📡 API CALL NODE");
  console.log(`${"█".repeat(80)}`);
  console.log(`Method: ${config.method}`);
  console.log(`URL: ${apiUrl}`);
  console.log(`Headers: ${JSON.stringify(Object.fromEntries(headers), null, 2)}`);
  if (body) {
    console.log(`Body: ${body}`);
  }
  console.log(`${"█".repeat(80)}\n`);

  // Execute the request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(String(apiUrl), {
      method: config.method,
      headers,
      body,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Parse response
    let responseData: any;
    const contentType = response.headers.get("content-type");

    if (contentType?.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }

    // Convert headers to object
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    console.log(`\nAPI Response: ${response.status}`);
    console.log(`Response Data: ${JSON.stringify(responseData, null, 2)}\n`);

    // Check if response is successful
    const isSuccessful =
      response.status >= 200 && response.status < 300;

    if (!isSuccessful) {
      // Determine if error is retryable (5xx or timeout)
      const isRetryable = response.status >= 500;
      return {
        success: false,
        isRetryable,
        statusCode: response.status,
        error: `API returned status ${response.status}`,
      };
    }

    // Map response fields if configured
    let mappedOutput: Record<string, any> = { raw: responseData };

    if (config.responseMapping) {
      for (const [outputKey, jsonPath] of Object.entries(
        config.responseMapping
      )) {
        const value = extractValueByPath(responseData, jsonPath);
        mappedOutput[outputKey] = value;
      }
    }

    return {
      success: true,
      statusCode: response.status,
      responseData,
      responseHeaders,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return {
          success: false,
          isRetryable: true,
          error: `API request timeout (${config.timeout}ms)`,
        };
      }
    }

    throw error;
  }
}

/**
 * Build authentication header
 */
function buildAuthHeader(
  auth: ApiCallNodeConfig["auth"],
  context: Record<string, unknown>
): [string, string] | null {
  if (auth.type === "none") {
    return null;
  }

  if (auth.type === "api_key") {
    const headerName = auth.headerName || "X-API-Key";
    const value = evaluateExpression(String(auth.value), context);
    return [headerName, String(value)];
  }

  if (auth.type === "bearer") {
    const token = evaluateExpression(String(auth.token), context);
    return ["Authorization", `Bearer ${token}`];
  }

  if (auth.type === "basic") {
    const username = evaluateExpression(String(auth.username), context);
    const password = evaluateExpression(String(auth.password), context);
    const credentials = Buffer.from(
      `${username}:${password}`
    ).toString("base64");
    return ["Authorization", `Basic ${credentials}`];
  }

  return null;
}

/**
 * Extract value from response using JSONPath-like syntax
 * Examples: "data.user.id" or "results[0].name"
 */
function extractValueByPath(obj: any, path: string): any {
  const parts = path.split(".");
  let current = obj;

  for (const part of parts) {
    if (!current) {
      return undefined;
    }

    // Handle array notation like "results[0]"
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key]?.[parseInt(index)];
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Handle API failure based on strategy
 */
function handleFailure(
  config: ApiCallNodeConfig,
  result: any
): {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
} {
  const errorMessage = result.error || "API call failed";

  if (config.failureStrategy === "continue") {
    // Continue execution even on failure
    return {
      success: true,
      output: {
        apiCallFailed: true,
        error: errorMessage,
        statusCode: result.statusCode,
      },
    };
  }

  if (config.failureStrategy === "alert") {
    // Log alert but continue
    console.warn(`⚠️ API Alert: ${errorMessage}`);
    return {
      success: true,
      output: {
        apiCallFailed: true,
        error: errorMessage,
        statusCode: result.statusCode,
      },
    };
  }

  // "stop" strategy (default)
  return {
    success: false,
    error: errorMessage,
  };
}
