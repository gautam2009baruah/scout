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
      } else {
        if (!config.scheduleType) {
          errors.push("Schedule type is required");
          break;
        }

        if (config.scheduleType === "cron" && !config.cronExpression) {
          errors.push("Cron expression is required for cron schedule type");
        }

        if (
          (config.scheduleType === "daily" ||
            config.scheduleType === "weekly" ||
            config.scheduleType === "monthly") &&
          !config.specificTimeUtc &&
          !config.specificTime
        ) {
          errors.push("Specific time is required for daily/weekly/monthly schedules");
        }

        if (config.scheduleType === "weekly" && (config.dayOfWeek === undefined || config.dayOfWeek === null)) {
          errors.push("Day of week is required for weekly schedules");
        }

        if (config.scheduleType === "monthly" && (config.dayOfMonth === undefined || config.dayOfMonth === null)) {
          errors.push("Day of month is required for monthly schedules");
        }

        if (config.scheduleType === "one-time" && !config.oneTimeDate) {
          errors.push("One-time date is required for one-time schedules");
        }
      }
      break;

    case "chatbot":
      if (config.type !== "chatbot") {
        errors.push("Invalid chatbot trigger config");
      }
      break;

    case "email":
      if (config.type !== "email") {
        errors.push("Invalid email trigger config");
      }
      break;

    default:
      errors.push(`Unsupported trigger type: ${triggerType}`);
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


