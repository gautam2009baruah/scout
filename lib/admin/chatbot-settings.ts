import { getPool } from "@/lib/db/pool";
import { createHash, randomBytes } from "node:crypto";
import type { AdminSession } from "./auth";
import { listGuidedWorkflowTargetApps } from "./guided-workflows";
import { ChatbotLifecycleSettingsRecord, DEFAULT_CHATBOT_LIFECYCLE_SETTINGS, listChatbotLifecycleSettings, mergeLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import { obfuscateGuid } from "@/lib/chat/embed-id-token";

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
    canUseCompanyLevelApiKeys: await canUseCompanyLevelApiKeys(session, companyId),
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
        company_id,
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
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, NULL)
      ON CONFLICT (company_id, (COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid)))
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
      RETURNING id, company_id, target_app_id, max_context_messages, max_context_tokens, inactivity_timeout_seconds,
                reset_on_logout_event, reset_on_user_change, reset_on_target_app_change
    `,
    [
      companyId,
      input.targetAppId ?? null,
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

  await getPool().query(
    `
      UPDATE chatbot_lifecycle_settings
      SET deleted_at = now(), updated_by = $3, updated_at = now()
      WHERE company_id = $1
        AND ((target_app_id IS NULL AND $2::uuid IS NULL) OR target_app_id = $2)
        AND deleted_at IS NULL
    `,
    [companyId, targetAppId ?? null, session.user.id]
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
  strictEnvironmentEnforcement: boolean;
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
  strictEnvironmentEnforcement?: boolean;
  allowedOrigins?: string[];
  expiresAt?: string | null;
};

export type ChatbotKeyEnvironmentRecord = {
  id: string;
  name: string;
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
  return normalized.slice(0, 32);
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

async function assertEnvironmentExists(session: AdminSession, companyId: string, environment: string) {
  const normalized = normalizeEnvironment(environment);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }

  const result = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM chatbot_api_key_environments
      WHERE company_id = $1
        AND normalized_name = $2
      LIMIT 1
    `,
    [companyId, normalized]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Selected environment is not available. Create it first.", 400);
  }
}

async function ensureNoOtherActiveKeyInEnvironment(
  companyId: string,
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
      FROM chatbot_api_keys
      WHERE company_id = $1
        AND environment = $2
        AND status = 'active'
        AND is_active = true
        AND ($3::uuid IS NULL OR id <> $3)
      LIMIT 1
    `,
    [companyId, normalized, excludeApiKeyId ?? null]
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
        INNER JOIN guided_workflow_target_apps gta ON gta.id = uta.target_app_id
        WHERE uta.user_id = $1
          AND gta.company_id = $2
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
      SELECT id
      FROM chatbot_api_keys
      WHERE company_id = $1
        AND (($2::uuid IS NULL AND target_app_id IS NULL) OR target_app_id = $2)
        AND lower(trim(name)) = $3
        AND status <> 'revoked'
        AND ($4::uuid IS NULL OR id <> $4)
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
  environment: string;
  strict_environment_enforcement: boolean;
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
    strictEnvironmentEnforcement: row.strict_environment_enforcement === true,
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
    environment: string;
    strict_environment_enforcement: boolean;
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
        gta.name AS target_app_name,
        COALESCE(k.environment, '') AS environment,
        COALESCE(k.strict_environment_enforcement, false) AS strict_environment_enforcement,
        COALESCE(k.status, CASE WHEN k.is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        k.is_active,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        k.expires_at,
        k.last_used_at,
        k.created_at,
        k.updated_at
      FROM chatbot_api_keys k
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = k.target_app_id
      WHERE k.company_id = $1
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
  await assertEnvironmentExists(session, companyId, environment);

  const targetAppId = input.targetAppId ?? null;
  await assertTargetAppAccess(session, companyId, targetAppId);
  await assertCompanyLevelApiKeyScopeAllowed(session, companyId, targetAppId);

  const allowedOrigins = normalizeOrigins(input.allowedOrigins);
  if (allowedOrigins.length === 0) {
    throw new ChatbotSettingsError("At least one allowed origin is required.", 400);
  }
  const expiresAt = parseExpiryDate(input.expiresAt);
  const strictEnvironmentEnforcement = input.strictEnvironmentEnforcement === true;

  await assertUniqueApiKeyNamePerTargetApp(companyId, targetAppId, name, "active");

  const existingActive = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM chatbot_api_keys
      WHERE company_id = $1
        AND environment = $2
        AND status = 'active'
        AND is_active = true
      LIMIT 1
    `,
    [companyId, environment]
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
    strict_environment_enforcement: boolean;
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
        company_id,
        name,
        key_prefix,
        key_hash,
        target_app_id,
        strict_environment_enforcement,
        is_active,
        status,
        environment,
        allowed_origins_json,
        expires_at,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $12)
      RETURNING
        chatbot_api_keys.id,
        chatbot_api_keys.name,
        chatbot_api_keys.key_prefix,
        chatbot_api_keys.target_app_id,
        (SELECT name FROM guided_workflow_target_apps WHERE id = chatbot_api_keys.target_app_id) AS target_app_name,
        chatbot_api_keys.environment,
        COALESCE(chatbot_api_keys.strict_environment_enforcement, false) AS strict_environment_enforcement,
        chatbot_api_keys.status,
        chatbot_api_keys.is_active,
        COALESCE(chatbot_api_keys.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        chatbot_api_keys.expires_at,
        chatbot_api_keys.last_used_at,
        chatbot_api_keys.created_at,
        chatbot_api_keys.updated_at
    `,
    [
      companyId,
      name,
      generated.keyPrefix,
      generated.keyHash,
      targetAppId,
      strictEnvironmentEnforcement,
      initialIsActive,
      initialStatus,
      environment,
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
    strictEnvironmentEnforcement?: boolean;
    allowedOrigins?: string[];
    expiresAt?: string | null;
  }
) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const current = await getPool().query<{
    name: string;
    environment: string;
    status: ChatbotApiKeyStatus;
    target_app_id: string | null;
    strict_environment_enforcement: boolean;
  }>(
    `
      SELECT
        name,
        COALESCE(environment, '') AS environment,
        COALESCE(status, 'active')::text AS status,
        target_app_id,
        COALESCE(strict_environment_enforcement, false) AS strict_environment_enforcement
      FROM chatbot_api_keys
      WHERE id = $1
        AND company_id = $2
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

  await assertEnvironmentExists(session, companyId, nextEnvironment);

  if (Object.prototype.hasOwnProperty.call(input, "targetAppId")) {
    await assertTargetAppAccess(session, companyId, nextTargetAppId);
    await assertCompanyLevelApiKeyScopeAllowed(session, companyId, nextTargetAppId);
  }

  if (input.status === "active" && current.rows[0].status !== "suspended") {
    throw new ChatbotSettingsError("Only suspended API keys can be re-activated.", 400);
  }

  if (nextStatus === "active") {
    await ensureNoOtherActiveKeyInEnvironment(companyId, nextEnvironment, apiKeyId);
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
    updates.push(`environment = $${index}`);
    values.push(nextEnvironment);
    index += 1;
  }

  if (Object.prototype.hasOwnProperty.call(input, "targetAppId")) {
    updates.push(`target_app_id = $${index}`);
    values.push(input.targetAppId ?? null);
    index += 1;
  }

  if (typeof input.strictEnvironmentEnforcement === "boolean") {
    updates.push(`strict_environment_enforcement = $${index}`);
    values.push(input.strictEnvironmentEnforcement === true);
    index += 1;
  }

  if (Array.isArray(input.allowedOrigins)) {
    throw new ChatbotSettingsError("Allowed origins cannot be edited after API key creation.", 400);
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
    strict_environment_enforcement: boolean;
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
        AND company_id = $${index + 1}
      RETURNING
        chatbot_api_keys.id,
        chatbot_api_keys.name,
        chatbot_api_keys.key_prefix,
        chatbot_api_keys.target_app_id,
        (SELECT name FROM guided_workflow_target_apps WHERE id = chatbot_api_keys.target_app_id) AS target_app_name,
        COALESCE(chatbot_api_keys.environment, '') AS environment,
        COALESCE(chatbot_api_keys.strict_environment_enforcement, false) AS strict_environment_enforcement,
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
    "SELECT COALESCE(environment, 'production') AS environment, COALESCE(status, 'active')::text AS status FROM chatbot_api_keys WHERE id = $1 AND company_id = $2",
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
        AND company_id = $5
    `,
    [generated.keyHash, generated.keyPrefix, session.user.id, apiKeyId, companyId]
  );

  const refreshed = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
    target_app_id: string | null;
    target_app_name: string | null;
    environment: string;
    strict_environment_enforcement: boolean;
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
        gta.name AS target_app_name,
        COALESCE(k.environment, '') AS environment,
        COALESCE(k.strict_environment_enforcement, false) AS strict_environment_enforcement,
        COALESCE(k.status, CASE WHEN k.is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        k.is_active,
        COALESCE(k.allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        k.expires_at,
        k.last_used_at,
        k.created_at,
        k.updated_at
      FROM chatbot_api_keys k
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = k.target_app_id
      WHERE k.id = $1
        AND k.company_id = $2
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

export async function listChatbotKeyEnvironments(session: AdminSession): Promise<ChatbotKeyEnvironmentRecord[]> {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const result = await getPool().query<{
    id: string;
    name: string;
    created_at: Date;
    updated_at: Date;
  }>(
    `
      SELECT id, name, created_at, updated_at
      FROM chatbot_api_key_environments
      WHERE company_id = $1
      ORDER BY name ASC
    `,
    [companyId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  }));
}

export async function createChatbotKeyEnvironment(session: AdminSession, nameInput: string) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const name = String(nameInput || "").trim();
  const normalized = normalizeEnvironment(name);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment name is required.", 400);
  }

  await getPool().query(
    `
      INSERT INTO chatbot_api_key_environments (
        company_id,
        name,
        normalized_name,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $4)
    `,
    [companyId, normalized, normalized, session.user.id]
  ).catch((error: unknown) => {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ChatbotSettingsError("Environment already exists.", 409);
    }
    throw error;
  });

  return listChatbotKeyEnvironments(session);
}

export async function updateChatbotKeyEnvironment(session: AdminSession, id: string, nameInput: string) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const normalized = normalizeEnvironment(nameInput);
  if (!normalized) {
    throw new ChatbotSettingsError("Environment name is required.", 400);
  }

  const existing = await getPool().query<{ normalized_name: string }>(
    `
      SELECT normalized_name
      FROM chatbot_api_key_environments
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
    `,
    [id, companyId]
  );

  if ((existing.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Environment not found.", 404);
  }

  const previousNormalized = existing.rows[0].normalized_name;

  await getPool().query(
    `
      UPDATE chatbot_api_key_environments
      SET name = $1,
          normalized_name = $2,
          updated_by = $3,
          updated_at = now()
      WHERE id = $4
        AND company_id = $5
    `,
    [normalized, normalized, session.user.id, id, companyId]
  ).catch((error: unknown) => {
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new ChatbotSettingsError("Environment already exists.", 409);
    }
    throw error;
  });

  await getPool().query(
    `
      UPDATE chatbot_api_keys
      SET environment = $1,
          updated_by = $2,
          updated_at = now()
      WHERE company_id = $3
        AND environment = $4
    `,
    [normalized, session.user.id, companyId, previousNormalized]
  );

  return listChatbotKeyEnvironments(session);
}

export async function deleteChatbotKeyEnvironment(session: AdminSession, id: string) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

  const envResult = await getPool().query<{ normalized_name: string }>(
    `
      SELECT normalized_name
      FROM chatbot_api_key_environments
      WHERE id = $1
        AND company_id = $2
      LIMIT 1
    `,
    [id, companyId]
  );

  if ((envResult.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("Environment not found.", 404);
  }

  const inUse = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM chatbot_api_keys
      WHERE company_id = $1
        AND environment = $2
      LIMIT 1
    `,
    [companyId, envResult.rows[0].normalized_name]
  );

  if ((inUse.rowCount ?? 0) > 0) {
    throw new ChatbotSettingsError("Environment is in use by one or more API keys and cannot be deleted.", 409);
  }

  await getPool().query(
    `
      DELETE FROM chatbot_api_key_environments
      WHERE id = $1
        AND company_id = $2
    `,
    [id, companyId]
  );

  return listChatbotKeyEnvironments(session);
}

function mapChatbotEmbedPackageRow(row: {
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
        gta.name AS target_app_name,
        p.environment,
        p.user_id_placeholder,
        p.scout_url,
        p.api_url,
        p.assistant_name,
        p.api_key_prefix,
        p.created_at,
        p.updated_at
      FROM chatbot_embed_packages p
      INNER JOIN guided_workflow_target_apps gta ON gta.id = p.target_app_id
      WHERE p.company_id = $1
        AND p.deleted_at IS NULL
        AND ($2::uuid IS NULL OR p.target_app_id = $2)
      ORDER BY p.updated_at DESC
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
      WHERE company_id = $1
        AND id = $2
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
    environment: string;
    name: string;
    key_prefix: string;
  }>(
    `
      SELECT
        k.id,
        k.target_app_id,
        gta.name AS target_app_name,
        COALESCE(k.environment, '') AS environment,
        k.name,
        k.key_prefix
      FROM chatbot_api_keys k
      LEFT JOIN guided_workflow_target_apps gta ON gta.id = k.target_app_id
      WHERE k.company_id = $1
        AND k.key_hash = $2
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
  const userId = String(input.userId || session.user.id).trim();
  const scoutUrl = normalizeUrl(input.scoutUrl, "http://localhost:3000");
  const apiUrl = normalizeUrl(input.apiUrl, "http://localhost:4200");
  const assistantName = String(input.assistantName || "Scout Assistant").trim() || "Scout Assistant";

  if (!targetAppId) {
    throw new ChatbotSettingsError("Target app is required.", 400);
  }
  if (!environment) {
    throw new ChatbotSettingsError("Environment is required.", 400);
  }
  if (!apiKey) {
    throw new ChatbotSettingsError("A plaintext API key is required to generate package snippets.", 400);
  }

  await assertTargetAppAccess(session, companyId, targetAppId);
  await assertEnvironmentExists(session, companyId, environment);

  const payload = await getChatbotLifecycleSettingsAdminPayload(session);
  const targetApp = payload.targetApps.find((item) => item.id === targetAppId);
  if (!targetApp) {
    throw new ChatbotSettingsError("Selected target app is invalid.", 400);
  }

  const packageData = buildChatbotEmbedPackage({
    scoutUrl,
    apiUrl,
    apiKey,
    companyId: session.user.tenantId,
    companyName: session.tenant.name,
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
        company_id,
        target_app_id,
        environment,
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
      VALUES (COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, NULL)
      ON CONFLICT (id)
      DO UPDATE SET
        target_app_id = EXCLUDED.target_app_id,
        environment = EXCLUDED.environment,
        api_key_plaintext = EXCLUDED.api_key_plaintext,
        api_key_prefix = EXCLUDED.api_key_prefix,
        user_id_placeholder = EXCLUDED.user_id_placeholder,
        scout_url = EXCLUDED.scout_url,
        api_url = EXCLUDED.api_url,
        assistant_name = EXCLUDED.assistant_name,
        updated_by = EXCLUDED.updated_by,
        updated_at = now(),
        deleted_at = NULL
      WHERE chatbot_embed_packages.company_id = EXCLUDED.company_id
      RETURNING
        chatbot_embed_packages.id,
        chatbot_embed_packages.target_app_id,
        (SELECT name FROM guided_workflow_target_apps WHERE id = chatbot_embed_packages.target_app_id) AS target_app_name,
        chatbot_embed_packages.environment,
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
      companyId,
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
  companyId: string;
  companyName: string;
  userId: string;
  targetAppId: string;
  targetAppName: string;
  assistantName?: string;
}) {
  const companyToken = obfuscateGuid({ id: input.companyId, type: "company" });
  const targetAppToken = obfuscateGuid({ id: input.targetAppId, type: "target_app" });
  const assistantName = input.assistantName || "Scout Assistant";
  const configVarName = `${sanitizeConfigVarBase(input.targetAppName)}ScoutChatbotConfig`;

  const configSnippet = `window.${configVarName} = ${JSON.stringify({
    scoutUrl: input.scoutUrl,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    companyId: companyToken,
    companyName: input.companyName,
    userId: input.userId,
    targetAppId: targetAppToken,
    targetAppName: input.targetAppName,
    assistantName
  }, null, 2)};\n`;

  const installSnippet = `const config = window.${configVarName};\nif (config) {\n  const loader = document.createElement(\"script\");\n  loader.id = \"nv-scout-chatbot-loader\";\n  loader.src = \`${'${config.scoutUrl.replace(/\\\/$/, "")}'}/scout-chatbot.js?v=1.1.0\`;\n  loader.async = true;\n  loader.onload = () => window.ScoutChatbot.install(config);\n  loader.onerror = () => console.error(\"ScoutChatbot could not load. Confirm the Scout host is available.\");\n  document.head.appendChild(loader);\n}\n`;

  const htmlSample = `<script src=\"./scout-chatbot-config.local.js\"></script>\n<script src=\"./scout-chatbot-install.js\"></script>`;

  const reactSample = `import { useEffect } from \"react\";\n\nexport function ScoutChatbotLoader() {\n  useEffect(() => {\n    const configScript = document.createElement(\"script\");\n    configScript.src = \"/scout-chatbot-config.local.js\";\n    configScript.onload = () => {\n      const installScript = document.createElement(\"script\");\n      installScript.src = \"/scout-chatbot-install.js\";\n      document.body.appendChild(installScript);\n    };\n    document.body.appendChild(configScript);\n    return () => {\n      document.getElementById(\"nv-scout-chatbot-loader\")?.remove();\n    };\n  }, []);\n\n  return null;\n}\n`;

  return {
    configSnippet,
    installSnippet,
    htmlSample,
    reactSample,
    obfuscatedCompanyId: companyToken,
    obfuscatedTargetAppId: targetAppToken
  };
}
