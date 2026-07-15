import { NextResponse } from "next/server";
import { getPublishedGuidesForPlayer, getPublishedTrainingSessionsForPlayer, GuidedWorkflowError } from "@/lib/admin/guided-workflows";
import { assertScopedTargetAppAccess, ScopedTargetAppAccessError } from "@/lib/chat/scoped-target-app-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  try {
    const input = {
      targetAppId: searchParams.get("targetAppId") || searchParams.get("target_app_id") || "",
      origin: request.headers.get("origin") ?? undefined
    };
    const companyId = searchParams.get("companyId") || searchParams.get("company_id") || "";
    const userId = searchParams.get("userId") || searchParams.get("user_id") || "";
    if (companyId || userId) {
      await assertScopedTargetAppAccess({ companyId, userId, targetAppId: input.targetAppId });
    }
    const [guides, sessions] = await Promise.all([
      getPublishedGuidesForPlayer(input),
      getPublishedTrainingSessionsForPlayer(input)
    ]);

    return NextResponse.json({ guides, sessions });
  } catch (error) {
    if (error instanceof ScopedTargetAppAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
