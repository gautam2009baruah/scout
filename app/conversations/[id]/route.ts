import { NextResponse } from "next/server";
import { ConversationError, getConversation, softDeleteConversation, updateConversation } from "@/lib/chat/conversations";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const { id } = await context.params;

  try {
    const result = await getConversation({
      companyId: url.searchParams.get("company_id") ?? "",
      userId: url.searchParams.get("user_id") ?? "",
      conversationId: id,
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

export async function PATCH(request: Request, context: RouteContext) {
  const body = await request.json().catch(() => null);
  const { id } = await context.params;

  try {
    await updateConversation({
      companyId: typeof body?.company_id === "string" ? body.company_id : "",
      userId: typeof body?.user_id === "string" ? body.user_id : "",
      conversationId: id,
      title: typeof body?.title === "string" ? body.title : undefined,
      status: typeof body?.status === "string" ? body.status : undefined
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const { id } = await context.params;

  try {
    await softDeleteConversation({
      companyId: url.searchParams.get("company_id") ?? "",
      userId: url.searchParams.get("user_id") ?? "",
      conversationId: id
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ConversationError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
