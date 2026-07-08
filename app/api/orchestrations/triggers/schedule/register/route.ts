// Schedule Trigger Management API
// Dynamic registration and control of schedule triggers

import { NextRequest, NextResponse } from "next/server";
import { getSchedulerService } from "@/lib/orchestrations/scheduler-service";
import { calculateNextRunTime, getScheduleDescription } from "@/lib/orchestrations/scheduler/cron-utils";
import { getPool } from "@/lib/db/pool";

/**
 * POST /api/orchestrations/triggers/schedule/register
 * Register a new schedule trigger or update existing one
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { triggerId } = body;

    if (!triggerId) {
      return NextResponse.json(
        { success: false, error: "triggerId is required" },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Load trigger from database
    const result = await pool.query(
      `SELECT 
        t.id,
        t.orchestration_id,
        t.name,
        t.config,
        t.status
       FROM orchestration_triggers t
       INNER JOIN orchestrations o ON t.orchestration_id = o.id
       WHERE t.id = $1
       AND t.trigger_type = 'schedule'
       AND o.status = 'published'`,
      [triggerId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Trigger not found or orchestration not published" },
        { status: 404 }
      );
    }

    const row = result.rows[0];
    const trigger = {
      id: row.id,
      orchestrationId: row.orchestration_id,
      name: row.name,
      config: row.config,
      status: row.status as "active" | "inactive" | "error",
      lastTriggeredAt: null,
      nextRunAt: calculateNextRunTime(row.config),
    };

    // Register with scheduler service
    const scheduler = getSchedulerService();
    const success = await scheduler.registerTrigger(trigger);

    if (!success) {
      return NextResponse.json(
        { success: false, error: "Failed to register trigger with scheduler" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      trigger: {
        id: trigger.id,
        name: trigger.name,
        description: getScheduleDescription(trigger.config),
        nextRunAt: trigger.nextRunAt,
      },
    });
  } catch (error: any) {
    console.error("[API] Error registering schedule trigger:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
