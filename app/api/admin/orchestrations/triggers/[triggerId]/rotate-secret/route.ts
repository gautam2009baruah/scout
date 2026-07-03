// Webhook Secret Rotation Endpoint
// POST /api/admin/orchestrations/triggers/[triggerId]/rotate-secret
// Regenerates webhook secret for a trigger

import { NextRequest, NextResponse } from "next/server";
import {
  getTriggerById,
  updateTrigger,
  generateWebhookSecret,
  decryptTriggerConfig,
} from "@/lib/orchestrations/triggers";
import type { WebhookTriggerConfig } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const triggerId = (await context.params).triggerId;

    // Get trigger
    const trigger = await getTriggerById(triggerId);
    if (!trigger) {
      return NextResponse.json({ error: "Trigger not found" }, { status: 404 });
    }

    // Only webhook triggers have secrets
    if (trigger.triggerType !== "webhook") {
      return NextResponse.json(
        { error: "Only webhook triggers support secret rotation" },
        { status: 400 }
      );
    }

    // Generate new secret
    const newSecret = generateWebhookSecret();

    // Decrypt current config
    const currentConfig = decryptTriggerConfig(trigger.config) as WebhookTriggerConfig;

    // Update config with new secret
    const updatedConfig: WebhookTriggerConfig = {
      ...currentConfig,
      secret: newSecret,
    };

    // Update trigger
    await updateTrigger(triggerId, {
      config: updatedConfig,
      updatedByEmail: session.email,
    });

    // Return new secret (only time it's shown)
    return NextResponse.json({
      success: true,
      secret: newSecret,
      message: "Webhook secret has been rotated. Save this secret securely - it will not be shown again.",
    });
  } catch (error) {
    console.error("Error rotating webhook secret:", error);
    return NextResponse.json(
      { error: "Failed to rotate webhook secret" },
      { status: 500 }
    );
  }
}
