import { NextResponse } from "next/server";
import { getEffectiveChatbotLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const companyIdentifier = url.searchParams.get("company_id")?.trim() || "";
  const targetAppIdentifier = url.searchParams.get("target_app_id")?.trim() || undefined;

  let companyId = "";
  let targetAppId: string | undefined;

  try {
    companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : undefined;
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Invalid scoped identifier." }, { status: 400 });
  }

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
