// Trigger Service
// Handles trigger management, validation, and execution logging

import { getPool } from "@/lib/db/pool";
import type {
  OrchestrationTrigger,
  TriggerExecutionLog,
  OrchestrationTriggerType,
  TriggerStatus,
  TriggerConfig,
  TriggerContext,
} from "@/shared/orchestrationTypes";

// ============================================================================
// Database Row Mappers
// ============================================================================

type TriggerRow = {
  id: string;
  orchestration_id: string;
  trigger_type: string;
  name: string;
  description: string | null;
  config: Record<string, unknown>;
  status: TriggerStatus;
  last_triggered_at: Date | null;
  last_error: string | null;
  created_at: Date;
  updated_at: Date;
  created_by: string | null;
  updated_by: string | null;
  created_by_email: string | null;
  updated_by_email: string | null;
};

function mapTriggerRow(row: TriggerRow): OrchestrationTrigger {
  return {
    id: row.id,
    orchestrationId: row.orchestration_id,
    triggerType: row.trigger_type as OrchestrationTriggerType,
    name: row.name,
    description: row.description,
    config: row.config,
    status: row.status,
    lastTriggeredAt: row.last_triggered_at?.toISOString() || null,
    lastError: row.last_error,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    createdById: row.created_by,
    updatedById: row.updated_by,
    createdByEmail: row.created_by_email,
    updatedByEmail: row.updated_by_email,
  };
}

type TriggerLogRow = {
  id: string;
  trigger_id: string;
  orchestration_id: string;
  execution_id: string | null;
  status: "received" | "validated" | "started" | "failed";
  payload: Record<string, unknown>;
  error_message: string | null;
  triggered_at: Date;
  triggered_by: string | null;
};

function mapTriggerLogRow(row: TriggerLogRow): TriggerExecutionLog {
  return {
    id: row.id,
    triggerId: row.trigger_id,
    orchestrationId: row.orchestration_id,
    executionId: row.execution_id,
    status: row.status,
    payload: row.payload,
    errorMessage: row.error_message,
    triggeredAt: row.triggered_at.toISOString(),
    triggeredBy: row.triggered_by,
  };
}

// ============================================================================
// Trigger CRUD Operations
// ============================================================================

export async function createTrigger(data: {
  orchestrationId: string;
  triggerType: OrchestrationTriggerType;
  name: string;
  description?: string;
  config: TriggerConfig;
  createdById: string;
}): Promise<OrchestrationTrigger> {
  const pool = getPool();
  
  // Encrypt sensitive data in config before storing
  const encryptedConfig = encryptTriggerConfig(data.config);

  const result = await pool.query<TriggerRow>(
    `INSERT INTO orchestration_triggers 
     (orchestration_id, trigger_type, name, description, config, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $6)
     RETURNING *`,
    [
      data.orchestrationId,
      data.triggerType,
      data.name,
      data.description || null,
      JSON.stringify(encryptedConfig),
      data.createdById,
    ]
  );

  const trigger = await getTriggerById(result.rows[0].id);
  if (!trigger) {
    throw new Error("Failed to load created trigger");
  }
  return trigger;
}

export async function getTriggers(filters: {
  orchestrationId?: string;
  triggerType?: OrchestrationTriggerType;
  status?: TriggerStatus;
}): Promise<OrchestrationTrigger[]> {
  const pool = getPool();
  let query = `
    SELECT
      t.*,
      created_user.email AS created_by_email,
      updated_user.email AS updated_by_email
    FROM orchestration_triggers t
    LEFT JOIN users created_user ON created_user.id = t.created_by
    LEFT JOIN users updated_user ON updated_user.id = t.updated_by
    WHERE 1=1`;
  const params: any[] = [];

  if (filters.orchestrationId) {
    params.push(filters.orchestrationId);
    query += ` AND t.orchestration_id = $${params.length}`;
  }

  if (filters.triggerType) {
    params.push(filters.triggerType);
    query += ` AND t.trigger_type = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND t.status = $${params.length}`;
  }

  query += " ORDER BY t.created_at DESC";

  const result = await pool.query<TriggerRow>(query, params);
  return result.rows.map(mapTriggerRow);
}

export async function getTriggerById(id: string): Promise<OrchestrationTrigger | null> {
  const pool = getPool();
  const result = await pool.query<TriggerRow>(
    `SELECT
       t.*,
       created_user.email AS created_by_email,
       updated_user.email AS updated_by_email
     FROM orchestration_triggers t
     LEFT JOIN users created_user ON created_user.id = t.created_by
     LEFT JOIN users updated_user ON updated_user.id = t.updated_by
     WHERE t.id = $1`,
    [id]
  );

  return result.rows[0] ? mapTriggerRow(result.rows[0]) : null;
}

export async function updateTrigger(
  id: string,
  data: {
    name?: string;
    description?: string;
    config?: TriggerConfig;
    status?: TriggerStatus;
    lastError?: string | null;
    updatedById: string;
  }
): Promise<OrchestrationTrigger> {
  const pool = getPool();
  const updates: string[] = ["updated_at = now()", "updated_by = $2"];
  const params: any[] = [id, data.updatedById];
  let paramIndex = 3;

  if (data.name !== undefined) {
    params.push(data.name);
    updates.push(`name = $${paramIndex++}`);
  }

  if (data.description !== undefined) {
    params.push(data.description);
    updates.push(`description = $${paramIndex++}`);
  }

  if (data.config !== undefined) {
    const encryptedConfig = encryptTriggerConfig(data.config);
    params.push(JSON.stringify(encryptedConfig));
    updates.push(`config = $${paramIndex++}`);
  }

  if (data.status !== undefined) {
    params.push(data.status);
    updates.push(`status = $${paramIndex++}`);
  }

  if (data.lastError !== undefined) {
    params.push(data.lastError);
    updates.push(`last_error = $${paramIndex++}`);
  }

  const result = await pool.query<TriggerRow>(
    `UPDATE orchestration_triggers 
     SET ${updates.join(", ")}
     WHERE id = $1
     RETURNING *`,
    params
  );

  if (!result.rows[0]) {
    throw new Error(`Trigger ${id} not found`);
  }

  const trigger = await getTriggerById(result.rows[0].id);
  if (!trigger) {
    throw new Error(`Trigger ${id} not found`);
  }
  return trigger;
}

export async function deleteTrigger(id: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM orchestration_triggers WHERE id = $1", [id]);
}

export async function updateTriggerLastTriggered(
  id: string,
  error?: string
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `UPDATE orchestration_triggers 
     SET last_triggered_at = now(), last_error = $2, status = $3
     WHERE id = $1`,
    [id, error || null, error ? "error" : "active"]
  );
}

// ============================================================================
// Trigger Execution Logs
// ============================================================================

export async function createTriggerLog(data: {
  triggerId: string;
  orchestrationId: string;
  executionId?: string;
  status: "received" | "validated" | "started" | "failed";
  payload: Record<string, unknown>;
  errorMessage?: string;
  triggeredBy?: string;
}): Promise<TriggerExecutionLog> {
  const pool = getPool();

  const result = await pool.query<TriggerLogRow>(
    `INSERT INTO trigger_execution_logs 
     (trigger_id, orchestration_id, execution_id, status, payload, error_message, triggered_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.triggerId,
      data.orchestrationId,
      data.executionId || null,
      data.status,
      JSON.stringify(data.payload),
      data.errorMessage || null,
      data.triggeredBy || null,
    ]
  );

  return mapTriggerLogRow(result.rows[0]);
}

export async function getTriggerLogs(filters: {
  triggerId?: string;
  orchestrationId?: string;
  executionId?: string;
  status?: string;
  limit?: number;
}): Promise<TriggerExecutionLog[]> {
  const pool = getPool();
  let query = "SELECT * FROM trigger_execution_logs WHERE 1=1";
  const params: any[] = [];

  if (filters.triggerId) {
    params.push(filters.triggerId);
    query += ` AND trigger_id = $${params.length}`;
  }

  if (filters.orchestrationId) {
    params.push(filters.orchestrationId);
    query += ` AND orchestration_id = $${params.length}`;
  }

  if (filters.executionId) {
    params.push(filters.executionId);
    query += ` AND execution_id = $${params.length}`;
  }

  if (filters.status) {
    params.push(filters.status);
    query += ` AND status = $${params.length}`;
  }

  query += " ORDER BY triggered_at DESC";

  if (filters.limit) {
    params.push(filters.limit);
    query += ` LIMIT $${params.length}`;
  }

  const result = await pool.query<TriggerLogRow>(query, params);
  return result.rows.map(mapTriggerLogRow);
}

// ============================================================================
// Trigger Validation
// ============================================================================

export function validateTriggerConfig(
  triggerType: OrchestrationTriggerType,
  config: TriggerConfig
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (triggerType) {
    case "manual":
      if (config.type !== "manual") {
        errors.push("Invalid manual trigger config");
      } else {
        // Validate input fields (type is narrowed to ManualTriggerConfig)
        if (config.inputFields) {
          config.inputFields.forEach((field, index) => {
            if (!field.name) errors.push(`Input field ${index}: name is required`);
            if (!field.label) errors.push(`Input field ${index}: label is required`);
            if (field.type === "select" && !field.options) {
              errors.push(`Input field ${index}: options required for select type`);
            }
          });
        }
      }
      break;

    case "schedule":
      if (config.type !== "schedule") {
        errors.push("Invalid schedule trigger config");
      } else if (!config.cronExpression) {
        errors.push("Cron expression is required");
      }
      break;

    case "webhook":
      if (config.type !== "webhook") {
        errors.push("Invalid webhook trigger config");
      } else {
        if (!config.secret) {
          errors.push("Webhook secret is required");
        }
        if (!config.allowedMethods || config.allowedMethods.length === 0) {
          errors.push("At least one allowed HTTP method is required");
        }
        if (config.allowedIPs && config.allowedIPs.some((ip) => !ip.trim())) {
          errors.push("Invalid IP address in allowlist");
        }
        if (config.enabled === undefined || config.enabled === null) {
          errors.push("Enabled status is required");
        }
      }
      break;

    case "api":
      if (config.type !== "api") {
        errors.push("Invalid API trigger config");
      } else {
        if (config.rateLimit !== undefined && config.rateLimit < 0) {
          errors.push("Rate limit must be 0 (unlimited) or positive number");
        }
        if (config.enabled === undefined || config.enabled === null) {
          errors.push("Enabled status is required");
        }
      }
      break;

    // Add more validations as needed
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Security: Credential Encryption
// ============================================================================

// Simple encryption/decryption (in production, use proper encryption service)
function encryptTriggerConfig(config: TriggerConfig): TriggerConfig {
  // Clone config to avoid mutation
  const encrypted = JSON.parse(JSON.stringify(config));

  // Encrypt sensitive fields based on trigger type
  if (config.type === "webhook" && "secret" in config) {
    // In production, use proper encryption like AES-256
    // For now, we'll just mark it as encrypted (placeholder)
    (encrypted as any).secret = `encrypted:${config.secret}`;
  }

  if (config.type === "api" && "apiKey" in config) {
    (encrypted as any).apiKey = `encrypted:${config.apiKey}`;
  }

  return encrypted;
}

export function decryptTriggerConfig(config: TriggerConfig): TriggerConfig {
  // Clone config
  const decrypted = JSON.parse(JSON.stringify(config));

  // Decrypt sensitive fields
  if ("secret" in decrypted && typeof decrypted.secret === "string") {
    if (decrypted.secret.startsWith("encrypted:")) {
      decrypted.secret = decrypted.secret.replace("encrypted:", "");
    }
  }

  if ("apiKey" in decrypted && typeof decrypted.apiKey === "string") {
    if (decrypted.apiKey.startsWith("encrypted:")) {
      decrypted.apiKey = decrypted.apiKey.replace("encrypted:", "");
    }
  }

  return decrypted;
}

// ============================================================================
// Trigger Context Builder
// ============================================================================

export function buildTriggerContext(
  trigger: OrchestrationTrigger,
  input: Record<string, unknown>,
  triggeredBy: string | null
): TriggerContext {
  return {
    type: trigger.triggerType,
    triggerId: trigger.id,
    startedBy: triggeredBy,
    startedAt: new Date().toISOString(),
    input,
    metadata: {
      triggerName: trigger.name,
      triggerDescription: trigger.description,
    },
  };
}

// ============================================================================
// API Client Management
// ============================================================================

import type { APIClient, APIRequestLog } from "@/shared/orchestrationTypes";
import { randomBytes } from "crypto";

type APIClientRow = {
  id: string;
  name: string;
  description: string | null;
  api_key: string;
  is_active: boolean;
  rate_limit: number;
  allowed_orchestrations: string[];
  last_used_at: string | null;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
};

function mapAPIClientRow(row: APIClientRow): APIClient {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    apiKey: row.api_key,
    isActive: row.is_active,
    rateLimit: row.rate_limit,
    allowedOrchestrations: row.allowed_orchestrations,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    createdById: row.created_by,
    createdByEmail: row.created_by_email,
  };
}

/**
 * Generate a secure API key
 */
export function generateAPIKey(): string {
  // Generate 32-byte random key, encode as base64
  const key = randomBytes(32).toString("base64url");
  return `scout_${key}`;
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(): string {
  // Generate 32-byte random secret
  const secret = randomBytes(32).toString("hex");
  return secret;
}

/**
 * Create a new API client
 */
export async function createAPIClient(data: {
  name: string;
  description?: string;
  rateLimit?: number;
  allowedOrchestrations?: string[];
  createdById?: string;
}): Promise<APIClient> {
  const pool = await getPool();

  // Generate API key
  const apiKey = generateAPIKey();

  // Encrypt API key before storage
  const encryptedKey = `encrypted:${apiKey}`; // In production, use AES-256

  const result = await pool.query(
    `INSERT INTO api_clients (
      name, description, api_key, rate_limit, allowed_orchestrations, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [
      data.name,
      data.description || null,
      encryptedKey,
      data.rateLimit || 60,
      data.allowedOrchestrations || [],
      data.createdById || null,
    ]
  );

  const client = mapAPIClientRow(result.rows[0]);
  
  // Return with plain API key (only time it's shown)
  client.apiKey = apiKey;
  
  return client;
}

/**
 * Get all API clients
 */
export async function getAPIClients(filters?: {
  isActive?: boolean;
}): Promise<APIClient[]> {
  const pool = await getPool();

  let query = `
    SELECT api_clients.*, created_user.email AS created_by_email
    FROM api_clients
    LEFT JOIN users created_user ON created_user.id = api_clients.created_by`;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters?.isActive !== undefined) {
    conditions.push(`api_clients.is_active = $${params.length + 1}`);
    params.push(filters.isActive);
  }

  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }

  query += " ORDER BY api_clients.created_at DESC";

  const result = await pool.query(query, params);
  
  // Don't return decrypted keys in list view
  return result.rows.map((row) => {
    const client = mapAPIClientRow(row);
    client.apiKey = "***ENCRYPTED***";
    return client;
  });
}

/**
 * Get API client by ID
 */
export async function getAPIClientById(id: string): Promise<APIClient | null> {
  const pool = await getPool();

  const result = await pool.query(
    `SELECT api_clients.*, created_user.email AS created_by_email
     FROM api_clients
     LEFT JOIN users created_user ON created_user.id = api_clients.created_by
     WHERE api_clients.id = $1`,
    [id]
  );

  if (result.rows.length === 0) return null;

  const client = mapAPIClientRow(result.rows[0]);
  // Don't decrypt key
  client.apiKey = "***ENCRYPTED***";
  return client;
}

/**
 * Authenticate API client by API key
 */
export async function authenticateAPIClient(apiKey: string): Promise<APIClient | null> {
  const pool = await getPool();

  // Encrypt the provided key to match stored format
  const encryptedKey = `encrypted:${apiKey}`;

  const result = await pool.query(
    "SELECT * FROM api_clients WHERE api_key = $1 AND is_active = true",
    [encryptedKey]
  );

  if (result.rows.length === 0) return null;

  return mapAPIClientRow(result.rows[0]);
}

/**
 * Update API client
 */
export async function updateAPIClient(
  id: string,
  data: {
    name?: string;
    description?: string;
    isActive?: boolean;
    rateLimit?: number;
    allowedOrchestrations?: string[];
  }
): Promise<APIClient | null> {
  const pool = await getPool();

  const updates: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    updates.push(`name = $${paramIndex++}`);
    params.push(data.name);
  }
  if (data.description !== undefined) {
    updates.push(`description = $${paramIndex++}`);
    params.push(data.description);
  }
  if (data.isActive !== undefined) {
    updates.push(`is_active = $${paramIndex++}`);
    params.push(data.isActive);
  }
  if (data.rateLimit !== undefined) {
    updates.push(`rate_limit = $${paramIndex++}`);
    params.push(data.rateLimit);
  }
  if (data.allowedOrchestrations !== undefined) {
    updates.push(`allowed_orchestrations = $${paramIndex++}`);
    params.push(data.allowedOrchestrations);
  }

  if (updates.length === 0) {
    return getAPIClientById(id);
  }

  updates.push(`updated_at = NOW()`);
  params.push(id);

  const result = await pool.query(
    `UPDATE api_clients SET ${updates.join(", ")} WHERE id = $${paramIndex} RETURNING *`,
    params
  );

  if (result.rows.length === 0) return null;

  const client = mapAPIClientRow(result.rows[0]);
  client.apiKey = "***ENCRYPTED***";
  return client;
}

/**
 * Regenerate API key for client
 */
export async function regenerateAPIKey(id: string): Promise<{ client: APIClient; apiKey: string } | null> {
  const pool = await getPool();

  const newKey = generateAPIKey();
  const encryptedKey = `encrypted:${newKey}`;

  const result = await pool.query(
    `UPDATE api_clients SET api_key = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [encryptedKey, id]
  );

  if (result.rows.length === 0) return null;

  const client = mapAPIClientRow(result.rows[0]);
  
  return {
    client,
    apiKey: newKey, // Return plain key (only time shown)
  };
}

/**
 * Delete API client
 */
export async function deleteAPIClient(id: string): Promise<boolean> {
  const pool = await getPool();

  const result = await pool.query("DELETE FROM api_clients WHERE id = $1", [id]);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Update last used timestamp
 */
export async function updateAPIClientLastUsed(clientId: string): Promise<void> {
  const pool = await getPool();

  await pool.query(
    "UPDATE api_clients SET last_used_at = NOW() WHERE id = $1",
    [clientId]
  );
}

/**
 * Check rate limit for API client
 */
export async function checkRateLimit(clientId: string, rateLimit: number): Promise<{ allowed: boolean; remaining: number }> {
  if (rateLimit === 0) {
    return { allowed: true, remaining: -1 }; // Unlimited
  }

  const pool = await getPool();
  const now = new Date();
  const windowStart = new Date(now.getTime() - 60000); // 1 minute ago

  // Count requests in current window
  const result = await pool.query(
    `SELECT COALESCE(SUM(request_count), 0) as total
     FROM api_rate_limits
     WHERE client_id = $1 AND window_start >= $2`,
    [clientId, windowStart.toISOString()]
  );

  const currentCount = parseInt(result.rows[0]?.total || "0");
  const remaining = Math.max(0, rateLimit - currentCount);
  const allowed = currentCount < rateLimit;

  if (allowed) {
    // Increment counter for current minute window
    const currentMinute = new Date(Math.floor(now.getTime() / 60000) * 60000);
    await pool.query(
      `INSERT INTO api_rate_limits (client_id, window_start, request_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (client_id, window_start)
       DO UPDATE SET request_count = api_rate_limits.request_count + 1`,
      [clientId, currentMinute.toISOString()]
    );
  }

  return { allowed, remaining };
}

/**
 * Log API request
 */
export async function logAPIRequest(data: {
  clientId: string;
  orchestrationId: string;
  triggerId?: string;
  executionId?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  requestBody?: Record<string, unknown>;
  responseBody?: Record<string, unknown>;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  durationMs?: number;
}): Promise<void> {
  const pool = await getPool();

  await pool.query(
    `INSERT INTO api_request_logs (
      client_id, orchestration_id, trigger_id, execution_id,
      endpoint, method, status_code,
      request_body, response_body, error_message,
      ip_address, user_agent, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      data.clientId,
      data.orchestrationId,
      data.triggerId || null,
      data.executionId || null,
      data.endpoint,
      data.method,
      data.statusCode,
      data.requestBody || null,
      data.responseBody || null,
      data.errorMessage || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.durationMs || null,
    ]
  );
}

/**
 * Log webhook request
 */
export async function logWebhookRequest(data: {
  triggerId: string;
  orchestrationId: string;
  executionId?: string;
  method: string;
  headers?: Record<string, unknown>;
  queryParams?: Record<string, unknown>;
  requestBody?: Record<string, unknown>;
  statusCode: number;
  responseBody?: Record<string, unknown>;
  errorMessage?: string;
  ipAddress?: string;
  userAgent?: string;
  secretValidated: boolean;
  ipAllowed: boolean;
  durationMs?: number;
}): Promise<void> {
  const pool = await getPool();

  await pool.query(
    `INSERT INTO webhook_request_logs (
      trigger_id, orchestration_id, execution_id,
      method, headers, query_params, request_body,
      status_code, response_body, error_message,
      ip_address, user_agent,
      secret_validated, ip_allowed, duration_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      data.triggerId,
      data.orchestrationId,
      data.executionId || null,
      data.method,
      data.headers || null,
      data.queryParams || null,
      data.requestBody || null,
      data.statusCode,
      data.responseBody || null,
      data.errorMessage || null,
      data.ipAddress || null,
      data.userAgent || null,
      data.secretValidated,
      data.ipAllowed,
      data.durationMs || null,
    ]
  );
}

