import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { ChatbotSettingsError, getChatbotEmbedPackageSecret } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.chatbotSettings)) {
    return NextResponse.json({ message: "You do not have permission to manage chatbot settings." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const secret = await getChatbotEmbedPackageSecret(session, id);
    if (!secret) {
      return NextResponse.json({ message: "Generated package not found." }, { status: 404 });
    }

    return NextResponse.json(secret);
  } catch (error) {
    if (error instanceof ChatbotSettingsError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to fetch generated package secret." }, { status: 500 });
  }
}
