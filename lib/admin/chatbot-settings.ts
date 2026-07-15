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
  environment: string;
  allowedOrigins?: string[];
  expiresAt?: string | null;
};

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
  const normalized = String(value || "production").trim().toLowerCase();
  if (!normalized) return "production";
  return normalized.slice(0, 32);
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
        id,
        name,
        key_prefix,
        COALESCE(environment, 'production') AS environment,
        COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        is_active,
        COALESCE(allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        expires_at,
        last_used_at,
        created_at,
        updated_at
      FROM chatbot_api_keys
      WHERE company_id = $1
      ORDER BY created_at DESC
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
  const allowedOrigins = normalizeOrigins(input.allowedOrigins);
  const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

  const generated = generateChatbotApiKey(environment);

  const result = await getPool().query<{
    id: string;
    name: string;
    key_prefix: string;
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
        company_id,
        name,
        key_prefix,
        key_hash,
        is_active,
        status,
        environment,
        allowed_origins_json,
        expires_at,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, true, 'active', $5, $6::jsonb, $7, $8, $8)
      RETURNING
        id,
        name,
        key_prefix,
        environment,
        status,
        is_active,
        COALESCE(allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        expires_at,
        last_used_at,
        created_at,
        updated_at
    `,
    [
      companyId,
      name,
      generated.keyPrefix,
      generated.keyHash,
      environment,
      JSON.stringify(allowedOrigins),
      expiresAt,
      session.user.id
    ]
  );

  return {
    apiKey: generated.secret,
    record: mapChatbotApiKeyRow(result.rows[0])
  };
}

export async function updateChatbotApiKey(
  session: AdminSession,
  apiKeyId: string,
  input: {
    status?: ChatbotApiKeyStatus;
    name?: string;
    environment?: string;
    allowedOrigins?: string[];
    expiresAt?: string | null;
  }
) {
  const companyId = session.user.tenantId;
  await assertCompanyAccess(session, companyId);

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
    values.push(normalizeEnvironment(input.environment));
    index += 1;
  }

  if (Array.isArray(input.allowedOrigins)) {
    updates.push(`allowed_origins_json = $${index}::jsonb`);
    values.push(JSON.stringify(normalizeOrigins(input.allowedOrigins)));
    index += 1;
  }

  if (Object.prototype.hasOwnProperty.call(input, "expiresAt")) {
    updates.push(`expires_at = $${index}`);
    values.push(input.expiresAt ? new Date(input.expiresAt) : null);
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
        AND company_id = $${index + 1}
      RETURNING
        id,
        name,
        key_prefix,
        COALESCE(environment, 'production') AS environment,
        COALESCE(status, CASE WHEN is_active THEN 'active' ELSE 'suspended' END)::text AS status,
        is_active,
        COALESCE(allowed_origins_json, '[]'::jsonb) AS allowed_origins_json,
        expires_at,
        last_used_at,
        created_at,
        updated_at
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

  const current = await getPool().query<{ environment: string }>(
    "SELECT COALESCE(environment, 'production') AS environment FROM chatbot_api_keys WHERE id = $1 AND company_id = $2",
    [apiKeyId, companyId]
  );

  if ((current.rowCount ?? 0) === 0) {
    throw new ChatbotSettingsError("API key not found.", 404);
  }

  const generated = generateChatbotApiKey(current.rows[0].environment);

  const record = await updateChatbotApiKey(session, apiKeyId, { status: "active" });

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
  brandColor?: string;
  accentColor?: string;
}) {
  const companyToken = obfuscateGuid({ id: input.companyId, type: "company" });
  const targetAppToken = obfuscateGuid({ id: input.targetAppId, type: "target_app" });
  const assistantName = input.assistantName || "Scout Assistant";
  const brandColor = input.brandColor || "#111827";
  const accentColor = input.accentColor || "#0ea5e9";

  const configSnippet = `window.NexusVendorScoutChatbotConfig = ${JSON.stringify({
    scoutUrl: input.scoutUrl,
    apiUrl: input.apiUrl,
    apiKey: input.apiKey,
    companyId: companyToken,
    companyName: input.companyName,
    userId: input.userId,
    targetAppId: targetAppToken,
    targetAppName: input.targetAppName,
    assistantName,
    brandColor,
    accentColor
  }, null, 2)};\n`;

  const installSnippet = `const config = window.NexusVendorScoutChatbotConfig;\nif (config) {\n  const loader = document.createElement(\"script\");\n  loader.id = \"nv-scout-chatbot-loader\";\n  loader.src = \`${'${config.scoutUrl.replace(/\\\/$/, "")}'}/scout-chatbot.js?v=1.1.0\`;\n  loader.async = true;\n  loader.onload = () => window.ScoutChatbot.install(config);\n  loader.onerror = () => console.error(\"ScoutChatbot could not load. Confirm the Scout host is available.\");\n  document.head.appendChild(loader);\n}\n`;

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
