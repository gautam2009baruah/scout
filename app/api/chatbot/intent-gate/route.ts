import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getLLMProvider } from "@/lib/llm/providers";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";

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

/**
 * Minimal prefilter — only bypasses LLM for trivially obvious casual messages.
 * Anything else goes straight to the LLM. Domain knowledge belongs in the prompt.
 */
function isObviousCasualMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 3) return true;
  return /^(hi|hello|hey|thanks|thank you|ok|okay|nice|great|cool|awesome|bye|good morning|good afternoon|good evening|good night|cheers|np|no problem|sure|yep|nope|yes|no|lol|haha)[.!?]*$/i.test(trimmed);
}

/**
 * Structural fallback used ONLY when the LLM call fails or returns no result.
 * Not a full classifier — just catches unambiguous action signals so a failed
 * LLM call doesn't silently default everything to chat.
 */
function structuralFallbackIntent(message: string): { intent: IntentLabel; confidence: number } {
  if (isObviousCasualMessage(message)) return { intent: "chat", confidence: 0.9 };
  const normalized = message.toLowerCase();
  const hasEmailAddress = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(normalized);
  const hasActionVerb = /\b(send|create|update|submit|approve|reject|notify|schedule|cancel|process|trigger|launch|start|run|assign|email|forward|draft|book|delete|remove|generate|dispatch)\b/i.test(normalized);
  const asksQuestion = /^(what|how|why|where|when|who)\b/i.test(normalized);
  if (asksQuestion) return { intent: "chat", confidence: 0.75 };
  if (hasEmailAddress || (hasActionVerb)) return { intent: "action", confidence: 0.72 };
  return { intent: "uncertain" as IntentLabel, confidence: 0.5 };
}

/**
 * Comprehensive LLM system prompt that teaches intent classification through
 * reasoning principles and diverse examples — not hardcoded domain patterns.
 * This is intentionally domain-agnostic so it works for any future request type.
 */
function buildIntentSystemPrompt(): string {
  return `You are an intent classifier for a business chatbot. Decide whether the user wants to PERFORM AN ACTION or GET INFORMATION/HAVE A CONVERSATION.

== ACTION ==
The user wants the system to DO something on their behalf:
- Send, deliver, forward, or compose anything (email, message, notification, report, file, invitation)
- Create, add, register, or submit any record (ticket, order, user, document, entry)
- Update, edit, change, or modify something that already exists
- Trigger, start, run, launch, or execute any process or workflow
- Approve, reject, escalate, or make a decision on something pending
- Contact, notify, alert, or reach out to a person or team
- Schedule, book, or reserve something
- Delete, cancel, deactivate, or close something
- Generate, draft, or produce any output intended for delivery to someone
- Process, handle, or act on a specific item (order, request, case, record)

== CHAT ==
The user wants information, explanation, or a response:
- Questions: what is, how does, why is, when was, who handles, where can I find
- Asking about policies, procedures, status, or facts
- Asking for summaries, explanations, or descriptions
- Casual conversation, acknowledgements, follow-up questions

== KEY REASONING RULES ==
1. Polite phrasing does NOT change the intent. "Can you send..." = action. "Please notify..." = action.
2. If the message contains a recipient (email address, name, team), it is almost certainly an action.
3. "What is the invoice amount?" = chat. "Process the invoice" = action.
4. "Tell me who handles refunds" = chat. "Send the refund to John" = action.
5. When genuinely uncertain, prefer "action" over "chat" — it is safer to surface an action choice.

Return ONLY this JSON, no markdown, no extra text:
{"intent":"action","confidence":0.92,"reason":"brief explanation"}`;
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
    const companyIdentifier = (body.companyId || "").trim();
    const userId = (body.userId || "").trim();
    const targetAppIdentifier = (body.targetAppId || "").trim();
    const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    const targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";
    const conversationId = (body.conversationId || "").trim();
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!companyId || !userId || !message) {
      return NextResponse.json({ message: "Missing required fields: companyId, userId, message" }, { status: 400 });
    }

    await assertUserCompanyAccess({ companyId, userId, targetAppId: targetAppId || undefined });

    let aiIntent: IntentLabel | null = null;
    let aiConfidence = 0;
    let aiReason = "";

    // Only skip the LLM for trivially obvious one-word casual messages.
    // Everything else — including ambiguous phrasing — goes to the LLM.
    if (!isObviousCasualMessage(message)) {
      const provider = await getLLMProvider();
      const historyText = Array.isArray(body.history)
        ? body.history
            .slice(-8)
            .map((item) => `${(item.role || "unknown").toUpperCase()}: ${String(item.text || "")}`)
            .join("\n")
        : "";

      const userPrompt = historyText
        ? `Conversation so far:\n${historyText}\n\nLatest message to classify:\n${message}`
        : `Message to classify:\n${message}`;

      const answer = await provider.generate_answer(buildIntentSystemPrompt(), userPrompt, "");
      const parsed = parseClassifierJson(answer || "");

      if (parsed) {
        aiIntent = parsed.intent;
        aiConfidence = parsed.confidence;
        aiReason = parsed.reason;
      }
    }

    const fallback = structuralFallbackIntent(message);
    // Default to action when structural fallback is uncertain — safer than defaulting to chat
    const finalIntent: IntentLabel = aiIntent ?? (fallback.intent === "uncertain" as IntentLabel ? "action" : fallback.intent);
    const finalConfidence = clamp01(aiIntent ? aiConfidence : fallback.confidence);
    const lowConfidence = finalConfidence < 0.66;

    // Persist telemetry — non-fatal if table not yet migrated
    let decisionId: string | null = null;
    try {
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
          isObviousCasualMessage(message) ? "chat" : (aiIntent ?? fallback.intent),
          isObviousCasualMessage(message) ? 0.95 : (aiIntent ? aiConfidence : fallback.confidence),
          aiIntent,
          aiIntent ? aiConfidence : null,
          finalIntent,
          lowConfidence,
          aiReason,
          JSON.stringify({
            usedAIClassifier: Boolean(aiIntent),
          }),
        ]
      );
      decisionId = insert.rows[0].id;
    } catch {
      // Telemetry is non-fatal — table may not be migrated yet
    }

    return NextResponse.json({
      decisionId,
      intent: finalIntent,
      confidence: finalConfidence,
      lowConfidence,
      promptModeChoice: lowConfidence,
      reason: aiReason,
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
    const companyIdentifier = (body.companyId || "").trim();
    const userId = (body.userId || "").trim();
    const targetAppIdentifier = (body.targetAppId || "").trim();
    const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    const targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";

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
