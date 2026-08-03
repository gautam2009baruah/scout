// Step 7: dedicated chat endpoint for the "AI Planner" conversation.
//
// Deliberately separate from /api/chatbot/workflow-router (see the decision
// recorded when this was built): PlannerAgent's multi-turn conversation
// (match confirm -> draft confirm -> up to 3 clarification rounds -> submit)
// doesn't fit workflow-router's phrase-matching/graph-execution model, and
// splicing it into that already-large, heavily-used route risked regressing
// every other orchestration's chat handling. The chat widget routes here
// instead of workflow-router only when the selected orchestration is the
// pre-built AI Planner entry (see components/scout-chatbot.tsx's
// `workflow.isAiPlanner` branch in sendMessage()/startOrchestration()).

import { NextResponse, type NextRequest } from "next/server";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import { getOrCreateConversation, appendConversationExchange } from "@/lib/chat/conversations";
import { handleTurn, type PlannerTurnResult } from "@/lib/orchestrations/planner/agent";
import { getPlannerSessionState, setPlannerSessionState } from "@/lib/orchestrations/planner/sessions";
import { createPendingPlanRequest, PendingPlanRequestConflictError } from "@/lib/orchestrations/planner/pending-requests";
import { buildPlanSummary } from "@/lib/orchestrations/planner/plan-summary";

export const runtime = "nodejs";

type AiPlannerRequestBody = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  message?: string;
};

// Mirrors the two-value contract the chat widget already reads off
// workflow-router replies (scout-chatbot.tsx: `!["need_clarification",
// "workflow_match"].includes(reply.routerIntent)` decides whether to keep
// routing subsequent messages through this same flow). Any non-whitelisted
// value ends the flow.
//
// "rephrase_requested" and "declined" are PlannerState-terminal (state
// resets to null so the next message starts a fresh startMatching() cycle
// — see agent.ts) but their message text explicitly invites the user to
// just try again ("could you try rephrasing", "let me know if you'd like
// to describe it differently"). Mapping them to "execute_plan" would exit
// AI Planner mode right after saying that, silently routing the user's very
// next message through normal chat instead — a real UX mismatch between
// what the bot says and what it does. Keep them in the "stay active"
// bucket so the invitation is actually honored.
function toRouterIntent(kind: PlannerTurnResult["kind"]): string {
  switch (kind) {
    case "match_confirmation":
    case "draft_confirmation_prompt":
    case "clarifying_question":
    case "rephrase_requested":
    case "declined":
      return "need_clarification";
    default:
      // match_executed, draft_complete, blocked_pending_lock: a definitive
      // outcome occurred (or nothing more can be done right now) — exit AI
      // Planner mode for real.
      return "execute_plan";
  }
}

export async function POST(request: NextRequest) {
  let body: AiPlannerRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  // "userId" here is the chatbot's external_user_id — an opaque,
  // client-supplied identifier, not a control-panel user (see
  // lib/chat/access-validator.ts).
  const externalUserId = String(body.userId || "").trim();
  const message = String(body.message || "").trim();

  // companyId/targetAppId arrive from the embedded widget as either raw
  // UUIDs or scoped/encoded identifier tokens (scidv1.<nonce>.<cipher>) — see
  // lib/chat/embed-id-token.ts. Every other chatbot route decodes these
  // before use (app/api/chatbot/orchestrations/route.ts,
  // app/api/chatbot/workflow-router/route.ts); resolveGuidIdentifier()
  // passes an already-raw UUID through unchanged, so this is safe for both.
  let companyId = "";
  let targetAppId = "";
  try {
    companyId = body.companyId ? resolveGuidIdentifier(body.companyId, "company") : "";
    targetAppId = body.targetAppId ? resolveGuidIdentifier(body.targetAppId, "target_app") : "";
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid scoped identifier." }, { status: 400 });
  }

  if (!companyId || !externalUserId || !targetAppId) {
    return NextResponse.json({ message: "companyId, userId, and targetAppId are required." }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ message: "message is required." }, { status: 400 });
  }

  try {
    const apiKeyRecord = await assertChatbotApiKeyAccess(request, { companyId, targetAppId, userId: externalUserId });
    await assertScopedTargetAppAccess({ companyId, userId: externalUserId, targetAppId });

    const persistedConversationId = await getOrCreateConversation({
      companyId,
      userId: externalUserId,
      conversationId: body.conversationId || undefined,
      firstQuestion: message,
    });

    const priorState = await getPlannerSessionState(persistedConversationId);

    const result = await handleTurn({
      state: priorState,
      message,
      externalUserId,
      companyId,
      targetAppId,
    });

    await setPlannerSessionState({
      conversationId: persistedConversationId,
      targetAppId,
      externalUserId,
      state: result.state,
    });

    let finalMessage = result.message;

    if (result.kind === "draft_complete") {
      try {
        await createPendingPlanRequest({
          targetAppId,
          environmentId: apiKeyRecord.environmentId,
          externalUserId,
          conversationId: persistedConversationId,
          requestText: result.draftPlan.requestText,
          draftPlan: result.draftPlan,
          planSummary: buildPlanSummary(result.draftPlan),
        });
      } catch (error) {
        if (error instanceof PendingPlanRequestConflictError) {
          // Race: another request from the same user landed first (the DB's
          // partial unique index is the actual guarantee here — see
          // db/migrations/133_ai_planner_step7.sql). Step 8 adds the
          // pre-emptive service-layer check before drafting even starts;
          // this is just the graceful fallback if that race still happens.
          finalMessage = "You already have a request pending admin approval — I'll hold off on submitting a new one until that's resolved.";
        } else {
          throw error;
        }
      }
    }

    await appendConversationExchange({
      companyId,
      userId: externalUserId,
      conversationId: persistedConversationId,
      question: message,
      answer: finalMessage,
      citations: [],
      metadata: { source: "ai_planner", resultKind: result.kind },
    });

    return NextResponse.json({
      answer: finalMessage,
      conversationId: persistedConversationId,
      intent: toRouterIntent(result.kind),
    });
  } catch (error) {
    if (error instanceof ChatbotApiKeyAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    if (error instanceof ScopedTargetAppAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("AI Planner chat route error:", error);
    return NextResponse.json({ message: "Something went wrong processing your request." }, { status: 500 });
  }
}
