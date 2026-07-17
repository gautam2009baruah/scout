import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { answerChatQuery, ChatQueryError } from "@/lib/chat/query";
import { recordChatQueryTelemetry } from "@/lib/chat/telemetry";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") || randomUUID();
  const body = await request.json().catch(() => null);

  if (
    !body
    || typeof body.company_id !== "string"
    || typeof body.user_id !== "string"
    || typeof body.question !== "string"
  ) {
    return NextResponse.json({ message: "Company, user, and question are required.", requestId }, { status: 400 });
  }

  let resolvedCompanyId = "";
  let resolvedTargetAppId: string | undefined;

  try {
    resolvedCompanyId = resolveGuidIdentifier(String(body.company_id || "").trim(), "company");
    const rawTargetAppId = typeof body.target_app_id === "string"
      ? body.target_app_id
      : typeof body.targetAppId === "string"
      ? body.targetAppId
      : "";

    resolvedTargetAppId = rawTargetAppId.trim()
      ? resolveGuidIdentifier(rawTargetAppId.trim(), "target_app")
      : undefined;
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Invalid scoped identifier payload.", requestId },
      { status: 400 }
    );
  }

  try {
    const response = await answerChatQuery({
      company_id: resolvedCompanyId,
      user_id: body.user_id,
      target_app_id: resolvedTargetAppId,
      question: body.question,
      conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : undefined,
      top_k: typeof body.top_k !== "undefined" ? Number(body.top_k) : undefined,
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("[ChatQueryRoute] answerChatQuery failed", {
      requestId,
      company_id: body?.company_id,
      user_id: body?.user_id,
      target_app_id: body?.target_app_id ?? body?.targetAppId,
      conversation_id: body?.conversation_id,
      question_preview: typeof body?.question === "string" ? body.question.slice(0, 160) : null,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    if (
      typeof body.company_id === "string"
      && typeof body.user_id === "string"
      && typeof body.question === "string"
      && body.company_id.trim()
      && body.user_id.trim()
      && body.question.trim()
    ) {
      try {
        await recordChatQueryTelemetry({
          target_app_id: resolvedTargetAppId,
          user_id: body.user_id,
          conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : undefined,
          question: body.question,
          answer: "",
          answer_status: "failed",
          no_answer_reason: "request_failed",
          retrieved_chunk_count: 0,
          citations: [],
          latency_ms: 0,
          token_usage: {
            prompt_tokens: null,
            completion_tokens: null,
            total_tokens: null,
            estimated_cost_usd: null,
          },
          metadata: { source: "app/chat/query/route" },
          error_message: error instanceof Error ? error.message : "Unknown chat query error",
        });
      } catch {
        // Non-blocking telemetry path.
      }
    }

    if (error instanceof ChatQueryError) {
      return NextResponse.json({ message: error.message, requestId }, { status: error.statusCode });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Chat query failed.", requestId },
      { status: 500 }
    );
  }
}
