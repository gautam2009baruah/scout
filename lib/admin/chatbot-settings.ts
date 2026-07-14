import { getPool } from "@/lib/db/pool";
import type { AdminSession } from "./auth";
import { listGuidedWorkflowTargetApps } from "./guided-workflows";
import { ChatbotLifecycleSettingsRecord, DEFAULT_CHATBOT_LIFECYCLE_SETTINGS, listChatbotLifecycleSettings, mergeLifecycleSettings } from "@/lib/chat/lifecycle-settings";

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

  const [settings, targetApps] = await Promise.all([
    listChatbotLifecycleSettings(companyId),
    listGuidedWorkflowTargetApps(session)
  ]);

  return {
    defaults: DEFAULT_CHATBOT_LIFECYCLE_SETTINGS,
    settings,
    targetApps: targetApps.filter((app) => app.companyId === companyId).map((app) => ({
      id: app.id,
      name: app.name,
      companyId: app.companyId
    }))
  };
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
