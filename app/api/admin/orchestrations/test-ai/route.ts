/**
 * API route for testing AI node execution from orchestrations
 * POST /api/admin/orchestrations/test-ai
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeAIExtractionNode } from "@/lib/orchestrations/nodes/ai-extraction-node";
import { executeAITaskNode } from "@/lib/orchestrations/nodes/ai-task-node";
import { assertEnvironmentScope, assertTargetAppScope, RequestScopeError } from "@/lib/orchestrations/request-scope";

async function buildTestContext(session: NonNullable<Awaited<ReturnType<typeof getCurrentAdminSession>>>, value: unknown) {
  const supplied = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const suppliedTrigger = supplied.trigger && typeof supplied.trigger === "object" ? supplied.trigger as Record<string, unknown> : {};
  const suppliedInput = suppliedTrigger.input && typeof suppliedTrigger.input === "object" ? suppliedTrigger.input as Record<string, unknown> : {};
  const targetAppId = String(supplied.targetAppId || suppliedInput.targetAppId || "").trim();
  const environmentId = String(supplied.environmentId || suppliedInput.environmentId || "").trim();

  if (environmentId && !targetAppId) {
    throw new RequestScopeError("An environment requires a target application.", 400);
  }
  if (environmentId) await assertEnvironmentScope(session, targetAppId, environmentId);
  else if (targetAppId) await assertTargetAppScope(session, targetAppId);

  return {
    ...supplied,
    companyId: session.user.tenantId,
    ...(targetAppId ? { targetAppId } : {}),
    ...(environmentId ? { environmentId } : {}),
    trigger: {
      ...suppliedTrigger,
      input: {
        ...suppliedInput,
        companyId: session.user.tenantId,
        ...(targetAppId ? { targetAppId } : {}),
        ...(environmentId ? { environmentId } : {}),
      },
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { nodeType, config, context } = body;

    if (!nodeType || !config) {
      return NextResponse.json(
        { message: "Missing required fields: nodeType, config" },
        { status: 400 }
      );
    }

    const scopedContext = await buildTestContext(session, context);
    let result;

    if (nodeType === "ai_extraction") {
      result = await executeAIExtractionNode(config, scopedContext);
    } else if (nodeType === "ai_task") {
      result = await executeAITaskNode(config, scopedContext);
    } else {
      return NextResponse.json(
        { message: `Unsupported node type: ${nodeType}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    if (error instanceof RequestScopeError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Error testing AI node:", error);
    return NextResponse.json(
      {
        message: "Failed to execute AI node",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    return NextResponse.json({
      message: "AI node testing endpoint",
      usage: {
        method: "POST",
        body: {
          nodeType: "ai_extraction | ai_task",
          config: {
            ai_extraction: {
              inputSource: "sourceVariable (path in context)",
              prompt: "optional custom extraction prompt",
              schema: {
                field1: { type: "string", required: true },
                field2: { type: "number" },
              },
              outputVariable: "extractedData",
            },
            ai_task: {
              instructionMode: "static | chat | hybrid",
              instruction: "Summarize the content in 3 bullet points",
              input: "{{sourceVariable}}",
              outputFormat: "text | json",
              outputFields: [
                { key: "subject", type: "string", description: "Email subject line" },
              ],
              outputVariable: "aiTask",
            },
          },
          context: {
            sourceVariable: "Sample text or data to analyze",
          },
        },
        examples: {
          extraction: {
            nodeType: "ai_extraction",
            config: {
              inputSource: "emailText",
              prompt: "Extract customer information from this email",
              schema: {
                customerName: { type: "string", required: true },
                email: { type: "string", required: true },
                phone: { type: "string" },
                requestType: { type: "string" },
              },
              outputVariable: "customerInfo",
            },
            context: {
              emailText:
                "Hi, I'm John Doe and I need help with my order. You can reach me at john@example.com or 555-1234.",
            },
          },
          task: {
            nodeType: "ai_task",
            config: {
              instructionMode: "static",
              instruction: "Classify the sentiment of this text as Positive, Negative, or Neutral.",
              input: "{{sentiment}}",
              outputFormat: "text",
              outputVariable: "aiTask",
            },
            context: {
              sentiment: "This product is amazing! I love it so much.",
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
