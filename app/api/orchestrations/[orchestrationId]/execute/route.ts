// API Trigger Execution Endpoint
// POST /api/orchestrations/[orchestrationId]/execute
// Allows authenticated API clients to execute orchestrations

import { NextRequest, NextResponse } from "next/server";
import {
  authenticateAPIClient,
  getTriggers,
  buildTriggerContext,
  updateAPIClientLastUsed,
  checkRateLimit,
  logAPIRequest,
  createTriggerLog,
  updateTriggerLastTriggered,
} from "@/lib/orchestrations/triggers";
import {
  getOrchestrationById,
  createExecution,
  getNodes,
  getConnections,
} from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import type { APITriggerConfig } from "@/shared/orchestrationTypes";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orchestrationId: string }> }
) {
  const startTime = Date.now();
  const orchestrationId = (await context.params).orchestrationId;
  
  let clientId: string | null = null;
  let statusCode = 500;
  let responseBody: Record<string, unknown> = {};
  let errorMessage: string | null = null;

  try {
    // ========================================================================
    // 1. Authenticate API Client
    // ========================================================================

    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      statusCode = 401;
      errorMessage = "Missing or invalid Authorization header. Expected: Bearer <api_key>";
      responseBody = { error: errorMessage };
      return NextResponse.json(responseBody, { status: statusCode });
    }

    const apiKey = authHeader.substring(7); // Remove "Bearer "
    const client = await authenticateAPIClient(apiKey);

    if (!client) {
      statusCode = 401;
      errorMessage = "Invalid API key";
      responseBody = { error: errorMessage };
      return NextResponse.json(responseBody, { status: statusCode });
    }

    clientId = client.id;

    // ========================================================================
    // 2. Check Rate Limit
    // ========================================================================

    const rateLimit = await checkRateLimit(client.id, client.rateLimit);
    if (!rateLimit.allowed) {
      statusCode = 429;
      errorMessage = `Rate limit exceeded. Limit: ${client.rateLimit} requests/minute`;
      responseBody = { 
        error: errorMessage,
        rateLimitRemaining: 0,
        retryAfter: 60, // seconds
      };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { 
        status: statusCode,
        headers: {
          "X-RateLimit-Limit": client.rateLimit.toString(),
          "X-RateLimit-Remaining": "0",
          "Retry-After": "60",
        },
      });
    }

    // ========================================================================
    // 3. Check Client Permissions
    // ========================================================================

    if (
      client.allowedOrchestrations.length > 0 &&
      !client.allowedOrchestrations.includes(orchestrationId)
    ) {
      statusCode = 403;
      errorMessage = "This API client is not authorized to execute this orchestration";
      responseBody = { error: errorMessage };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    // ========================================================================
    // 4. Validate Orchestration
    // ========================================================================

    const orchestration = await getOrchestrationById(orchestrationId);
    if (!orchestration) {
      statusCode = 404;
      errorMessage = "Orchestration not found";
      responseBody = { error: errorMessage };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    if (orchestration.status === "draft") {
      statusCode = 400;
      errorMessage = "Cannot execute draft orchestration. Publish it first.";
      responseBody = { error: errorMessage };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    // ========================================================================
    // 5. Get API Trigger
    // ========================================================================

    const triggers = await getTriggers({
      orchestrationId,
      triggerType: "api",
      status: "active",
    });

    if (triggers.length === 0) {
      statusCode = 404;
      errorMessage = "No active API trigger found for this orchestration";
      responseBody = { error: errorMessage };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    const trigger = triggers[0];
    const triggerConfig = trigger.config as APITriggerConfig;

    if (!triggerConfig.enabled) {
      statusCode = 403;
      errorMessage = "API trigger is disabled";
      responseBody = { error: errorMessage };
      
      await logAPIRequest({
        clientId: client.id,
        orchestrationId,
        triggerId: trigger.id,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    // ========================================================================
    // 6. Validate Request Body
    // ========================================================================

    let requestBody: Record<string, unknown> = {};
    try {
      const body = await request.json();
      requestBody = body || {};
    } catch (e) {
      // Empty body is acceptable
      requestBody = {};
    }

    // TODO: Validate against requestSchema if configured
    if (triggerConfig.requestSchema) {
      // JSON Schema validation can be added here
    }

    // ========================================================================
    // 7. Create Trigger Logs
    // ========================================================================

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      status: "received",
      payload: requestBody,
      triggeredBy: client.name,
    });

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      status: "validated",
      payload: requestBody,
      triggeredBy: client.name,
    });

    // ========================================================================
    // 8. Build Trigger Context
    // ========================================================================

    const triggerContext = buildTriggerContext(trigger, requestBody, client.name);

    // ========================================================================
    // 9. Create Execution
    // ========================================================================

    const execution = await createExecution({
      orchestrationId,
      orchestrationVersion: orchestration.version,
      context: {
        trigger: triggerContext,
      },
      triggerData: requestBody,
      triggeredBy: client.name,
    });

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId,
      executionId: execution.id,
      status: "started",
      payload: requestBody,
      triggeredBy: client.name,
    });

    // Update last used timestamp
    await updateAPIClientLastUsed(client.id);

    // Update trigger last triggered
    await updateTriggerLastTriggered(trigger.id);

    // Get nodes and connections
    const nodes = await getNodes(orchestrationId);
    const connections = await getConnections(orchestrationId);

    // Start execution in background
    executeInBackground(execution, nodes, connections, trigger.id, orchestrationId, client.name);

    // ========================================================================
    // 10. Success Response
    // ========================================================================

    statusCode = 202; // Accepted
    responseBody = {
      success: true,
      executionId: execution.id,
      orchestrationId: orchestration.id,
      orchestrationName: orchestration.name,
      status: execution.status,
      message: "Orchestration execution started",
      startedAt: execution.startedAt,
    };

    await logAPIRequest({
      clientId: client.id,
      orchestrationId,
      triggerId: trigger.id,
      executionId: execution.id,
      endpoint: `/api/orchestrations/${orchestrationId}/execute`,
      method: "POST",
      statusCode,
      requestBody,
      responseBody,
      ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
      userAgent: request.headers.get("user-agent") || undefined,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(responseBody, {
      status: statusCode,
      headers: {
        "X-RateLimit-Limit": client.rateLimit.toString(),
        "X-RateLimit-Remaining": rateLimit.remaining.toString(),
      },
    });

  } catch (error: unknown) {
    console.error("API trigger execution error:", error);

    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : "Internal server error";
    responseBody = { 
      error: "Failed to execute orchestration",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    };

    if (clientId) {
      await logAPIRequest({
        clientId,
        orchestrationId,
        endpoint: `/api/orchestrations/${orchestrationId}/execute`,
        method: "POST",
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        durationMs: Date.now() - startTime,
      });
    }

    return NextResponse.json(responseBody, { status: statusCode });
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
