import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getLLMProvider } from "@/lib/llm/providers";

export const runtime = "nodejs";

type IntentLabel = "action" | "chat";
type PrefilterLabel = IntentLabel | "uncertain";

type IntentGateRequest = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  message?: string;
  history?: Array<{ role?: string; text?: string }>;
};

type IntentGateFeedbackRequest = {
  decisionId?: string;
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  feedbackType?:
    | "true_positive"
    | "false_positive"
    | "false_negative"
    | "true_negative"
    | "user_override_action"
    | "user_override_chat";
  userChoice?: "action" | "chat" | "run_workflow" | "continue_chat";
  notes?: string;
};

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function classifyPrefilter(message: string): { label: PrefilterLabel; score: number; reason: string } {
  const normalized = message.toLowerCase();

  if (normalized.length < 3) {
    return { label: "chat", score: 0.95, reason: "too_short" };
  }

  const casual = /^(hi|hello|hey|thanks|thank you|ok|okay|nice|great|cool|awesome|bye)$/i.test(normalized);
  if (casual) {
    return { label: "chat", score: 0.95, reason: "casual_phrase" };
  }

  const actionVerb = /\b(create|add|update|change|submit|approve|reject|start|run|launch|assign|cancel|schedule|trigger|initiate|process|make|build)\b/i.test(normalized);
  const businessTarget = /\b(order|invoice|purchase|payment|shipment|ticket|request|rate code|customer|vendor|employee|contract)\b/i.test(normalized);
  const amountSignal = /\b\d+(?:[.,]\d+)?\b/.test(normalized) && /\b(dollar|usd|eur|inr|amount|price|total|cost)\b/i.test(normalized);
  const asksHow = /\b(what|how|why|where|when|who)\b/i.test(normalized);

  if (actionVerb && (businessTarget || amountSignal)) {
    return { label: "action", score: 0.88, reason: "action_and_target" };
  }

  if (asksHow && !actionVerb && !businessTarget) {
    return { label: "chat", score: 0.82, reason: "informational_question" };
  }

  return { label: "uncertain", score: 0.52, reason: "mixed_or_weak_signal" };
}

function parseClassifierJson(text: string): { intent: IntentLabel; confidence: number; reason: string } | null {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const intent = parsed.intent === "action" ? "action" : parsed.intent === "chat" ? "chat" : null;
    if (!intent) return null;

    const confidence = clamp01(Number(parsed.confidence));
    const reason = typeof parsed.reason === "string" ? parsed.reason : "";
    return { intent, confidence, reason };
  } catch {
    return null;
  }
}

async function assertUserCompanyAccess(input: { companyId: string; userId: string; targetAppId?: string }) {
  const pool = getPool();

  const companyUser = await pool.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM users u
       INNER JOIN user_company_roles ucr
         ON ucr.user_id = u.id
        AND ucr.company_id = $1
        AND ucr.deleted_at IS NULL
        AND ucr.status = 'active'
       WHERE u.id = $2
         AND u.deleted_at IS NULL
         AND u.status = 'active'
         AND u.can_view_chatbot = true
     ) AS allowed`,
    [input.companyId, input.userId]
  );

  if (!companyUser.rows[0]?.allowed) {
    throw new Error("User does not have chatbot access for this company.");
  }

  if (!input.targetAppId) {
    return;
  }

  const scoped = await pool.query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM guided_workflow_target_apps app
       WHERE app.id = $2
         AND app.company_id = $1
     ) AS allowed`,
    [input.companyId, input.targetAppId]
  );

  if (!scoped.rows[0]?.allowed) {
    throw new Error("Target app was not found for this company.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: IntentGateRequest = await request.json();
    const companyId = (body.companyId || "").trim();
    const userId = (body.userId || "").trim();
    const targetAppId = (body.targetAppId || "").trim();
    const conversationId = (body.conversationId || "").trim();
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!companyId || !userId || !message) {
      return NextResponse.json({ message: "Missing required fields: companyId, userId, message" }, { status: 400 });
    }

    await assertUserCompanyAccess({ companyId, userId, targetAppId: targetAppId || undefined });

    const prefilter = classifyPrefilter(message);
    let aiIntent: IntentLabel | null = null;
    let aiConfidence = 0;
    let aiReason = "";

    // Hybrid gate: quick rule prefilter, then AI final decision unless rule confidence is very high for chat.
    if (!(prefilter.label === "chat" && prefilter.score >= 0.9)) {
      const provider = await getLLMProvider();
      const historyText = Array.isArray(body.history)
        ? body.history
            .slice(-8)
            .map((item) => `${(item.role || "unknown").toUpperCase()}: ${String(item.text || "")}`)
            .join("\n")
        : "";

      const systemPrompt = [
        "You classify chat user intent into one of two modes: action or chat.",
        "action = user is asking to do/execute/create/update a business operation.",
        "chat = user is asking for information/explanation/question-answering.",
        "Return JSON only: {\"intent\":\"action|chat\",\"confidence\":0-1,\"reason\":\"short\"}",
      ].join(" ");

      const userPrompt = [
        "Conversation context:",
        historyText || "(none)",
        "",
        "Current message:",
        message,
      ].join("\n");

      const answer = await provider.generate_answer(systemPrompt, userPrompt, "");
      const parsed = parseClassifierJson(answer || "");

      if (parsed) {
        aiIntent = parsed.intent;
        aiConfidence = parsed.confidence;
        aiReason = parsed.reason;
      }
    }

    const finalIntent: IntentLabel = aiIntent ?? (prefilter.label === "action" ? "action" : "chat");
    const finalConfidence = clamp01(aiIntent ? aiConfidence : prefilter.score);
    const lowConfidence = finalConfidence < 0.66;

    const insert = await getPool().query<{ id: string }>(
      `
        INSERT INTO chatbot_intent_gate_decisions (
          company_id,
          target_app_id,
          user_id,
          conversation_id,
          message,
          prefilter_label,
          prefilter_score,
          ai_label,
          ai_confidence,
          final_label,
          low_confidence,
          reason,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        RETURNING id
      `,
      [
        companyId,
        targetAppId || null,
        userId,
        conversationId || null,
        message,
        prefilter.label,
        prefilter.score,
        aiIntent,
        aiIntent ? aiConfidence : null,
        finalIntent,
        lowConfidence,
        aiReason || prefilter.reason,
        JSON.stringify({
          prefilterReason: prefilter.reason,
          aiReason,
          usedAIClassifier: Boolean(aiIntent),
        }),
      ]
    );

    return NextResponse.json({
      decisionId: insert.rows[0].id,
      intent: finalIntent,
      confidence: finalConfidence,
      lowConfidence,
      promptModeChoice: lowConfidence,
      reason: aiReason || prefilter.reason,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to classify intent.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body: IntentGateFeedbackRequest = await request.json();
    const decisionId = (body.decisionId || "").trim();
    const companyId = (body.companyId || "").trim();
    const userId = (body.userId || "").trim();
    const targetAppId = (body.targetAppId || "").trim();

    if (!decisionId || !companyId || !userId || !body.feedbackType || !body.userChoice) {
      return NextResponse.json(
        { message: "Missing required fields: decisionId, companyId, userId, feedbackType, userChoice" },
        { status: 400 }
      );
    }

    await getPool().query(
      `
        INSERT INTO chatbot_intent_gate_feedback (
          decision_id,
          company_id,
          target_app_id,
          user_id,
          feedback_type,
          user_choice,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (decision_id, user_id)
        DO UPDATE SET
          feedback_type = EXCLUDED.feedback_type,
          user_choice = EXCLUDED.user_choice,
          notes = EXCLUDED.notes,
          updated_at = now()
      `,
      [
        decisionId,
        companyId,
        targetAppId || null,
        userId,
        body.feedbackType,
        body.userChoice,
        body.notes || null,
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Failed to save intent feedback.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
