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
    const updated = await updateChatbotApiKey(session, id, {
      status: typeof body.status === "string" ? body.status as "active" | "suspended" | "revoked" : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      targetAppId: Object.prototype.hasOwnProperty.call(body, "targetAppId") ? (typeof body.targetAppId === "string" && body.targetAppId.trim() ? body.targetAppId : null) : undefined,
      environment: typeof body.environment === "string" ? body.environment : undefined,
      allowedOrigins: Array.isArray(body.allowedOrigins) ? body.allowedOrigins.map(String) : undefined,
      expiresAt: Object.prototype.hasOwnProperty.call(body, "expiresAt") ? (typeof body.expiresAt === "string" ? body.expiresAt : null) : undefined
    });

    return NextResponse.json({ key: updated });
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to update API key." }, { status: 500 });
  }
}
