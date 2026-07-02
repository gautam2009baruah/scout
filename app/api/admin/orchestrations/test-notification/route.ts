/**
 * API route for testing notification node execution
 * POST /api/admin/orchestrations/test-notification
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeNotificationNode } from "@/lib/orchestrations/nodes/notification-node";

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
      return NextResponse.json(
        { message: "Missing required field: config" },
        { status: 400 }
      );
    }

    // Execute notification
    const result = await executeNotificationNode(config, context || {});

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Error testing notification:", error);
    return NextResponse.json(
      {
        message: "Failed to send notification",
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
      message: "Notification testing endpoint",
      usage: {
        method: "POST",
        body: {
          config: {
            type: "notification",
            channel: "email | teams | slack | internal",
            recipient: "email@example.com | webhook-url | user-id",
            subject: "optional - for email only",
            message: "Message text with {{variable}} support",
          },
          context: {
            variable: "value to substitute in message",
          },
        },
        examples: {
          email: {
            config: {
              type: "notification",
              channel: "email",
              recipient: "user@example.com",
              subject: "Order Confirmation for {{customerName}}",
              message: "Hello {{customerName}},\\n\\nYour order {{orderId}} has been confirmed.\\n\\nThank you!",
            },
            context: {
              customerName: "John Doe",
              orderId: "ORD-12345",
            },
          },
          teams: {
            config: {
              type: "notification",
              channel: "teams",
              recipient: "https://outlook.office.com/webhook/...",
              subject: "Workflow Alert",
              message: "Workflow {{workflowName}} completed successfully.",
            },
            context: {
              workflowName: "Customer Onboarding",
            },
          },
          slack: {
            config: {
              type: "notification",
              channel: "slack",
              recipient: "https://hooks.slack.com/services/...",
              message: "🎉 Deployment to {{environment}} completed!",
            },
            context: {
              environment: "production",
            },
          },
          internal: {
            config: {
              type: "notification",
              channel: "internal",
              recipient: "user@example.com",
              subject: "Task Assigned",
              message: "You have been assigned task: {{taskName}}",
            },
            context: {
              taskName: "Review customer feedback",
            },
          },
        },
      },
      notes: {
        email: "Requires SMTP_HOST environment variable configured",
        teams: "Recipient should be a Teams webhook URL",
        slack: "Recipient should be a Slack webhook URL",
        internal: "Creates notification in database for in-app display",
        variables: "Use {{variableName}} syntax in message and subject fields",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
