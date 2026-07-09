/**
 * Active LLM provider (read-only, non-sensitive)
 * Returns just the active provider name + model so the orchestration designer
 * can show which AI provider nodes like AI Extraction / AI Decision will use.
 * Never returns API keys or endpoints.
 */

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getAIProviderConfig } from "@/lib/ai/config";

export const runtime = "nodejs";

export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const config = await getAIProviderConfig();
    return NextResponse.json({
      success: true,
      provider: config.llm_provider,
      model: config.llm_model,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
