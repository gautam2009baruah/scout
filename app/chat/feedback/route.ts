import { NextResponse } from "next/server";
import { upsertChatQueryFeedback } from "@/lib/chat/telemetry";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

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
