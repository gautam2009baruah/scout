import { NextResponse } from "next/server";
import { getPublishedGuidesForPlayer, getPublishedTrainingSessionsForPlayer, GuidedWorkflowError } from "@/lib/admin/guided-workflows";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";

export const runtime = "nodejs";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const headers = corsHeaders(request);

  try {
    const companyIdentifier = searchParams.get("companyId") || searchParams.get("company_id") || "";
    const targetAppIdentifier = searchParams.get("targetAppId") || searchParams.get("target_app_id") || "";
    const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    const targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";

    const input = { targetAppId };
    const userId = searchParams.get("userId") || searchParams.get("user_id") || "";

    await assertChatbotApiKeyAccess(request, {
      companyId,
      targetAppId: input.targetAppId,
      userId,
    });

    if (companyId || userId) {
      await assertScopedTargetAppAccess({
        companyId,
        userId,
        targetAppId: input.targetAppId,
        allowAnonymousGuest: true,
      });
    }
    const [guides, sessions] = await Promise.all([
      getPublishedGuidesForPlayer(input),
      getPublishedTrainingSessionsForPlayer(input)
    ]);

    return NextResponse.json({ guides, sessions }, { headers });
  } catch (error) {
    if (error instanceof ChatbotApiKeyAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode, headers });
    }
    if (error instanceof ScopedTargetAppAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode, headers });
    }
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode, headers });
    }

    throw error;
  }
}
