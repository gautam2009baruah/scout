// API Key Regeneration Endpoint
// POST /api/admin/api-clients/[clientId]/regenerate-key
// Regenerates API key for a client

import { NextRequest, NextResponse } from "next/server";
import { regenerateAPIKey } from "@/lib/orchestrations/triggers";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ clientId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientId = (await context.params).clientId;

    const result = await regenerateAPIKey(clientId);
    if (!result) {
      return NextResponse.json({ error: "API client not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      client: result.client,
      apiKey: result.apiKey,
      message: "API key has been regenerated. Save this key securely - it will not be shown again.",
    });
  } catch (error) {
    console.error("Error regenerating API key:", error);
    return NextResponse.json(
      { error: "Failed to regenerate API key" },
      { status: 500 }
    );
  }
}
