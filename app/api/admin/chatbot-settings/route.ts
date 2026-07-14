import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  ChatbotSettingsError,
  getChatbotLifecycleSettingsAdminPayload,
  resetChatbotLifecycleSettings,
  upsertChatbotLifecycleSettings
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

  return NextResponse.json(await getChatbotLifecycleSettingsAdminPayload(session));
}

export async function PUT(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Settings payload is required." }, { status: 400 });
  }

  try {
    await upsertChatbotLifecycleSettings(session, {
      targetAppId: typeof body.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : null,
      maxContextMessages: Number(body.maxContextMessages),
      maxContextTokens: Number(body.maxContextTokens),
      inactivityTimeoutSeconds: Number(body.inactivityTimeoutSeconds),
      resetOnLogoutEvent: body.resetOnLogoutEvent !== false,
      resetOnUserChange: body.resetOnUserChange !== false,
      resetOnTargetAppChange: body.resetOnTargetAppChange !== false
    });

    return NextResponse.json(await getChatbotLifecycleSettingsAdminPayload(session));
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to save chatbot settings." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  try {
    await resetChatbotLifecycleSettings(
      session,
      typeof body?.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : null
    );

    return NextResponse.json(await getChatbotLifecycleSettingsAdminPayload(session));
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to reset chatbot settings." }, { status: 500 });
  }
}
