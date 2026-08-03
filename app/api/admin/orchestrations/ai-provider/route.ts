/**
 * Active LLM provider (read-only, non-sensitive)
 * Returns the provider name + model the orchestration designer should show
 * for nodes like AI Extraction / AI Task, so a designer can see what these
 * nodes will actually call. Never returns API keys or endpoints.
 *
 * Since AI Configuration can now be scoped per target app and per
 * environment (an orchestration can be released to several environments at
 * once, each potentially resolving a different LLM), a `targetAppId` query
 * param resolves the target-app-level default AND a per-environment
 * breakdown, so the UI can show which environments (if any) override it —
 * there is no longer a single "the active provider" once a target app is
 * known.
 */

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getAIProviderConfig } from "@/lib/ai/config";
import { listChatbotKeyEnvironments } from "@/lib/admin/chatbot-settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const targetAppId = new URL(request.url).searchParams.get("targetAppId")?.trim() || "";

  try {
    const companyId = session.user.tenantId;

    if (!targetAppId) {
      const config = await getAIProviderConfig(companyId);
      return NextResponse.json({
        success: true,
        scope: "company",
        provider: config.llm_provider,
        model: config.llm_model,
      });
    }

    const targetAppDefault = await getAIProviderConfig(companyId, targetAppId);

    let environments: Array<{ id: string; name: string; provider: string; model: string; isOverride: boolean }> = [];
    try {
      const envRecords = await listChatbotKeyEnvironments(session, targetAppId);
      environments = await Promise.all(
        envRecords.map(async (env) => {
          const resolved = await getAIProviderConfig(companyId, targetAppId, env.id);
          return {
            id: env.id,
            name: env.name,
            provider: resolved.llm_provider,
            model: resolved.llm_model,
            isOverride: resolved.llm_provider !== targetAppDefault.llm_provider || resolved.llm_model !== targetAppDefault.llm_model,
          };
        })
      );
    } catch {
      // Non-fatal: the panel still shows the target-app default without the per-environment breakdown.
    }

    return NextResponse.json({
      success: true,
      scope: "target_app",
      provider: targetAppDefault.llm_provider,
      model: targetAppDefault.llm_model,
      environments,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
