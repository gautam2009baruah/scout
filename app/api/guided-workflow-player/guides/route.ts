import { NextResponse } from "next/server";
import { getPublishedGuidesForPlayer, GuidedWorkflowError } from "@/lib/admin/guided-workflows";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;

  try {
    const guides = await getPublishedGuidesForPlayer({
      targetAppId: searchParams.get("targetAppId") || searchParams.get("target_app_id") || "",
      origin: request.headers.get("origin") ?? undefined
    });

    return NextResponse.json({ guides });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
