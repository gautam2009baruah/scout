import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { ChatbotSettingsError, listChatbotEmbedPackages } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const targetAppId = url.searchParams.get("targetAppId") || undefined;
    const records = await listChatbotEmbedPackages(session, { targetAppId });
    return NextResponse.json({ records });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to load generated packages." }, { status: 500 });
  }
}
