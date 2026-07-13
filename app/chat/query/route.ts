import { NextResponse } from "next/server";
import { answerChatQuery, ChatQueryError } from "@/lib/chat/query";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (
    !body
    || typeof body.company_id !== "string"
    || typeof body.user_id !== "string"
    || typeof body.question !== "string"
  ) {
    return NextResponse.json({ message: "Company, user, and question are required." }, { status: 400 });
  }

  try {
    const response = await answerChatQuery({
      company_id: body.company_id,
      user_id: body.user_id,
      question: body.question,
      target_app_id: typeof body.target_app_id === "string" ? body.target_app_id : typeof body.targetAppId === "string" ? body.targetAppId : undefined,
      conversation_id: typeof body.conversation_id === "string" ? body.conversation_id : undefined,
      top_k: typeof body.top_k !== "undefined" ? Number(body.top_k) : undefined
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof ChatQueryError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Chat query failed." },
      { status: 500 }
    );
  }
}
