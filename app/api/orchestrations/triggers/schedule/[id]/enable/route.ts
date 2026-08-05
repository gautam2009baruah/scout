// Enable/Disable Schedule Trigger API

import { NextRequest, NextResponse } from "next/server";
import { getSchedulerService } from "@/lib/orchestrations/scheduler-service";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * POST /api/orchestrations/triggers/schedule/[id]/enable
 * Enable a disabled schedule trigger
 */
export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: triggerId } = await routeContext.params;
    const companyId = session.user.tenantId;

    const pool = getPool();

    // Update database (scoped to the caller's company via the owning orchestration)
    const updateResult = await pool.query(
      `UPDATE orchestration_triggers
       SET config = jsonb_set(config, '{enabled}', 'true'::jsonb),
           status = 'active',
           updated_at = NOW()
       WHERE id = $1 AND trigger_type = 'schedule'
         AND orchestration_id IN (
           SELECT id FROM orchestrations WHERE company_id = $2
         )`,
      [triggerId, companyId]
    );

    if (updateResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Trigger not found" },
        { status: 404 }
      );
    }

    // Enable in scheduler
    const scheduler = getSchedulerService();
    const success = await scheduler.enableTrigger(triggerId);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to enable trigger" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Trigger enabled successfully",
    });
  } catch (error: any) {
    console.error("[API] Error enabling trigger:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
