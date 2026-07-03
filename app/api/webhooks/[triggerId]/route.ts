// Webhook Trigger Execution Endpoint
// POST/GET/PUT /api/webhooks/[triggerId]
// Accepts webhook requests and executes orchestrations

import { NextRequest, NextResponse } from "next/server";
import {
  getTriggerById,
  buildTriggerContext,
  updateTriggerLastTriggered,
  logWebhookRequest,
  createTriggerLog,
  decryptTriggerConfig,
} from "@/lib/orchestrations/triggers";
import {
  getOrchestrationById,
  createExecution,
  getNodes,
  getConnections,
} from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import type { WebhookTriggerConfig, TriggerConfig } from "@/shared/orchestrationTypes";

async function handleWebhook(
  request: NextRequest,
  triggerId: string
) {
  const startTime = Date.now();
  
  let statusCode = 500;
  let responseBody: Record<string, unknown> = {};
  let errorMessage: string | null = null;
  let secretValidated = false;
  let ipAllowed = true;
  let orchestrationId = "";

  try {
    const method = request.method;

    // ========================================================================
    // 1. Get Trigger
    // ========================================================================

    const trigger = await getTriggerById(triggerId);
    if (!trigger) {
      statusCode = 404;
      errorMessage = "Webhook trigger not found";
      responseBody = { error: errorMessage };
      return NextResponse.json(responseBody, { status: statusCode });
    }

    orchestrationId = trigger.orchestrationId;
    const triggerConfig = decryptTriggerConfig(trigger.config as TriggerConfig) as WebhookTriggerConfig;

    // ========================================================================
    // 2. Check if Trigger is Enabled
    // ========================================================================

    if (!triggerConfig.enabled) {
      statusCode = 403;
      errorMessage = "Webhook trigger is disabled";
      responseBody = { error: errorMessage };
      
      await logWebhookRequest({
        triggerId: trigger.id,
        orchestrationId: trigger.orchestrationId,
        method,
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated: false,
        ipAllowed: true,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    // ========================================================================
    // 3. Validate HTTP Method
    // ========================================================================

    if (!triggerConfig.allowedMethods.includes(method as any)) {
      statusCode = 405;
      errorMessage = `Method ${method} not allowed. Allowed methods: ${triggerConfig.allowedMethods.join(", ")}`;
      responseBody = { error: errorMessage };
      
      await logWebhookRequest({
        triggerId: trigger.id,
        orchestrationId: trigger.orchestrationId,
        method,
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated: false,
        ipAllowed: true,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { 
        status: statusCode,
        headers: {
          "Allow": triggerConfig.allowedMethods.join(", "),
        },
      });
    }

    // ========================================================================
    // 4. Validate IP Address (if allowlist configured)
    // ========================================================================

    const clientIP = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    
    if (triggerConfig.allowedIPs && triggerConfig.allowedIPs.length > 0) {
      // Extract first IP from x-forwarded-for (may contain multiple IPs)
      const requestIP = clientIP.split(",")[0].trim();
      
      if (!triggerConfig.allowedIPs.includes(requestIP)) {
        ipAllowed = false;
        statusCode = 403;
        errorMessage = `IP address ${requestIP} not in allowlist`;
        responseBody = { error: errorMessage };
        
        await logWebhookRequest({
          triggerId: trigger.id,
          orchestrationId: trigger.orchestrationId,
          method,
          statusCode,
          errorMessage,
          ipAddress: requestIP,
          userAgent: request.headers.get("user-agent") || undefined,
          secretValidated: false,
          ipAllowed: false,
          durationMs: Date.now() - startTime,
        });
        
        return NextResponse.json(responseBody, { status: statusCode });
      }
    }

    // ========================================================================
    // 5. Validate Secret
    // ========================================================================

    const providedSecret = request.headers.get("x-scout-webhook-secret");
    
    if (!providedSecret || providedSecret !== triggerConfig.secret) {
      statusCode = 401;
      errorMessage = "Invalid or missing X-Scout-Webhook-Secret header";
      responseBody = { error: errorMessage };
      
      await logWebhookRequest({
        triggerId: trigger.id,
        orchestrationId: trigger.orchestrationId,
        method,
        statusCode,
        errorMessage,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated: false,
        ipAllowed,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    secretValidated = true;

    // ========================================================================
    // 6. Parse Request Data
    // ========================================================================

    // Collect headers
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Parse query parameters
    const queryParams: Record<string, string> = {};
    request.nextUrl.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });

    // Parse body
    let requestBody: Record<string, unknown> = {};
    try {
      const body = await request.json();
      requestBody = body || {};
    } catch (e) {
      // Body might be empty or not JSON
      requestBody = {};
    }

    // TODO: Validate against payloadSchema if configured
    if (triggerConfig.payloadSchema) {
      // JSON Schema validation can be added here
    }

    // ========================================================================
    // 7. Validate Orchestration
    // ========================================================================

    const orchestration = await getOrchestrationById(trigger.orchestrationId);
    if (!orchestration) {
      statusCode = 404;
      errorMessage = "Orchestration not found";
      responseBody = { error: errorMessage };
      
      await logWebhookRequest({
        triggerId: trigger.id,
        orchestrationId: trigger.orchestrationId,
        method,
        headers,
        queryParams,
        requestBody,
        statusCode,
        errorMessage,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated,
        ipAllowed,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    if (orchestration.status === "draft") {
      statusCode = 400;
      errorMessage = "Cannot execute draft orchestration";
      responseBody = { error: errorMessage };
      
      await logWebhookRequest({
        triggerId: trigger.id,
        orchestrationId: trigger.orchestrationId,
        method,
        headers,
        queryParams,
        requestBody,
        statusCode,
        errorMessage,
        ipAddress: clientIP,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated,
        ipAllowed,
        durationMs: Date.now() - startTime,
      });
      
      return NextResponse.json(responseBody, { status: statusCode });
    }

    // ========================================================================
    // 8. Create Trigger Logs
    // ========================================================================

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId: trigger.orchestrationId,
      status: "received",
      payload: requestBody,
      triggeredBy: clientIP,
    });

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId: trigger.orchestrationId,
      status: "validated",
      payload: requestBody,
      triggeredBy: clientIP,
    });

    // ========================================================================
    // 9. Build Trigger Context
    // ========================================================================

    const triggerContext = buildTriggerContext(
      trigger,
      {
        headers,
        query: queryParams,
        body: requestBody,
      },
      clientIP
    );

    // ========================================================================
    // 10. Create Execution
    // ========================================================================

    const execution = await createExecution({
      orchestrationId: trigger.orchestrationId,
      orchestrationVersion: orchestration.version,
      context: {
        trigger: triggerContext,
      },
      triggerData: requestBody,
      triggeredBy: clientIP,
    });

    await createTriggerLog({
      triggerId: trigger.id,
      orchestrationId: trigger.orchestrationId,
      executionId: execution.id,
      status: "started",
      payload: requestBody,
      triggeredBy: clientIP,
    });

    // Update last triggered timestamp
    await updateTriggerLastTriggered(trigger.id);

    // Get nodes and connections
    const nodes = await getNodes(trigger.orchestrationId);
    const connections = await getConnections(trigger.orchestrationId);

    // Start execution in background
    executeInBackground(execution, nodes, connections, trigger.id, trigger.orchestrationId, clientIP);

    // ========================================================================
    // 11. Success Response
    // ========================================================================

    statusCode = 202; // Accepted
    responseBody = {
      success: true,
      executionId: execution.id,
      orchestrationId: orchestration.id,
      orchestrationName: orchestration.name,
      status: execution.status,
      message: "Orchestration execution started",
      receivedAt: new Date().toISOString(),
    };

    await logWebhookRequest({
      triggerId: trigger.id,
      orchestrationId: trigger.orchestrationId,
      executionId: execution.id,
      method,
      headers,
      queryParams,
      requestBody,
      statusCode,
      responseBody,
      ipAddress: clientIP,
      userAgent: request.headers.get("user-agent") || undefined,
      secretValidated,
      ipAllowed,
      durationMs: Date.now() - startTime,
    });

    return NextResponse.json(responseBody, { status: statusCode });

  } catch (error: unknown) {
    console.error("Webhook execution error:", error);

    statusCode = 500;
    errorMessage = error instanceof Error ? error.message : "Internal server error";
    responseBody = { 
      error: "Failed to execute orchestration",
      details: process.env.NODE_ENV === "development" ? errorMessage : undefined,
    };

    if (orchestrationId) {
      await logWebhookRequest({
        triggerId,
        orchestrationId,
        method: request.method,
        statusCode,
        errorMessage,
        ipAddress: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || undefined,
        userAgent: request.headers.get("user-agent") || undefined,
        secretValidated,
        ipAllowed,
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

// Export HTTP method handlers
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  const triggerId = (await context.params).triggerId;
  return handleWebhook(request, triggerId);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  const triggerId = (await context.params).triggerId;
  return handleWebhook(request, triggerId);
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ triggerId: string }> }
) {
  const triggerId = (await context.params).triggerId;
  return handleWebhook(request, triggerId);
}
