import { getPool } from "@/lib/db/pool";
import type { HttpApiTriggerConfig } from "@/shared/orchestrationTypes";
import { HTTP_TRIGGER_RESERVED_SHORT_NAMES, SHORT_NAME_PATTERN } from "./constants";

export type HttpTriggerResolution = {
  triggerId: string;
  orchestrationId: string;
  orchestrationVersion: number;
  orchestrationName: string;
  triggerName: string;
  status: string;
  shortName: string;
  config: HttpApiTriggerConfig;
};

export function normalizeShortName(value: string): string {
  return value.trim().toLowerCase();
}

export function validateShortNameFormat(value: string): string[] {
  const shortName = normalizeShortName(value);
  const errors: string[] = [];

  if (!shortName) {
    errors.push("Short name is required");
    return errors;
  }

  if (!SHORT_NAME_PATTERN.test(shortName)) {
    errors.push("Short name must be URL-safe: lowercase letters, numbers, and hyphen only");
  }

  if (HTTP_TRIGGER_RESERVED_SHORT_NAMES.has(shortName)) {
    errors.push("Short name is reserved");
  }

  return errors;
}

export async function isShortNameInUse(shortName: string, excludeOrchestrationId?: string): Promise<boolean> {
  const pool = getPool();
  const normalized = normalizeShortName(shortName);

  const params: unknown[] = [normalized];
  let query = `
    SELECT 1
    FROM orchestration_triggers
    WHERE trigger_type = 'http_api'
      AND lower(endpoint_slug) = $1
  `;

  if (excludeOrchestrationId) {
    params.push(excludeOrchestrationId);
    query += ` AND orchestration_id <> $${params.length}`;
  }

  query += " LIMIT 1";
  const result = await pool.query(query, params);
  return (result.rowCount ?? 0) > 0;
}

export async function resolveHttpTriggerByShortName(shortName: string): Promise<HttpTriggerResolution | null> {
  const pool = getPool();
  const normalized = normalizeShortName(shortName);

  const result = await pool.query<{
    trigger_id: string;
    orchestration_id: string;
    orchestration_version: number;
    orchestration_name: string;
    trigger_name: string;
    trigger_status: string;
    endpoint_slug: string;
    config: HttpApiTriggerConfig;
  }>(
    `SELECT
       t.id AS trigger_id,
       t.orchestration_id,
       o.version AS orchestration_version,
       o.name AS orchestration_name,
       t.name AS trigger_name,
       t.status AS trigger_status,
       t.endpoint_slug,
       t.config
     FROM orchestration_triggers t
     INNER JOIN orchestrations o ON o.id = t.orchestration_id
     WHERE t.trigger_type = 'http_api'
       AND lower(t.endpoint_slug) = $1
       AND o.status = 'published'
     LIMIT 1`,
    [normalized]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    triggerId: row.trigger_id,
    orchestrationId: row.orchestration_id,
    orchestrationVersion: row.orchestration_version,
    orchestrationName: row.orchestration_name,
    triggerName: row.trigger_name,
    status: row.trigger_status,
    shortName: row.endpoint_slug,
    config: row.config,
  };
}
