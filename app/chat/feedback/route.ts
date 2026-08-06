import { NextResponse } from "next/server";
import { upsertChatQueryFeedback } from "@/lib/chat/telemetry";
import { INPUT_LIMITS, exceedsCharacterLimit } from "@/lib/validation/input-limits";
import { readJsonBody, REQUEST_BODY_LIMITS, RequestValidationError } from "@/lib/validation/request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: Record<string, unknown> | null = null;
  try {
    body = await readJsonBody<Record<string, unknown>>(request, REQUEST_BODY_LIMITS.chatbotJson);
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  if (
    !body
    || typeof body.user_id !== "string"
    || typeof body.query_id !== "string"
    || (body.feedback !== "up" && body.feedback !== "down")
  ) {
    return NextResponse.json(
      { message: "user_id, query_id, and feedback (up/down) are required." },
      { status: 400 }
    );
  }

  if (exceedsCharacterLimit(body.user_id, INPUT_LIMITS.chatbotExternalUserId)) {
    return NextResponse.json({ message: `User id must be ${INPUT_LIMITS.chatbotExternalUserId} characters or fewer.` }, { status: 400 });
  }
  if (typeof body.reason === "string" && exceedsCharacterLimit(body.reason, INPUT_LIMITS.chatbotFeedbackReason)) {
    return NextResponse.json({ message: `Feedback reason must be ${INPUT_LIMITS.chatbotFeedbackReason} characters or fewer.` }, { status: 400 });
  }

  try {
    await upsertChatQueryFeedback({
      user_id: body.user_id,
      query_id: body.query_id,
      feedback: body.feedback,
      reason: typeof body.reason === "string" ? body.reason : undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Unable to save feedback." },
      { status: 400 }
    );
  }
}
