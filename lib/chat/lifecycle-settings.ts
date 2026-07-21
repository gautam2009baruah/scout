import { getPool } from "@/lib/db/pool";

export type ChatbotLifecycleSettings = {
  maxContextMessages: number;
  maxContextTokens: number;
  inactivityTimeoutSeconds: number;
  resetOnLogoutEvent: boolean;
  resetOnUserChange: boolean;
  resetOnTargetAppChange: boolean;
};

export type ChatbotLifecycleSettingsRecord = ChatbotLifecycleSettings & {
  id: string;
  companyId: string;
  targetAppId: string | null;
};

export const DEFAULT_CHATBOT_LIFECYCLE_SETTINGS: ChatbotLifecycleSettings = {
  maxContextMessages: 20,
  maxContextTokens: 5000,
  inactivityTimeoutSeconds: 1800,
  resetOnLogoutEvent: true,
  resetOnUserChange: true,
  resetOnTargetAppChange: true
};

function mapRow(row: {
  id: string;
  company_id: string;
  target_app_id: string | null;
  max_context_messages: number;
  max_context_tokens: number;
  inactivity_timeout_seconds: number;
  reset_on_logout_event: boolean;
  reset_on_user_change: boolean;
  reset_on_target_app_change: boolean;
}): ChatbotLifecycleSettingsRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    maxContextMessages: Number(row.max_context_messages),
    maxContextTokens: Number(row.max_context_tokens),
    inactivityTimeoutSeconds: Number(row.inactivity_timeout_seconds),
    resetOnLogoutEvent: row.reset_on_logout_event === true,
    resetOnUserChange: row.reset_on_user_change === true,
    resetOnTargetAppChange: row.reset_on_target_app_change === true
  };
}

export function mergeLifecycleSettings(
  base: ChatbotLifecycleSettings,
  override?: Partial<ChatbotLifecycleSettings> | null
): ChatbotLifecycleSettings {
  return {
    maxContextMessages: Math.min(30, Math.max(10, Number(override?.maxContextMessages ?? base.maxContextMessages) || DEFAULT_CHATBOT_LIFECYCLE_SETTINGS.maxContextMessages)),
    maxContextTokens: Math.min(8000, Math.max(3000, Number(override?.maxContextTokens ?? base.maxContextTokens) || DEFAULT_CHATBOT_LIFECYCLE_SETTINGS.maxContextTokens)),
    inactivityTimeoutSeconds: Math.min(604800, Math.max(60, Number(override?.inactivityTimeoutSeconds ?? base.inactivityTimeoutSeconds) || DEFAULT_CHATBOT_LIFECYCLE_SETTINGS.inactivityTimeoutSeconds)),
    resetOnLogoutEvent: override?.resetOnLogoutEvent ?? base.resetOnLogoutEvent,
    resetOnUserChange: override?.resetOnUserChange ?? base.resetOnUserChange,
    resetOnTargetAppChange: override?.resetOnTargetAppChange ?? base.resetOnTargetAppChange
  };
}

export async function getEffectiveChatbotLifecycleSettings(companyId: string, targetAppId?: string) {
  const scopedResult = await getPool().query<{
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
      SELECT settings.id, cta.company_id, settings.target_app_id, settings.max_context_messages, settings.max_context_tokens, settings.inactivity_timeout_seconds,
             reset_on_logout_event, reset_on_user_change, reset_on_target_app_change
      FROM chatbot_lifecycle_settings settings
      INNER JOIN company_target_applications cta ON cta.id = settings.target_app_id
      WHERE cta.company_id = $1
        AND settings.deleted_at IS NULL
        AND ($2::uuid IS NULL OR settings.target_app_id = $2)
      ORDER BY CASE WHEN settings.target_app_id = $2 THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [companyId, targetAppId ?? null]
  );

  if (!scopedResult.rows[0]) {
    return DEFAULT_CHATBOT_LIFECYCLE_SETTINGS;
  }

  return mergeLifecycleSettings(DEFAULT_CHATBOT_LIFECYCLE_SETTINGS, mapRow(scopedResult.rows[0]));
}

export async function listChatbotLifecycleSettings(companyId: string) {
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
      SELECT settings.id, cta.company_id, settings.target_app_id, settings.max_context_messages, settings.max_context_tokens, settings.inactivity_timeout_seconds,
             reset_on_logout_event, reset_on_user_change, reset_on_target_app_change
      FROM chatbot_lifecycle_settings settings
      INNER JOIN company_target_applications cta ON cta.id = settings.target_app_id
      WHERE cta.company_id = $1
        AND settings.deleted_at IS NULL
      ORDER BY settings.updated_at DESC
    `,
    [companyId]
  );

  return result.rows.map(mapRow);
}
