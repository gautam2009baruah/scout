import { NextResponse } from "next/server";
import { ConversationError, listConversationMessages } from "@/lib/chat/conversations";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  const url = new URL(request.url);
  const { id } = await context.params;
  const companyIdentifier = url.searchParams.get("company_id") ?? "";
  const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";

  try {
    const result = await listConversationMessages({
      companyId,
      userId: url.searchParams.get("user_id") ?? "",
      conversationId: id,
      includeMetadata: url.searchParams.get("include_metadata") === "true",
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
