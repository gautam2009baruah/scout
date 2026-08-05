import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { assertTriggerOwnership, updateTrigger } from "@/lib/orchestrations/triggers";
import { OrchestrationAccessError } from "@/lib/orchestrations/db";
import type { TriggerStatus } from "@/shared/orchestrationTypes";

const ALLOWED_STATUS: TriggerStatus[] = ["active", "inactive", "suspended", "revoked"];

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { triggerId } = await context.params;
    const body = await request.json().catch(() => ({}));
    const nextStatus = String(body.status || "") as TriggerStatus;

    if (!ALLOWED_STATUS.includes(nextStatus)) {
      return NextResponse.json(
        {
          error: "Invalid status",
          allowed: ALLOWED_STATUS,
        },
        { status: 400 }
      );
    }

    await assertTriggerOwnership(session, triggerId);

    const updated = await updateTrigger(triggerId, {
      status: nextStatus,
      updatedById: session.user.id,
    });

    return NextResponse.json({
      success: true,
      trigger: updated,
    });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update trigger status" },
      { status: 500 }
    );
  }
}
