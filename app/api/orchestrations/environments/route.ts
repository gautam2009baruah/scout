// Target App Environments API
// Fetch a target app's environments, for per-environment node config pickers
// (Notification sender / Email Trigger inbox) in the orchestration designer.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { listChatbotKeyEnvironments } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

/**
 * GET /api/orchestrations/environments?targetAppId=xxx
 */
export async function GET(request: NextRequest) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
  }

  const targetAppId = request.nextUrl.searchParams.get("targetAppId")?.trim() || "";
  if (!targetAppId) {
    return NextResponse.json({ success: false, error: "targetAppId is required" }, { status: 400 });
  }

  try {
    const environments = await listChatbotKeyEnvironments(session, targetAppId);
    return NextResponse.json({
      success: true,
      environments: environments.map((env) => ({ id: env.id, name: env.name })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Unable to load environments" },
      { status: 500 }
    );
  }
}
