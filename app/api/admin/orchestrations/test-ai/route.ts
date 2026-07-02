/**
 * API route for testing AI node execution from orchestrations
 * POST /api/admin/orchestrations/test-ai
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeAIExtractionNode } from "@/lib/orchestrations/nodes/ai-extraction-node";
import { executeAIDecisionNode } from "@/lib/orchestrations/nodes/ai-decision-node";

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

    let result;

    if (nodeType === "ai_extraction") {
      result = await executeAIExtractionNode(config, context || {});
    } else if (nodeType === "ai_decision") {
      result = await executeAIDecisionNode(config, context || {});
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
          nodeType: "ai_extraction | ai_decision",
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
            ai_decision: {
              inputSource: "sourceVariable (path in context)",
              prompt: "Analyze the input and decide the action",
              decisions: [
                {
                  label: "Approve",
                  description: "When data is valid",
                  outputHandle: "approved",
                },
                {
                  label: "Reject",
                  description: "When data is invalid",
                  outputHandle: "rejected",
                },
              ],
              defaultDecision: "rejected",
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
          decision: {
            nodeType: "ai_decision",
            config: {
              inputSource: "sentiment",
              prompt: "Classify the sentiment of this text",
              decisions: [
                {
                  label: "Positive",
                  description: "Positive sentiment",
                  outputHandle: "positive",
                },
                {
                  label: "Negative",
                  description: "Negative sentiment",
                  outputHandle: "negative",
                },
                {
                  label: "Neutral",
                  description: "Neutral sentiment",
                  outputHandle: "neutral",
                },
              ],
              defaultDecision: "neutral",
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
