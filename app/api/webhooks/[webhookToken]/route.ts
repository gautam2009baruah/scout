/**
 * Webhook Endpoint
 * Public endpoint to receive webhook requests
 * URL format: /api/webhooks/:webhookToken
 */

import { NextRequest, NextResponse } from "next/server";
import { processWebhook } from "@/lib/orchestrations/webhook-processor";
import type { WebhookRequest } from "@/lib/orchestrations/webhook-types";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ webhookToken: string }> }
) {
  try {
    const { webhookToken } = await context.params;

    // Get request details
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Get client IP
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "unknown";

    const userAgent = request.headers.get("user-agent") || undefined;

    // Get raw body (important for signature validation)
    const rawBody = await request.text();

    // Build webhook request object
    const webhookRequest: WebhookRequest = {
      method: request.method,
      headers,
      body: rawBody,
      ip,
      userAgent,
    };

    // Process webhook
    const result = await processWebhook(webhookToken, webhookRequest);

    // Return response
    return NextResponse.json(
      {
        success: result.success,
        message: result.message,
        executionId: result.executionId,
        extractedData: result.extractedData,
      },
      { status: result.statusCode }
    );
  } catch (error: any) {
    console.error("[WebhookEndpoint] Error processing webhook:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// Support GET for webhook verification (optional)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ webhookToken: string }> }
) {
  const { webhookToken } = await context.params;

  // Echo back challenge parameter if present (for services like GitHub, Slack)
  const challenge = request.nextUrl.searchParams.get("challenge");
  if (challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json(
    {
      message: "Webhook endpoint is active",
      webhookToken,
      methods: ["POST"],
    },
    { status: 200 }
  );
}

// Support other methods for flexibility
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ webhookToken: string }> }
) {
  return POST(request, context);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ webhookToken: string }> }
) {
  return POST(request, context);
}
