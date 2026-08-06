import { getPool } from "@/lib/db/pool";
import { createHash, randomBytes } from "node:crypto";
import type { AdminSession } from "./auth";
import { listGuidedWorkflowTargetApps } from "./guided-workflows";
import { ChatbotLifecycleSettingsRecord, DEFAULT_CHATBOT_LIFECYCLE_SETTINGS, listChatbotLifecycleSettings, mergeLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import { obfuscateGuid } from "@/lib/chat/embed-id-token";
import { INPUT_LIMITS, exceedsCharacterLimit } from "@/lib/validation/input-limits";

export type ChatbotLifecycleSettingsInput = {
  targetAppId?: string | null;
  maxContextMessages: number;
  maxContextTokens: number;
  inactivityTimeoutSeconds: number;
  resetOnLogoutEvent: boolean;
  resetOnUserChange: boolean;
  resetOnTargetAppChange: boolean;
};

export class ChatbotSettingsError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ChatbotSettingsError";
    this.statusCode = statusCode;
  }
}

async function assertCompanyAccess(session: AdminSession, companyId: string) {
  if (!session.availableCompanies.some((company) => company.companyId === companyId)) {
    throw new ChatbotSettingsError("You do not have access to this company.", 403);
  }
}

async function assertTargetAppAccess(session: AdminSession, companyId: string, targetAppId?: string | null) {
  if (!targetAppId) {
    return;
  }

  const apps = await listGuidedWorkflowTargetApps(session);
  const allowed = apps.some((app) => app.companyId === companyId && app.id === targetAppId);
  if (!allowed) {
    throw new ChatbotSettingsError("Selected target application is unavailable.", 400);
  }
}

function normalizeInput(input: ChatbotLifecycleSettingsInput) {
  return mergeLifecycleSettings(DEFAULT_CHATBOT_LIFECYCLE_SETTINGS, {
    maxContextMessages: input.maxContextMessages,
    maxContextTokens: input.maxContextTokens,
    inactivityTimeoutSeconds: input.inactivityTimeoutSeconds,
    resetOnLogoutEvent: input.resetOnLogoutEvent,
    resetOnUserChange: input.resetOnUserChange,
    resetOnTargetAppChange: input.resetOnTargetAppChange
  });
}

export async function getChatbotLifecycleSettingsAdminPayload(session: AdminSession) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const [settings, targetApps, security] = await Promise.all([
    listChatbotLifecycleSettings(companyId),
    listGuidedWorkflowTargetApps(session),
    getChatbotSecuritySettings(session)
  ]);

  return {
    defaults: DEFAULT_CHATBOT_LIFECYCLE_SETTINGS,
    settings,
    security,
    targetApps: targetApps.filter((app) => app.companyId === companyId).map((app) => ({
      id: app.id,
      name: app.name,
      companyId: app.companyId
    }))
  };
}

export async function getChatbotSecuritySettings(session: AdminSession) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const result = await getPool().query<{ enforce_chatbot_key_environment: boolean }>(
    "SELECT COALESCE(enforce_chatbot_key_environment, false) AS enforce_chatbot_key_environment FROM companies WHERE id = $1",
    [companyId]
  );

  return {
    strictEnvironmentEnforcement: result.rows[0]?.enforce_chatbot_key_environment === true
  };
}

export async function updateChatbotSecuritySettings(
  session: AdminSession,
  input: { strictEnvironmentEnforcement: boolean }
) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  await getPool().query(
    `
      UPDATE companies
      SET enforce_chatbot_key_environment = $1,
          updated_by = $2,
          updated_at = now()
      WHERE id = $3
    `,
    [input.strictEnvironmentEnforcement === true, session.user.id, companyId]
  );

  return getChatbotSecuritySettings(session);
}

export async function upsertChatbotLifecycleSettings(session: AdminSession, input: ChatbotLifecycleSettingsInput) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);
  await assertTargetAppAccess(session, companyId, input.targetAppId ?? null);
  if (!input.targetAppId) {
    throw new ChatbotSettingsError("Target application is required for lifecycle settings.", 400);
  }
  const normalized = normalizeInput(input);

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string | null;
    max_context_messages: number;
    max_context_tokens: number;
    inactivity_timeout_seconds: number;
    reset_on_logout_event: boolean;
    reset_on_user_change: boolean;
    reset_on_target_app_change: boolean;
  }>(
    `
      INSERT INTO chatbot_lifecycle_settings (
        target_app_id,
        max_context_messages,
        max_context_tokens,
        inactivity_timeout_seconds,
        reset_on_logout_event,
        reset_on_user_change,
        reset_on_target_app_change,
        created_by,
        updated_by,
        deleted_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, NULL)
      ON CONFLICT (target_app_id)
      WHERE deleted_at IS NULL
      DO UPDATE SET
        max_context_messages = EXCLUDED.max_context_messages,
        max_context_tokens = EXCLUDED.max_context_tokens,
        inactivity_timeout_seconds = EXCLUDED.inactivity_timeout_seconds,
        reset_on_logout_event = EXCLUDED.reset_on_logout_event,
        reset_on_user_change = EXCLUDED.reset_on_user_change,
        reset_on_target_app_change = EXCLUDED.reset_on_target_app_change,
        updated_by = EXCLUDED.updated_by,
        updated_at = now(),
        deleted_at = NULL
      RETURNING id,
                (SELECT company_id FROM company_target_applications WHERE id = chatbot_lifecycle_settings.target_app_id) AS company_id,
                target_app_id, max_context_messages, max_context_tokens, inactivity_timeout_seconds,
                reset_on_logout_event, reset_on_user_change, reset_on_target_app_change
    `,
    [
      input.targetAppId,
      normalized.maxContextMessages,
      normalized.maxContextTokens,
      normalized.inactivityTimeoutSeconds,
      normalized.resetOnLogoutEvent,
      normalized.resetOnUserChange,
      normalized.resetOnTargetAppChange,
      session.user.id
    ]
  );

  return result.rows[0] as unknown as ChatbotLifecycleSettingsRecord;
}

export async function resetChatbotLifecycleSettings(session: AdminSession, targetAppId?: string | null) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);
  await assertTargetAppAccess(session, companyId, targetAppId ?? null);
  if (!targetAppId) {
    throw new ChatbotSettingsError("Target application is required for lifecycle settings reset.", 400);
  }

  await getPool().query(
    `
      UPDATE chatbot_lifecycle_settings
      SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE target_app_id = $2
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = chatbot_lifecycle_settings.target_app_id
            AND cta.company_id = $1
            AND cta.deleted_at IS NULL
        )
        AND deleted_at IS NULL
    `,
    [companyId, targetAppId, session.user.id]
  );
}

export type ChatbotApiKeyStatus = "active" | "suspended" | "revoked";

export type ChatbotApiKeyRecord = {
  id: string;
  name: string;
  keyPrefix: string;
  targetAppId: string | null;
  targetAppName: string | null;
  environment: string;
  status: ChatbotApiKeyStatus;
  isActive: boolean;
  allowedOrigins: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateChatbotApiKeyInput = {
  name: string;
  targetAppId?: string | null;
  environment: string;
  expiresAt?: string | null;
};

export type ChatbotKeyEnvironmentRecord = {
  id: string;
  targetAppId: string;
  name: string;
  url: string;
  isProduction: boolean;
  activityLoggingEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ChatbotEmbedPackageRecord = {
  id: string;
  targetAppId: string;
  targetAppName: string;
  environment: string;
  userId: string;
  scoutUrl: string;
  apiUrl: string;
  assistantName: string;
  apiKeyPrefix: string;
  createdAt: string;
  updatedAt: string;
};

export type UpsertChatbotEmbedPackageInput = {
  id?: string;
  targetAppId: string;
  environment: string;
  apiKey: string;
  userId: string;
  scoutUrl: string;
  apiUrl: string;
  assistantName?: string;
};

const MIN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeOrigins(origins?: string[]) {
  if (!Array.isArray(origins)) {
    return [];
  }

  return Array.from(new Set(origins.map((item) => String(item || "").trim()).filter(Boolean)));
}

function normalizeEnvironment(value: string) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  return normalized;
}

function normalizeAndValidateUrl(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new ChatbotSettingsError("A valid environment URL is required.", 400);
  }

  if (exceedsCharacterLimit(trimmed, INPUT_LIMITS.environmentUrl)) {
    throw new ChatbotSettingsError(`Environment URL must be ${INPUT_LIMITS.environmentUrl} characters or fewer.`, 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new ChatbotSettingsError("A valid environment URL is required.", 400);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ChatbotSettingsError("A valid environment URL is required.", 400);
  }

  return trimmed;
}

function sanitizeConfigVarBase(value: string) {
  return String(value || "Scout")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("") || "Scout";
}

function normalizeUrl(value: string, fallback: string) {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function parseExpiryDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ChatbotSettingsError("Expiry date is invalid.", 400);
  }

  if (parsed.getTime() < Date.now() + MIN_EXPIRY_MS) {
    throw new ChatbotSettingsError("Expiry must be at least 7 days from now.", 400);
  }

  return parsed;
}

// Returns the environment's own URL so callers can derive allowed_origins_json
// from it directly — API keys are always scoped to exactly the environment's
// URL, never a client-supplied value (see createChatbotApiKey/updateChatbotApiKey).
async function assertEnvironmentExists(session: AdminSession, companyId: string, targetAppId: string, environment: string) {
  const normalized = normalizeEnvironment(environment);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }

  await assertTargetAppAccess(session, companyId, targetAppId);

  const result = await getPool().query<{ id: string; url: string }>(
    `
      SELECT id, url
      FROM target_app_environments
      WHERE target_app_id = $1
        AND normalized_name = $2
      LIMIT 1
    `,
    [targetAppId, normalized]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Selected environment is not available. Create it first.", 400);
  }

  const url = result.rows[0].url?.trim() || "";
  if (!url) {
    throw new ChatbotSettingsError("The selected environment has no URL configured. Set one under Manage Environments first.", 400);
  }

  return url;
}

async function ensureNoOtherActiveKeyInEnvironment(
  targetAppId: string,
  environment: string,
  excludeApiKeyId?: string
) {
  const normalized = normalizeEnvironment(environment);
  if (!normalized) {
    return;
  }

  const result = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM chatbot_api_keys k
      INNER JOIN target_app_environments env ON env.id = k.environment_id
      WHERE k.target_app_id = $1
        AND env.normalized_name = $2
        AND status = 'active'
        AND is_active = true
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1
    `,
    [targetAppId, normalized, excludeApiKeyId ?? null]
  );

  if ((result.rowCount ?? 0) > 0) {
    throw new ChatbotSettingsError(
      `Another active API key already exists for environment "${normalized}". Disable it before activating another key.`,
      409
    );
  }
}

async function canUseCompanyLevelApiKeys(session: AdminSession, companyId: string) {
  if (session.user.isAdminRole) {
    return true;
  }

  const result = await getPool().query<{ has_restrictions: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM user_target_app_access uta
        INNER JOIN company_target_applications cta ON cta.id = uta.target_app_id
        WHERE uta.user_id = $1
          AND cta.company_id = $2
          AND uta.deleted_at IS NULL
      ) AS has_restrictions
    `,
    [session.user.id, companyId]
  );

  return result.rows[0]?.has_restrictions !== true;
}

async function assertCompanyLevelApiKeyScopeAllowed(
  session: AdminSession,
  companyId: string,
  targetAppId?: string | null
) {
  if (targetAppId) {
    return;
  }

  const allowed = await canUseCompanyLevelApiKeys(session, companyId);
  if (!allowed) {
    throw new ChatbotSettingsError("You can only create API keys for your allowed target applications.", 403);
  }
}

async function assertUniqueApiKeyNamePerTargetApp(
  companyId: string,
  targetAppId: string | null,
  name: string,
  nextStatus: ChatbotApiKeyStatus,
  excludeApiKeyId?: string
) {
  if (nextStatus === "revoked") {
    return;
  }

  const normalizedName = String(name || "").trim().toLowerCase();
  if (!normalizedName) {
    return;
  }

  const result = await getPool().query<{ id: string }>(
    `
      SELECT k.id
      FROM chatbot_api_keys k
      INNER JOIN company_target_applications cta ON cta.id = k.target_app_id
      WHERE cta.company_id = $1
        AND (($2::uuid IS NULL AND k.target_app_id IS NULL) OR k.target_app_id = $2)
        AND lower(trim(k.name)) = $3
        AND k.status <> 'revoked'
        AND ($4::uuid IS NULL OR k.id <> $4)
      LIMIT 1
    `,
    [companyId, targetAppId, normalizedName, excludeApiKeyId ?? null]
  );

  if ((result.rowCount ?? 0) > 0) {
    throw new ChatbotSettingsError("API key name already exists for this target app.", 409);
  }
}

function randomKeySuffix() {
  return randomBytes(24).toString("base64url");
}

function generateChatbotApiKey(environment: string) {
  const envToken = normalizeEnvironment(environment).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "prod";
  const envPart = envToken.slice(0, 10);
  const secret = `sk_browser_${envPart}_${randomKeySuffix()}`;
  return {
    secret,
    keyPrefix: secret.slice(0, 18),
    keyHash: hashSecret(secret)
  };
}

function mapChatbotApiKeyRow(row: {
  id: string;
  name: string;
  key_prefix: string;
  target_app_id: string | null;
  target_app_name: string | null;
  environment_id?: string;
  environment: string;
  status: ChatbotApiKeyStatus;
  is_active: boolean;
  allowed_origins_json: string[] | null;
  expires_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): ChatbotApiKeyRecord {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.key_prefix,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    environment: row.environment,
    status: row.status,
    isActive: row.is_active,
    allowedOrigins: row.allowed_origins_json ?? [],
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    lastUsedAt: row.last_used_at ? row.last_used_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}

export async function listChatbotApiKeys(session: AdminSession): Promise<ChatbotApiKeyRecord[]> {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment_id: string;
    environment: string;
    status: ChatbotApiKeyStatus;
    is_active: boolean;
    allowed_origins_json: string[] | null;
    expires_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT
        k.id,
        k.name,
        k.key_prefix,
        k.target_app_id,
        cta.name AS target_app_name,
        k.environment_id,
        env.name AS environment,
        COALESCE(k.status, CASE WHEN k.is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        k.is_active,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        k.expires_at,
        k.last_used_at,
        k.created_at,
        k.updated_at
      FROM chatbot_api_keys k
      LEFT JOIN company_target_applications cta ON cta.id = k.target_app_id
      INNER JOIN target_app_environments env ON env.id = k.environment_id
      WHERE cta.company_id = $1
      ORDER BY CASE WHEN COALESCE(k.status, 'active') = 'revoked' THEN 1 ELSE 0 END ASC, k.created_at DESC
    `,
    [companyId]
  );

  return result.rows.map(mapChatbotApiKeyRow);
}

export async function createChatbotApiKey(session: AdminSession, input: CreateChatbotApiKeyInput) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const name = String(input.name || "").trim();
  if (!name) {
    throw new ChatbotSettingsError("API key name is required.", 400);
  }

  const environment = normalizeEnvironment(input.environment);
  if (!environment) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }
  const targetAppId = input.targetAppId ?? null;
  await assertTargetAppAccess(session, companyId, targetAppId);
  if (!targetAppId) {
    throw new ChatbotSettingsError("Target application is required.", 400);
  }
  const environmentUrl = await assertEnvironmentExists(session, companyId, targetAppId, environment);

  // Allowed origins are never client-supplied — the key is locked to the
  // environment's own URL so it only ever works against that one origin.
  const allowedOrigins = normalizeOrigins([environmentUrl]);
  const expiresAt = parseExpiryDate(input.expiresAt);

  await assertUniqueApiKeyNamePerTargetApp(companyId, targetAppId, name, "active");

  const existingActive = await getPool().query<{ id: string }>(
    `
      SELECT k.id
      FROM chatbot_api_keys k
      INNER JOIN target_app_environments env ON env.id = k.environment_id
      WHERE k.target_app_id = $1
        AND env.normalized_name = $2
        AND status = 'active'
        AND is_active = true
      LIMIT 1
    `,
    [targetAppId, environment]
  );

  const autoSuspended = (existingActive.rowCount ?? 0) > 0;
  const initialStatus: ChatbotApiKeyStatus = autoSuspended ? "suspended" : "active";
  const initialIsActive = !autoSuspended;

  const generated = generateChatbotApiKey(environment);

  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment: string;
    status: ChatbotApiKeyStatus;
    is_active: boolean;
    allowed_origins_json: string[] | null;
    expires_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      INSERT INTO chatbot_api_keys (
        name,
        key_prefix,
        key_hash,
        target_app_id,
        environment_id,
        is_active,
        status,
        allowed_origins_json,
        expires_at,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, (SELECT id FROM target_app_environments WHERE target_app_id = $4 AND normalized_name = $5 LIMIT 1), $6, $7, $8::jsonb, $9, $10, $10)
      RETURNING
        chatbot_api_keys.id,
        chatbot_api_keys.name,
        chatbot_api_keys.key_prefix,
        chatbot_api_keys.target_app_id,
        chatbot_api_keys.environment_id,
        (SELECT name FROM company_target_applications WHERE id = chatbot_api_keys.target_app_id) AS target_app_name,
        (SELECT name FROM target_app_environments WHERE id = chatbot_api_keys.environment_id) AS environment,
        chatbot_api_keys.status,
        chatbot_api_keys.is_active,
        COALESCE(chatbot_api_keys.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        chatbot_api_keys.expires_at,
        chatbot_api_keys.last_used_at,
        chatbot_api_keys.created_at,
        chatbot_api_keys.updated_at
    `,
    [
      name,
      generated.keyPrefix,
      generated.keyHash,
      targetAppId,
      environment,
      initialIsActive,
      initialStatus,
      JSON.stringify(allowedOrigins),
      expiresAt,
      session.user.id
    ]
  );

  return {
    apiKey: generated.secret,
    record: mapChatbotApiKeyRow(result.rows[0]),
    autoSuspended
  };
}

export async function updateChatbotApiKey(
  session: AdminSession,
  apiKeyId: string,
  input: {
    status?: ChatbotApiKeyStatus;
    name?: string;
    targetAppId?: string | null;
    environment?: string;
    expiresAt?: string | null;
  }
) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const current = await getPool().query<{
    name: string;
    environment: string;
    environment_id: string;
    status: ChatbotApiKeyStatus;
    target_app_id: string | null;
    allowed_origins_json: string[] | null;
  }>(
    `
      SELECT
        name,
        COALESCE((SELECT name FROM target_app_environments WHERE id = chatbot_api_keys.environment_id), '') AS environment,
        environment_id,
        COALESCE(status, 'active')::text AS status,
        target_app_id,
        COALESCE(allowed_origins_json, '[]'::jsonb) AS allowed_origins_json
      FROM chatbot_api_keys
      WHERE id = $1
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = chatbot_api_keys.target_app_id
            AND cta.company_id = $2
            AND cta.deleted_at IS NULL
        )
      LIMIT 1
    `,
    [apiKeyId, companyId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key not found.", 404);
  }

  const nextEnvironment = typeof input.environment === "string" ? normalizeEnvironment(input.environment) : current.rows[0].environment;
  const nextStatus = typeof input.status === "string" ? input.status : current.rows[0].status;
  const nextTargetAppId = Object.prototype.hasOwnProperty.call(input, "targetAppId") ? input.targetAppId ?? null : current.rows[0].target_app_id;
  const nextName = typeof input.name === "string" ? input.name.trim() : current.rows[0].name;

  if (!nextEnvironment) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }

  if (Object.prototype.hasOwnProperty.call(input, "targetAppId")) {
    await assertTargetAppAccess(session, companyId, nextTargetAppId);
  }

  if (!nextTargetAppId) {
    throw new ChatbotSettingsError("Target application is required.", 400);
  }

  const nextEnvironmentUrl = await assertEnvironmentExists(session, companyId, nextTargetAppId, nextEnvironment);

  if (input.status === "active" && current.rows[0].status !== "suspended") {
    throw new ChatbotSettingsError("Only suspended API keys can be re-activated.", 400);
  }

  if (nextStatus === "active") {
    await ensureNoOtherActiveKeyInEnvironment(nextTargetAppId, nextEnvironment, apiKeyId);
  }

  await assertUniqueApiKeyNamePerTargetApp(companyId, nextTargetAppId, nextName, nextStatus, apiKeyId);

  const updates: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (typeof input.name === "string") {
    const trimmed = input.name.trim();
    if (!trimmed) {
      throw new ChatbotSettingsError("API key name cannot be empty.", 400);
    }
    updates.push(`name = $${index}`);
    values.push(trimmed);
    index += 1;
  }

  if (typeof input.status === "string") {
    const status = input.status;
    updates.push(`status = $${index}`);
    values.push(status);
    index += 1;
    updates.push(`is_active = $${index}`);
    values.push(status === "active");
    index += 1;
    if (status === "revoked") {
      updates.push(`revoked_at = now()`);
      updates.push(`revoked_by = $${index}`);
      values.push(session.user.id);
      index += 1;
    }
    if (status === "suspended") {
      updates.push(`suspended_at = now()`);
      updates.push(`suspended_by = $${index}`);
      values.push(session.user.id);
      index += 1;
    }
  }

  if (typeof input.environment === "string") {
    updates.push(`environment_id = (SELECT id FROM target_app_environments WHERE target_app_id = $${index + 1} AND normalized_name = $${index} LIMIT 1)`);
    values.push(nextEnvironment, nextTargetAppId);
    index += 1;
    index += 1;
  }

  if (Object.prototype.hasOwnProperty.call(input, "targetAppId")) {
    updates.push(`target_app_id = $${index}`);
    values.push(input.targetAppId ?? null);
    index += 1;
  }

  // Allowed origins are never client-supplied — always re-derived from the
  // (possibly unchanged) environment's own URL, so a key can never drift
  // from the environment it's locked to. Only written when it actually
  // changes, so a no-op edit doesn't trip the "no updates" guard below.
  const nextAllowedOrigins = normalizeOrigins([nextEnvironmentUrl]);
  const currentAllowedOrigins = current.rows[0].allowed_origins_json ?? [];
  if (JSON.stringify(nextAllowedOrigins) !== JSON.stringify(currentAllowedOrigins)) {
    updates.push(`allowed_origins_json = $${index}::jsonb`);
    values.push(JSON.stringify(nextAllowedOrigins));
    index += 1;
  }

  if (Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
    updates.push(`expires_at = $${index}`);
    values.push(parseExpiryDate(input.expiresAt));
    index += 1;
  }

  if (updates.length === 0) {
    throw new ChatbotSettingsError("No updates were provided.", 400);
  }

  updates.push(`updated_by = $${index}`);
  values.push(session.user.id);
  index += 1;

  values.push(apiKeyId, companyId);

  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment: string;
    status: ChatbotApiKeyStatus;
    is_active: boolean;
    allowed_origins_json: string[] | null;
    expires_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      UPDATE chatbot_api_keys
      SET ${updates.join(", ")}, updated_at = now()
      WHERE id = $${index}
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = chatbot_api_keys.target_app_id
            AND cta.company_id = $${index + 1}
            AND cta.deleted_at IS NULL
        )
      RETURNING
        chatbot_api_keys.id,
        chatbot_api_keys.name,
        chatbot_api_keys.key_prefix,
        chatbot_api_keys.target_app_id,
        chatbot_api_keys.environment_id,
        (SELECT cta.name
         FROM company_target_applications cta
         WHERE cta.id = chatbot_api_keys.target_app_id) AS target_app_name,
        COALESCE((SELECT name FROM target_app_environments WHERE id = chatbot_api_keys.environment_id), '') AS environment,
        COALESCE(chatbot_api_keys.status, CASE WHEN chatbot_api_keys.is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        chatbot_api_keys.is_active,
        COALESCE(chatbot_api_keys.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        chatbot_api_keys.expires_at,
        chatbot_api_keys.last_used_at,
        chatbot_api_keys.created_at,
        chatbot_api_keys.updated_at
    `,
    values
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key not found.", 404);
  }

  return mapChatbotApiKeyRow(result.rows[0]);
}

export async function rotateChatbotApiKey(session: AdminSession, apiKeyId: string) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const current = await getPool().query<{ environment: string; status: ChatbotApiKeyStatus }>(
    `
      SELECT
        COALESCE(env.normalized_name, 'production') AS environment,
        COALESCE(k.status, 'active')::text AS status
      FROM chatbot_api_keys k
      LEFT JOIN target_app_environments env ON env.id = k.environment_id
      WHERE k.id = $1
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = k.target_app_id
            AND cta.company_id = $2
            AND cta.deleted_at IS NULL
        )
      LIMIT 1
    `,
    [apiKeyId, companyId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key not found.", 404);
  }

  if (current.rows[0].status === "revoked") {
    throw new ChatbotSettingsError("Revoked API keys cannot be rotated.", 400);
  }

  await ensureNoOtherActiveKeyInEnvironment(companyId, current.rows[0].environment, apiKeyId);

  const generated = generateChatbotApiKey(current.rows[0].environment);

  await getPool().query(
    `
      UPDATE chatbot_api_keys
      SET key_hash = $1,
          key_prefix = $2,
          status = 'active',
          is_active = true,
           rotated_at = now(),
           rotated_by = $3,
          updated_by = $3,
          updated_at = now()
      WHERE id = $4
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = chatbot_api_keys.target_app_id
            AND cta.company_id = $5
            AND cta.deleted_at IS NULL
        )
    `,
    [generated.keyHash, generated.keyPrefix, session.user.id, apiKeyId, companyId]
  );

  const refreshed = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment_id: string;
    environment: string;
    status: ChatbotApiKeyStatus;
    is_active: boolean;
    allowed_origins_json: string[] | null;
    expires_at: Date | null;
    last_used_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT
        k.id,
        k.name,
        k.key_prefix,
        k.target_app_id,
        cta.name AS target_app_name,
        k.environment_id,
        COALESCE(env.name, '') AS environment,
        COALESCE(k.status, CASE WHEN k.is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        k.is_active,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        k.expires_at,
        k.last_used_at,
        k.created_at,
        k.updated_at
      FROM chatbot_api_keys k
      LEFT JOIN company_target_applications cta ON cta.id = k.target_app_id
      LEFT JOIN target_app_environments env ON env.id = k.environment_id
      WHERE k.id = $1
        AND cta.company_id = $2
      LIMIT 1
    `,
    [apiKeyId, companyId]
  );

  if ((refreshed.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key not found.", 404);
  }

  const record = mapChatbotApiKeyRow(refreshed.rows[0]);

  return {
    apiKey: generated.secret,
    record: {
      ...record,
      keyPrefix: generated.keyPrefix,
      status: "active" as const,
      isActive: true
    }
  };
}

export async function listChatbotKeyEnvironments(session: AdminSession, targetAppId: string): Promise<ChatbotKeyEnvironmentRecord[]> {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);
  await assertTargetAppAccess(session, companyId, targetAppId);

  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    name: string;
    url: string;
    is_production: boolean;
    activity_logging_enabled: boolean;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT id, target_app_id, name, url, is_production, activity_logging_enabled, created_at, updated_at
      FROM target_app_environments
      WHERE target_app_id = $1
      ORDER BY name ASC
    `,
    [targetAppId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    targetAppId: row.target_app_id,
    name: row.name,
    url: row.url,
    isProduction: row.is_production,
    activityLoggingEnabled: row.activity_logging_enabled,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
}

export async function createChatbotKeyEnvironment(session: AdminSession, targetAppId: string, nameInput: string, urlInput: string, isProduction: boolean, activityLoggingEnabled: boolean) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);
  await assertTargetAppAccess(session, companyId, targetAppId);

  const name = String(nameInput || "").trim();
  if (exceedsCharacterLimit(name, INPUT_LIMITS.environmentName)) {
    throw new ChatbotSettingsError(`Environment name must be ${INPUT_LIMITS.environmentName} characters or fewer.`, 400);
  }
  const normalized = normalizeEnvironment(name);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment name is required.", 400);
  }
  const url = normalizeAndValidateUrl(urlInput);

  await getPool().query(
    `
      INSERT INTO target_app_environments (
        target_app_id,
        name,
        normalized_name,
        url,
        is_production,
        activity_logging_enabled,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    `,
    [targetAppId, normalized, normalized, url, isProduction === true, activityLoggingEnabled === true, session.user.id]
  ).catch((error: unknown) => {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ChatbotSettingsError("Environment already exists.", 409);
    }
    throw error;
  });

  return listChatbotKeyEnvironments(session, targetAppId);
}

export async function updateChatbotKeyEnvironment(session: AdminSession, id: string, nameInput: string, urlInput: string, isProduction: boolean, activityLoggingEnabled: boolean) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const name = String(nameInput || "").trim();
  if (exceedsCharacterLimit(name, INPUT_LIMITS.environmentName)) {
    throw new ChatbotSettingsError(`Environment name must be ${INPUT_LIMITS.environmentName} characters or fewer.`, 400);
  }
  const normalized = normalizeEnvironment(name);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment name is required.", 400);
  }
  const url = normalizeAndValidateUrl(urlInput);

  const existing = await getPool().query<{ normalized_name: string; target_app_id: string }>(
    `
      SELECT normalized_name, target_app_id
      FROM target_app_environments
      WHERE id = $1
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = target_app_environments.target_app_id
            AND cta.company_id = $2
            AND cta.deleted_at IS NULL
        )
      LIMIT 1
    `,
    [id, companyId]
  );

  if ((existing.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Environment not found.", 404);
  }

  await assertTargetAppAccess(session, companyId, existing.rows[0].target_app_id);

  await getPool().query(
    `
      UPDATE target_app_environments
      SET name = $1,
          normalized_name = $2,
          url = $3,
          is_production = $4,
          activity_logging_enabled = $5,
          updated_by = $6,
          updated_at = now()
      WHERE id = $7
        AND target_app_id = $8
    `,
    [normalized, normalized, url, isProduction === true, activityLoggingEnabled === true, session.user.id, id, existing.rows[0].target_app_id]
  ).catch((error: unknown) => {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ChatbotSettingsError("Environment already exists.", 409);
    }
    throw error;
  });

  // No key-row update needed; keys reference environment by environment_id.

  return listChatbotKeyEnvironments(session, existing.rows[0].target_app_id);
}

export async function deleteChatbotKeyEnvironment(session: AdminSession, id: string) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const envResult = await getPool().query<{ id: string; target_app_id: string }>(
    `
      SELECT id, target_app_id
      FROM target_app_environments
      WHERE id = $1
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = target_app_environments.target_app_id
            AND cta.company_id = $2
            AND cta.deleted_at IS NULL
        )
      LIMIT 1
    `,
    [id, companyId]
  );

  if ((envResult.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Environment not found.", 404);
  }

  await assertTargetAppAccess(session, companyId, envResult.rows[0].target_app_id);

  const inUse = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM chatbot_api_keys
      WHERE environment_id = $1
      LIMIT 1
    `,
    [envResult.rows[0].id]
  );

  if ((inUse.rowCount ?? 0) > 0) {
    throw new ChatbotSettingsError("Environment is in use by one or more API keys and cannot be deleted.", 409);
  }

  await getPool().query(
    `
      DELETE FROM target_app_environments
      WHERE id = $1
        AND target_app_id = $2
    `,
    [id, envResult.rows[0].target_app_id]
  );

  return listChatbotKeyEnvironments(session, envResult.rows[0].target_app_id);
}

function mapChatbotEmbedPackageRow(row: {
  id: string;
  target_app_id: string;
  target_app_name: string;
  environment_id?: string;
  environment: string;
  user_id_placeholder: string;
  scout_url: string;
  api_url: string;
  assistant_name: string;
  api_key_prefix: string;
  created_at: Date;
  updated_at: Date;
}): ChatbotEmbedPackageRecord {
  return {
    id: row.id,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    environment: row.environment,
    userId: row.user_id_placeholder,
    scoutUrl: row.scout_url,
    apiUrl: row.api_url,
    assistantName: row.assistant_name,
    apiKeyPrefix: row.api_key_prefix,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listChatbotEmbedPackages(
  session: AdminSession,
  options?: { targetAppId?: string }
): Promise<ChatbotEmbedPackageRecord[]> {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const targetAppId = typeof options?.targetAppId === "string" && options.targetAppId.trim()
    ? options.targetAppId.trim()
    : null;

  if (targetAppId) {
    await assertTargetAppAccess(session, companyId, targetAppId);
  }

  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    environment_id: string;
    environment: string;
    user_id_placeholder: string;
    scout_url: string;
    api_url: string;
    assistant_name: string;
    api_key_prefix: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT
        p.id,
        p.target_app_id,
        cta.name AS target_app_name,
        p.environment_id,
        env.name AS environment,
        p.user_id_placeholder,
        p.scout_url,
        p.api_url,
        p.assistant_name,
        p.api_key_prefix,
        p.created_at,
        p.updated_at
      FROM chatbot_embed_packages p
      INNER JOIN company_target_applications cta ON cta.id = p.target_app_id
      INNER JOIN chatbot_api_keys k
        ON k.target_app_id = p.target_app_id
       AND k.environment_id = p.environment_id
       AND k.key_prefix = p.api_key_prefix
       AND (k.target_app_id IS NULL OR k.target_app_id = p.target_app_id)
      INNER JOIN target_app_environments env ON env.id = p.environment_id
      WHERE cta.company_id = $1
        AND p.deleted_at IS NULL
        AND COALESCE(k.status, CASE WHEN k.is_active THEN 'active' ELSE 'suspended' END) = 'active'
        AND k.is_active = true
        AND ($2::uuid IS NULL OR p.target_app_id = $2)
      ORDER BY env.name ASC, p.updated_at DESC
    `,
    [companyId, targetAppId]
  );

  return result.rows.map(mapChatbotEmbedPackageRow);
}

export async function getChatbotEmbedPackageSecret(
  session: AdminSession,
  id: string
): Promise<{ apiKey: string } | null> {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const result = await getPool().query<{ api_key_plaintext: string }>(
    `
      SELECT api_key_plaintext
      FROM chatbot_embed_packages
      WHERE id = $2
        AND EXISTS (
          SELECT 1
          FROM company_target_applications cta
          WHERE cta.id = chatbot_embed_packages.target_app_id
            AND cta.company_id = $1
            AND cta.deleted_at IS NULL
        )
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [companyId, id]
  );

  if ((result.rowCount ?? 0) === 0) {
    return null;
  }

  return { apiKey: result.rows[0].api_key_plaintext };
}

export async function resolveChatbotApiKeyContext(
  session: AdminSession,
  input: { apiKey: string; targetAppId?: string }
) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) {
    throw new ChatbotSettingsError("API key is required.", 400);
  }

  const targetAppId = typeof input.targetAppId === "string" && input.targetAppId.trim()
    ? input.targetAppId.trim()
    : null;

  if (targetAppId) {
    await assertTargetAppAccess(session, companyId, targetAppId);
  }

  const result = await getPool().query<{
    id: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment_id: string;
    environment: string;
    name: string;
    key_prefix: string;
  }>(
    `
      SELECT
        k.id,
        k.target_app_id,
        cta.name AS target_app_name,
        k.environment_id,
        COALESCE(env.name, '') AS environment,
        k.name,
        k.key_prefix
      FROM chatbot_api_keys k
      LEFT JOIN company_target_applications cta ON cta.id = k.target_app_id
      LEFT JOIN target_app_environments env ON env.id = k.environment_id
      WHERE cta.company_id = $1
        AND k.key_hash = $2
        AND k.status = 'active'
        AND k.is_active = true
        AND (k.expires_at IS NULL OR k.expires_at > now())
        AND ($3::uuid IS NULL OR k.target_app_id = $3)
      LIMIT 1
    `,
    [companyId, hashSecret(apiKey), targetAppId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key was not found for this company.", 404);
  }

  const row = result.rows[0];
  return {
    id: row.id,
    targetAppId: row.target_app_id,
    targetAppName: row.target_app_name,
    environment: row.environment,
    name: row.name,
    keyPrefix: row.key_prefix,
  };
}

export async function upsertChatbotEmbedPackage(session: AdminSession, input: UpsertChatbotEmbedPackageInput) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const targetAppId = String(input.targetAppId || "").trim();
  const environment = normalizeEnvironment(input.environment);
  const apiKey = String(input.apiKey || "").trim();
  const userId = String(input.userId || "").trim();
  const scoutUrl = normalizeUrl(input.scoutUrl, "http://localhost:3000");
  const apiUrl = normalizeUrl(input.apiUrl, "http://localhost:4200");
  const assistantName = String(input.assistantName || "Scout Assistant").trim() || "Scout Assistant";

  if (exceedsCharacterLimit(userId, INPUT_LIMITS.chatbotEmbedUserId)) {
    throw new ChatbotSettingsError(`User id placeholder must be ${INPUT_LIMITS.chatbotEmbedUserId} characters or fewer.`, 400);
  }
  if (exceedsCharacterLimit(assistantName, INPUT_LIMITS.chatbotAssistantName)) {
    throw new ChatbotSettingsError(`Assistant name must be ${INPUT_LIMITS.chatbotAssistantName} characters or fewer.`, 400);
  }

  if (!targetAppId) {
    throw new ChatbotSettingsError("Target app is required.", 400);
  }
  if (!environment) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }
  if (!apiKey) {
    throw new ChatbotSettingsError("A plaintext API key is required to generate package snippets.", 400);
  }
  if (!userId) {
    throw new ChatbotSettingsError("A user id placeholder is required.", 400);
  }

  await assertTargetAppAccess(session, companyId, targetAppId);
  await assertEnvironmentExists(session, companyId, targetAppId, environment);

  const matchedApiKey = await getPool().query<{
    id: string;
    environment_id: string;
    environment: string;
    target_app_id: string | null;
  }>(
    `
      SELECT
        k.id,
        k.environment_id,
        COALESCE(env.normalized_name, '') AS environment,
        k.target_app_id
      FROM chatbot_api_keys k
      INNER JOIN company_target_applications cta ON cta.id = k.target_app_id
      LEFT JOIN target_app_environments env ON env.id = k.environment_id
      WHERE k.target_app_id = $1
        AND k.key_hash = $2
        AND k.status = 'active'
        AND k.is_active = true
        AND (k.expires_at IS NULL OR k.expires_at > now())
      LIMIT 1
    `,
    [targetAppId, hashSecret(apiKey)]
  );

  if ((matchedApiKey.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Only active API keys can be used to generate snippets.", 400);
  }

  const matched = matchedApiKey.rows[0];
  if (normalizeEnvironment(matched.environment) !== environment) {
    throw new ChatbotSettingsError("Selected environment does not match the API key environment.", 400);
  }

  if (matched.target_app_id && matched.target_app_id !== targetAppId) {
    throw new ChatbotSettingsError("Selected target app does not match the API key scope.", 400);
  }

  const payload = await getChatbotLifecycleSettingsAdminPayload(session);
  const targetApp = payload.targetApps.find((item) => item.id === targetAppId);
  if (!targetApp) {
    throw new ChatbotSettingsError("Selected target app is invalid.", 400);
  }

  const packageData = buildChatbotEmbedPackage({
    scoutUrl,
    apiUrl,
    apiKey,
    userId,
    targetAppId: targetApp.id,
    targetAppName: targetApp.name,
    assistantName,
  });

  const apiKeyPrefix = apiKey.slice(0, 18);

  const result = await getPool().query<{
    id: string;
    target_app_id: string;
    target_app_name: string;
    environment: string;
    user_id_placeholder: string;
    scout_url: string;
    api_url: string;
    assistant_name: string;
    api_key_prefix: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      INSERT INTO chatbot_embed_packages (
        id,
        target_app_id,
        environment_id,
        api_key_plaintext,
        api_key_prefix,
        user_id_placeholder,
        scout_url,
        api_url,
        assistant_name,
        created_by,
        updated_by,
        deleted_at
      )
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, (SELECT id FROM target_app_environments WHERE target_app_id = $2 AND normalized_name = $3 LIMIT 1), $4, $5, $6, $7, $8, $9, $10, $10, NULL)
      ON CONFLICT (id)
      DO UPDATE SET
        target_app_id = EXCLUDED.target_app_id,
        environment_id = EXCLUDED.environment_id,
        api_key_plaintext = EXCLUDED.api_key_plaintext,
        api_key_prefix = EXCLUDED.api_key_prefix,
        user_id_placeholder = EXCLUDED.user_id_placeholder,
        scout_url = EXCLUDED.scout_url,
        api_url = EXCLUDED.api_url,
        assistant_name = EXCLUDED.assistant_name,
        updated_by = EXCLUDED.updated_by,
        updated_at = now(),
        deleted_at = NULL
      WHERE chatbot_embed_packages.id = EXCLUDED.id
      RETURNING
        chatbot_embed_packages.id,
        chatbot_embed_packages.target_app_id,
        (SELECT name FROM company_target_applications WHERE id = chatbot_embed_packages.target_app_id) AS target_app_name,
        chatbot_embed_packages.environment_id,
        (SELECT name FROM target_app_environments WHERE id = chatbot_embed_packages.environment_id) AS environment,
        chatbot_embed_packages.user_id_placeholder,
        chatbot_embed_packages.scout_url,
        chatbot_embed_packages.api_url,
        chatbot_embed_packages.assistant_name,
        chatbot_embed_packages.api_key_prefix,
        chatbot_embed_packages.created_at,
        chatbot_embed_packages.updated_at
    `,
    [
      input.id ?? null,
      targetAppId,
      environment,
      apiKey,
      apiKeyPrefix,
      userId,
      scoutUrl,
      apiUrl,
      assistantName,
      session.user.id,
    ]
  );

  return {
    packageData,
    record: mapChatbotEmbedPackageRow(result.rows[0]),
  };
}

export function buildChatbotEmbedPackage(input: {
  scoutUrl: string;
  apiUrl: string;
  apiKey: string;
  userId: string;
  targetAppId: string;
  targetAppName: string;
  assistantName?: string;
}) {
  const targetAppToken = obfuscateGuid({ id: input.targetAppId, type: "target_app" });
  const assistantName = input.assistantName || "Scout Assistant";
  const configVarName = `${sanitizeConfigVarBase(input.targetAppName)}ScoutChatbotConfig`;

  const baseConfigJson = JSON.stringify({
    scoutUrl: input.scoutUrl,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    userId: input.userId,
    targetAppId: targetAppToken,
    targetAppName: input.targetAppName,
    assistantName
  }, null, 2);

  const configSnippet = `window.${configVarName} = ${baseConfigJson.slice(0, -2)},
  // White-label theme options below may be modified by the client.
  //"themeCss": "",
  //"theme": {
  //  "primaryColor": "#0052CC",
  //  "secondaryColor": "#F4F6F8",
  //  "accentColor": "#00A3FF",
  //  "textColor": "#1A1A1A",
  //  "backgroundColor": "#FFFFFF",
  //  "borderRadius": "12px",
  //  "fontFamily": "'Inter', sans-serif",
  //  "logo": "https://client.com/logo.png",
  //  "launcherIcon": "https://client.com/chat-icon.svg",
  //  "position": "bottom-right",
  //  "darkMode": false
  //}
};\n`;

  const installSnippet = `const config = window.${configVarName};
if (config) {
  if (config.themeCss) {
    const themeLoader = document.createElement("link");
    themeLoader.id = "nv-scout-chatbot-theme";
    themeLoader.rel = "stylesheet";
    themeLoader.href = config.themeCss;
    document.head.appendChild(themeLoader);
  }
  const loader = document.createElement("script");
  loader.id = "nv-scout-chatbot-loader";
  loader.src = \`${'${config.scoutUrl.replace(/\\\/$/, "")}'}/scout-chatbot.js?v=1.1.3\`;
  loader.async = true;
  loader.onload = () => window.ScoutChatbot.install(config);
  loader.onerror = () => console.error("ScoutChatbot could not load. Confirm the Scout host is available.");
  document.head.appendChild(loader);
}
`;

  const htmlSample = `<script src=\"./scout-chatbot-config.local.js\"></script>\n<script src=\"./scout-chatbot-install.js\"></script>`;

  const reactSample = `import { useEffect } from \"react\";\n\nexport function ScoutChatbotLoader() {\n  useEffect(() => {\n    const configScript = document.createElement(\"script\");\n    configScript.src = \"/scout-chatbot-config.local.js\";\n    configScript.onload = () => {\n      const installScript = document.createElement(\"script\");\n      installScript.src = \"/scout-chatbot-install.js\";\n      document.body.appendChild(installScript);\n    };\n    document.body.appendChild(configScript);\n    return () => {\n      document.getElementById(\"nv-scout-chatbot-loader\")?.remove();\n    };\n  }, []);\n\n  return null;\n}\n`;

  return {
    configSnippet,
    installSnippet,
    htmlSample,
    reactSample,
    obfuscatedTargetAppId: targetAppToken
  };
}
