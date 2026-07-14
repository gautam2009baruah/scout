import { NextResponse } from "next/server";
import { getEffectiveChatbotLifecycleSettings } from "@/lib/chat/lifecycle-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyId = url.searchParams.get("company_id")?.trim() || "";
  const targetAppId = url.searchParams.get("target_app_id")?.trim() || undefined;

  if (!companyId) {
    return NextResponse.json({ message: "company_id is required." }, { status: 400 });
  }

  try {
    const settings = await getEffectiveChatbotLifecycleSettings(companyId, targetAppId);
    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Unable to load chatbot settings." }, { status: 500 });
  }
}
