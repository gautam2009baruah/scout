// Enable/Disable Schedule Trigger API

import { NextRequest, NextResponse } from "next/server";
import { getSchedulerService } from "@/lib/orchestrations/scheduler-service";
import { getPool } from "@/lib/db/pool";

/**
 * POST /api/orchestrations/triggers/schedule/[id]/enable
 * Enable a disabled schedule trigger
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const triggerId = params.id;

    const pool = getPool();

    // Update database
    await pool.query(
      `UPDATE orchestration_triggers
       SET config = jsonb_set(config, '{enabled}', 'true'::jsonb),
           status = 'active',
           updated_at = NOW()
       WHERE id = $1 AND trigger_type = 'schedule'`,
      [triggerId]
    );

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
