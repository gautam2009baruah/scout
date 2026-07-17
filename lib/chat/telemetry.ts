import { getPool } from "@/lib/db/pool";
import type { Citation } from "@/lib/search/citation-engine";
import { randomUUID } from "node:crypto";

export type ChatTokenUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
};

export type RecordChatQueryTelemetryInput = {
  user_id: string;
  target_app_id?: string;
  conversation_id?: string;
  question: string;
  answer: string;
  answer_status: "answered" | "no_answer" | "failed";
  no_answer_reason?: string;
  retrieved_chunk_count?: number;
  citations?: Citation[];
  llm_provider?: string;
  llm_model?: string;
  latency_ms?: number;
  token_usage?: ChatTokenUsage;
  metadata?: Record<string, unknown>;
  error_message?: string;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

async function resolveCanonicalTargetAppId(targetAppId?: string) {
  const normalized = String(targetAppId || "").trim();
  if (!normalized || !isUuid(normalized)) {
    return null;
  }

  // Newer runtime paths pass guided_workflow_target_apps.id.
  const guided = await getPool().query<{ target_app_id: string | null }>(
    `
      SELECT target_app_id
      FROM guided_workflow_target_apps
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [normalized]
  );

  const mappedCanonical = guided.rows[0]?.target_app_id;
  if (mappedCanonical && isUuid(mappedCanonical)) {
    return mappedCanonical;
  }

  // Some callers may already provide company_target_applications.id.
  const canonical = await getPool().query<{ id: string }>(
    `
      SELECT id
      FROM company_target_applications
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [normalized]
  );

  return canonical.rows[0]?.id ?? null;
}

async function canPersistTelemetryUser(userId: string) {
  if (!isUuid(userId)) {
    return false;
  }

  const result = await getPool().query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM users
       WHERE id = $1
         AND deleted_at IS NULL
     ) AS allowed`,
    [userId]
  );

  return result.rows[0]?.allowed === true;
}

export async function recordChatQueryTelemetry(input: RecordChatQueryTelemetryInput): Promise<string> {
  const canonicalTargetAppId = await resolveCanonicalTargetAppId(input.target_app_id);
  const externalUserId = String(input.user_id || "").trim() || null;

  try {
    const result = await getPool().query<{ id: string }>(
      `
        INSERT INTO chat_query_telemetry (
          target_app_id,
          external_user_id,
          conversation_id,
          question,
          answer,
          answer_status,
          no_answer_reason,
          retrieved_chunk_count,
          citation_count,
          citations_json,
          llm_provider,
          llm_model,
          latency_ms,
          prompt_tokens,
          completion_tokens,
          total_tokens,
          estimated_cost_usd,
          metadata_json,
          error_message
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10::jsonb, $11, $12, $13,
          $14, $15, $16, $17, $18::jsonb, $19
        )
        RETURNING id
      `,
      [
        canonicalTargetAppId,
        externalUserId,
        input.conversation_id || null,
        input.question,
        input.answer,
        input.answer_status,
        input.no_answer_reason || null,
        Math.max(0, Number(input.retrieved_chunk_count || 0)),
        Array.isArray(input.citations) ? input.citations.length : 0,
        JSON.stringify(input.citations || []),
        input.llm_provider || null,
        input.llm_model || null,
        Math.max(0, Number(input.latency_ms || 0)),
        input.token_usage?.prompt_tokens ?? null,
        input.token_usage?.completion_tokens ?? null,
        input.token_usage?.total_tokens ?? null,
        input.token_usage?.estimated_cost_usd ?? null,
        JSON.stringify(input.metadata || {}),
        input.error_message || null,
      ]
    );

    return result.rows[0].id;
  } catch (error) {
    // Telemetry must not break chat responses.
    console.warn("Skipping chat_query_telemetry insert:", {
      error,
      targetAppId: input.target_app_id || null,
      canonicalTargetAppId,
      externalUserId,
    });
    return randomUUID();
  }
}

export async function upsertChatQueryFeedback(input: {
  user_id: string;
  query_id: string;
  feedback: "up" | "down";
  reason?: string;
}) {
  await getPool().query(
    `
      INSERT INTO chat_query_feedback (
        target_app_id,
        query_id,
        external_user_id,
        feedback,
        reason
      )
      VALUES (
        (SELECT target_app_id FROM chat_query_telemetry WHERE id = $2),
        $2,
        $1,
        $3,
        $4
      )
      ON CONFLICT (query_id, external_user_id)
      DO UPDATE SET
        feedback = EXCLUDED.feedback,
        reason = EXCLUDED.reason,
        updated_at = now()
    `,
    [
      input.user_id,
      input.query_id,
      input.feedback,
      input.reason || null,
    ]
  );
}

function estimateTokensFromText(text: string): number {
  const compact = text.trim();
  if (!compact) return 0;
  return Math.max(1, Math.ceil(compact.length / 4));
}

function getPerMillionTokenPricing(provider: string, model: string): { input: number; output: number } | null {
  if (provider === "openai") {
    if (model.includes("gpt-4.1-mini")) {
      return { input: 0.4, output: 1.6 };
    }
    if (model.includes("gpt-4o-mini")) {
      return { input: 0.15, output: 0.6 };
    }
    return null;
  }

  if (provider === "gemini") {
    if (model.includes("gemini-2.5-flash")) {
      return { input: 0.35, output: 0.7 };
    }
    return null;
  }

  return null;
}

export function buildEstimatedTokenUsage(input: {
  provider: string;
  model: string;
  systemPrompt: string;
  question: string;
  contextText: string;
  answerText: string;
}): ChatTokenUsage {
  const prompt_tokens =
    estimateTokensFromText(input.systemPrompt)
    + estimateTokensFromText(input.question)
    + estimateTokensFromText(input.contextText);
  const completion_tokens = estimateTokensFromText(input.answerText);
  const total_tokens = prompt_tokens + completion_tokens;

  const pricing = getPerMillionTokenPricing(input.provider, input.model);
  const estimated_cost_usd = pricing
    ? Number((((prompt_tokens / 1_000_000) * pricing.input) + ((completion_tokens / 1_000_000) * pricing.output)).toFixed(6))
    : null;

  return {
    prompt_tokens,
    completion_tokens,
    total_tokens,
    estimated_cost_usd,
  };
}
