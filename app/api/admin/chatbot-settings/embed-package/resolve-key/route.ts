import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { ChatbotSettingsError, resolveChatbotApiKeyContext } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Payload is required." }, { status: 400 });
  }

  try {
    const context = await resolveChatbotApiKeyContext(session, {
      apiKey: String(body.apiKey || "").trim(),
      targetAppId: typeof body.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : undefined,
    });

    return NextResponse.json({ context });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to resolve API key context." }, { status: 500 });
  }
}
