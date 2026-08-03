import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { ChatbotSettingsError, listChatbotKeyEnvironments } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.aiConfiguration)) {
    return NextResponse.json({ message: "You do not have permission to manage AI configuration." }, { status: 403 });
  }

  const targetAppId = new URL(request.url).searchParams.get("targetAppId")?.trim() || "";
  if (!targetAppId) {
    return NextResponse.json({ message: "targetAppId is required." }, { status: 400 });
  }

  try {
    const environments = await listChatbotKeyEnvironments(session, targetAppId);
    return NextResponse.json({ environments });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to load environments." }, { status: 500 });
  }
}
