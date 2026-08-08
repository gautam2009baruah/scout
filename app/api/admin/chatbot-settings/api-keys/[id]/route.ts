import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { ChatbotSettingsError, updateChatbotApiKey } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Payload is required." }, { status: 400 });
  }

  try {
    const updateInput: {
      status?: "active" | "suspended" | "revoked";
      name?: string;
      targetAppId?: string | null;
      environment?: string;
      expiresAt?: string | null;
    } = {};

    if (typeof body.status === "string") {
      updateInput.status = body.status as "active" | "suspended" | "revoked";
    }
    if (typeof body.name === "string") {
      updateInput.name = body.name;
    }
    if (typeof body.environment === "string") {
      updateInput.environment = body.environment;
    }
    if (Object.prototype.hasOwnProperty.call(body, "targetAppId")) {
      updateInput.targetAppId = typeof body.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "expiresAt")) {
      updateInput.expiresAt = typeof body.expiresAt === "string" ? body.expiresAt : null;
    }

    const updated = await updateChatbotApiKey(session, id, updateInput);

    return NextResponse.json({ key: updated });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to update API key." }, { status: 500 });
  }
}
