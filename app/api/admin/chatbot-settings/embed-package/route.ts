import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  ChatbotSettingsError,
  upsertChatbotEmbedPackage
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
    const persisted = await upsertChatbotEmbedPackage(session, {
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : undefined,
      targetAppId: String(body.targetAppId || "").trim(),
      environment: String(body.environment || "").trim(),
      apiKey: String(body.apiKey || "").trim(),
      userId: String(body.userId || "").trim(),
      requireUserGuid: body.requireUserGuid === true,
      scoutUrl: String(body.scoutUrl || "http://localhost:3000").trim(),
      apiUrl: String(body.apiUrl || "http://localhost:4200").trim(),
      assistantName: typeof body.assistantName === "string" ? body.assistantName : undefined,
    });

    return NextResponse.json({
      ...persisted.packageData,
      record: persisted.record,
    });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to generate embed package." }, { status: 500 });
  }
}
