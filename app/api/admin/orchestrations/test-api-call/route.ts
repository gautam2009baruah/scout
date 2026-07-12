/**
 * API route for testing API call node execution
 * POST /api/admin/orchestrations/test-api-call
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeApiCallNode } from "@/lib/orchestrations/nodes/api-call-node";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { config, context } = body;

    if (!config) {
      return NextResponse.json({ message: "Missing required field: config" }, { status: 400 });
    }

    const result = await executeApiCallNode(config, context || {});
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Error testing API call node:", error);
    return NextResponse.json(
      {
        message: "Failed to test API call node",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    return NextResponse.json({
      message: "API call node testing endpoint",
      usage: {
        method: "POST",
        body: {
          config: {
            type: "api_call",
            apiUrl: "https://api.example.com/customers/{customerId}",
            method: "GET",
            pathVariables: [{ name: "customerId", value: "{{variables.customerId}}" }],
            queryParameters: [{ key: "expand", value: "orders", enabled: true }],
            headers: [{ key: "X-Correlation-Id", value: "{{trigger.id}}", enabled: true }],
            auth: { type: "bearer", bearerToken: "{{variables.accessToken}}" },
            timeout: 30000,
            retryAttempts: 2,
            retryDelayMs: 1000,
            failureStrategy: "stop",
            successStatusCodes: "200-299,304",
            outputVariableName: "apiResult",
          },
          context: {
            variables: {
              customerId: "CUST-1001",
              accessToken: "token-value",
            },
          },
        },
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
