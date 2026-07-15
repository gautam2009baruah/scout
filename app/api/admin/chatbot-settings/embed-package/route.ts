import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  buildChatbotEmbedPackage,
  ChatbotSettingsError,
  getChatbotLifecycleSettingsAdminPayload
} from "@/lib/admin/chatbot-settings";

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
    const payload = await getChatbotLifecycleSettingsAdminPayload(session);
    const targetAppId = String(body.targetAppId || "").trim();
    const apiKey = String(body.apiKey || "").trim();

    const targetApp = payload.targetApps.find((item) => item.id === targetAppId);
    if (!targetApp) {
      return NextResponse.json({ message: "Selected target app is invalid." }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json({ message: "A plaintext API key is required to generate package snippets." }, { status: 400 });
    }

    const packageData = buildChatbotEmbedPackage({
      scoutUrl: String(body.scoutUrl || "http://localhost:3000").trim(),
      apiUrl: String(body.apiUrl || "http://localhost:4200").trim(),
      apiKey,
      companyId: session.user.tenantId,
      companyName: session.tenant.name,
      userId: String(body.userId || session.user.id).trim(),
      targetAppId: targetApp.id,
      targetAppName: targetApp.name,
      assistantName: typeof body.assistantName === "string" ? body.assistantName : undefined,
      brandColor: typeof body.brandColor === "string" ? body.brandColor : undefined,
      accentColor: typeof body.accentColor === "string" ? body.accentColor : undefined
    });

    return NextResponse.json(packageData);
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to generate embed package." }, { status: 500 });
  }
}
