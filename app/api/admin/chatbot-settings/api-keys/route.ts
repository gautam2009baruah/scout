import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  ChatbotSettingsError,
  createChatbotApiKey,
  listChatbotApiKeys
} from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  try {
    const keys = await listChatbotApiKeys(session);
    return NextResponse.json({ keys });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list API keys." }, { status: 500 });
  }
}

export async function PATCH() {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  return NextResponse.json({ message: "Use per-key strict environment enforcement on API key create/update." }, { status: 400 });
}

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
    const created = await createChatbotApiKey(session, {
      name: String(body.name || "").trim(),
      targetAppId: typeof body.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : null,
      environment: String(body.environment || ""),
      strictEnvironmentEnforcement: body.strictEnvironmentEnforcement === true,
      allowedOrigins: Array.isArray(body.allowedOrigins) ? body.allowedOrigins.map(String) : [],
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null
    });

    return NextResponse.json({ apiKey: created.apiKey, key: created.record, autoSuspended: created.autoSuspended === true });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create API key." }, { status: 500 });
  }
}
