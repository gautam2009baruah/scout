import { NextResponse } from "next/server";
import { ConversationError, listConversations } from "@/lib/chat/conversations";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);

  try {
    const result = await listConversations({
      companyId: url.searchParams.get("company_id") ?? "",
      userId: url.searchParams.get("user_id") ?? "",
      search: url.searchParams.get("search") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      page: Number(url.searchParams.get("page") ?? 1),
      pageSize: Number(url.searchParams.get("pageSize") ?? 20)
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ConversationError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
