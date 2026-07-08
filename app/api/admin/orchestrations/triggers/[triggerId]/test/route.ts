/**
 * Manual Trigger Test API
 * Allows admins to manually test trigger execution
 */

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import {
  getOrchestrationById,
  createExecution,
  getNodes,
  getConnections,
} from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  try {
    const session = await getCurrentAdminSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { triggerId } = await context.params;
    const body = await request.json();
    const { testPayload } = body;

    const pool = getPool();

    // Get trigger details
    const triggerResult = await pool.query(
      `SELECT 
        ot.id,
        ot.orchestration_id,
        ot.trigger_type,
        ot.config,
        ot.is_active,
        o.name as orchestration_name,
        o.status as orchestration_status,
        o.version,
        o.company_id
       FROM orchestration_triggers ot
       INNER JOIN orchestrations o ON ot.orchestration_id = o.id
       WHERE ot.id = $1
       AND o.company_id = $2`,
      [triggerId, session.user.tenantId]
    );

    if (triggerResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Trigger not found" },
        { status: 404 }
      );
    }

    const trigger = triggerResult.rows[0];

    // Check if orchestration is published
    if (trigger.orchestration_status !== "published") {
      return NextResponse.json(
        {
          success: false,
          error: "Cannot test trigger for draft orchestration. Publish it first.",
        },
        { status: 400 }
      );
    }

    // Create execution record
    const execution = await createExecution({
      orchestrationId: trigger.orchestration_id,
      orchestrationVersion: trigger.version,
      context: {
        trigger: {
          type: trigger.trigger_type,
          testMode: true,
          testPayload: testPayload || {},
        },
      },
      triggerData: testPayload || {},
      triggeredBy: `manual-test:${session.user.email}`,
    });

    // Log trigger test
    await pool.query(
      `INSERT INTO trigger_execution_logs
       (trigger_id, orchestration_id, execution_id, status, payload, triggered_by)
       VALUES ($1, $2, $3, 'started', $4, $5)`,
      [
        triggerId,
        trigger.orchestration_id,
        execution.id,
        JSON.stringify(testPayload || {}),
        `manual-test:${session.user.email}`,
      ]
    );

    // Get nodes and connections
    const nodes = await getNodes(trigger.orchestration_id);
    const connections = await getConnections(trigger.orchestration_id);

    // Execute in background
    executeInBackground(
      execution,
      nodes,
      connections,
      triggerId,
      trigger.orchestration_id
    );

    return NextResponse.json({
      success: true,
      message: "Test execution started",
      executionId: execution.id,
      orchestrationName: trigger.orchestration_name,
    });
  } catch (error: any) {
    console.error("[ManualTriggerTestAPI] Error:", error);

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// Execute orchestration in background
async function executeInBackground(
  execution: any,
  nodes: any[],
  connections: any[],
  triggerId: string,
  orchestrationId: string
): Promise<void> {
  try {
    const engine = new OrchestrationEngine(execution, nodes, connections);
    const result = await engine.execute();

    const pool = getPool();
    await pool.query(
      `INSERT INTO trigger_execution_logs
       (trigger_id, orchestration_id, execution_id, status, triggered_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        triggerId,
        orchestrationId,
        execution.id,
        result.success ? "completed" : "failed",
        "manual-test-result",
      ]
    );

    if (!result.success) {
      console.error(
        `[ManualTriggerTest] Execution failed for trigger ${triggerId}:`,
        result.error
      );
    }
  } catch (error) {
    console.error(
      `[ManualTriggerTest] Background execution error for trigger ${triggerId}:`,
      error
    );
  }
}
