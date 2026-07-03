// API endpoint for manual trigger execution
// Allows users to manually start orchestrations with input

import { NextRequest, NextResponse } from "next/server";
import {
  getOrchestrationById,
  getNodes,
  getConnections,
  createExecution,
} from "@/lib/orchestrations/db";
import {
  getTriggers,
  createTriggerLog,
  updateTriggerLastTriggered,
  buildTriggerContext,
  validateTriggerConfig,
} from "@/lib/orchestrations/triggers";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import type { ManualTriggerConfig } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";

// POST - Execute orchestration via manual trigger
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { orchestrationId, input } = body;

    console.log("\n" + "▓".repeat(80));
    console.log("📥 TRIGGER EXECUTE API - RECEIVED REQUEST");
    console.log("▓".repeat(80));
    console.log("Orchestration ID:", orchestrationId);
    console.log("Input data:", JSON.stringify(input, null, 2));
    console.log("Input keys:", input ? Object.keys(input) : "none");
    console.log("▓".repeat(80) + "\n");

    if (!orchestrationId) {
      return NextResponse.json(
        { error: "orchestrationId is required" },
        { status: 400 }
      );
    }

    // Get orchestration
    const orchestration = await getOrchestrationById(orchestrationId);
    if (!orchestration) {
      return NextResponse.json(
        { error: "Orchestration not found" },
        { status: 404 }
      );
    }

    // Check if orchestration is published
    if (orchestration.status !== "published") {
      return NextResponse.json(
        { error: "Only published orchestrations can be triggered. Use test mode for drafts." },
        { status: 400 }
      );
    }

    // Get manual trigger for this orchestration
    const triggers = await getTriggers({
      orchestrationId,
      triggerType: "manual",
      status: "active",
    });

    if (triggers.length === 0) {
      return NextResponse.json(
        { error: "No active manual trigger found for this orchestration" },
        { status: 404 }
      );
    }

    const trigger = triggers[0];
    const triggerConfig = trigger.config as ManualTriggerConfig;

    // Validate required inputs
    if (triggerConfig.inputFields) {
      const missingFields: string[] = [];
      for (const field of triggerConfig.inputFields) {
        if (field.required && !input[field.name]) {
          missingFields.push(field.label || field.name);
        }
      }
      if (missingFields.length > 0) {
        return NextResponse.json(
          {
            error: "Missing required fields",
            details: missingFields,
          },
          { status: 400 }
        );
      }
    }

    // Log trigger received
    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      status: "received",
      payload: input || {},
      triggeredBy: session.user.email,
    });

    // Build trigger context
    const triggerContext = buildTriggerContext(trigger, input || {}, session.user.email);

    // Create orchestration execution
    const execution = await createExecution({
      orchestrationId,
      orchestrationVersion: orchestration.version,
      context: {
        trigger: triggerContext,
      },
      triggerData: input || {},
      triggeredBy: session.user.email,
    });

    // Log validation passed and execution started
    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      executionId: execution.id,
      status: "validated",
      payload: input || {},
      triggeredBy: session.user.email,
    });

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      executionId: execution.id,
      status: "started",
      payload: input || {},
      triggeredBy: session.user.email,
    });

    // Update trigger last triggered
    await updateTriggerLastTriggered(trigger.id);

    // Get nodes and connections
    const nodes = await getNodes(orchestrationId);
    const connections = await getConnections(orchestrationId);

    // Start execution in background
    // (In production, you might want to use a job queue)
    executeInBackground(execution, nodes, connections, trigger.id, orchestrationId, session.user.email);

    return NextResponse.json({
      success: true,
      executionId: execution.id,
      message: "Orchestration execution started",
    });
  } catch (error) {
    console.error("Error executing manual trigger:", error);
    return NextResponse.json(
      { error: "Failed to execute trigger" },
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
  orchestrationId: string,
  triggeredBy: string
) {
  try {
    const engine = new OrchestrationEngine(execution, nodes, connections);
    const result = await engine.execute();

    if (!result.success) {
      // Log failure
      await createTriggerLog({
        triggerId,
        orchestrationId,
        executionId: execution.id,
        status: "failed",
        payload: {},
        errorMessage: result.error,
        triggeredBy,
      });

      await updateTriggerLastTriggered(triggerId, result.error);
    }
  } catch (error) {
    console.error("Background execution error:", error);
    await createTriggerLog({
      triggerId,
      orchestrationId,
      executionId: execution.id,
      status: "failed",
      payload: {},
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      triggeredBy,
    });

    await updateTriggerLastTriggered(
      triggerId,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}
