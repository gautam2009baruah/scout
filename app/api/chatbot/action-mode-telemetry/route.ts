import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db/pool";
import { resolveGuidIdentifier } from "@/lib/chat/embed-id-token";
import { assertChatbotApiKeyAccess, ChatbotApiKeyAccessError } from "@/lib/chat/api-key-access";

export const runtime = "nodejs";

type ActionModeTelemetryRequest = {
  companyId?: string;
  userId?: string;
  targetAppId?: string;
  conversationId?: string;
  eventType?: "action_mode_invoked" | "action_mode_auto_reset";
  metadata?: Record<string, unknown>;
};

export async function POST(request: NextRequest) {
  try {
    const body: ActionModeTelemetryRequest = await request.json();
    const companyIdentifier = (body.companyId || "").trim();
    const userId = (body.userId || "").trim();
    const targetAppIdentifier = (body.targetAppId || "").trim();
    const conversationId = (body.conversationId || "").trim();
    const companyId = companyIdentifier ? resolveGuidIdentifier(companyIdentifier, "company") : "";
    const targetAppId = targetAppIdentifier ? resolveGuidIdentifier(targetAppIdentifier, "target_app") : "";

    if (!companyId || !userId || !body.eventType) {
      return NextResponse.json(
        { message: "Missing required fields: companyId, userId, eventType" },
        { status: 400 }
      );
    }

    await assertChatbotApiKeyAccess(request, { companyId, targetAppId, userId });

    await getPool().query(
      `
        INSERT INTO chatbot_action_mode_events (
          company_id,
          target_app_id,
          user_id,
          conversation_id,
          event_type,
          metadata_json
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      `,
      [
        companyId,
        targetAppId || null,
        userId,
        conversationId || null,
        body.eventType,
        JSON.stringify(body.metadata || {}),
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ChatbotApiKeyAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    return NextResponse.json(
      {
        message: "Failed to store action mode telemetry.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
