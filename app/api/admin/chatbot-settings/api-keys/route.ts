import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  ChatbotSettingsError,
  createChatbotApiKey,
  getChatbotSecuritySettings,
  listChatbotApiKeys,
  updateChatbotSecuritySettings
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
    const [keys, security] = await Promise.all([
      listChatbotApiKeys(session),
      getChatbotSecuritySettings(session)
    ]);
    return NextResponse.json({ keys, strictEnvironmentEnforcement: security.strictEnvironmentEnforcement });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to list API keys." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
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
    const security = await updateChatbotSecuritySettings(session, {
      strictEnvironmentEnforcement: body.strictEnvironmentEnforcement === true
    });
    return NextResponse.json(security);
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to update security settings." }, { status: 500 });
  }
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
      environment: String(body.environment || "production"),
      allowedOrigins: Array.isArray(body.allowedOrigins) ? body.allowedOrigins.map(String) : [],
      expiresAt: typeof body.expiresAt === "string" ? body.expiresAt : null
    });

    return NextResponse.json({ apiKey: created.apiKey, key: created.record });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to create API key." }, { status: 500 });
  }
}
