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
            channels: {
              email: {
                enabled: true,
                to: "user@example.com",
                subject: "Order Confirmation for {{customerName}}",
                body: "Hello {{customerName}}, your order {{orderId}} is confirmed.",
              },
              slack: {
                enabled: true,
                webhookUrl: "https://hooks.slack.com/services/...",
                message: "Deployment completed for {{environment}}",
              },
            },
          },
          context: {
            variable: "value to substitute in message",
          },
        },
        examples: {
          email: {
            config: {
              type: "notification",
              channels: {
                email: {
                  enabled: true,
                  to: "user@example.com",
                  subject: "Order Confirmation for {{customerName}}",
                  body: "Hello {{customerName}},\n\nYour order {{orderId}} has been confirmed.\n\nThank you!",
                  bodyFormat: "rich_text",
                  priority: "normal",
                },
              },
            },
            context: {
              customerName: "John Doe",
              orderId: "ORD-12345",
            },
          },
          teams: {
            config: {
              type: "notification",
              channels: {
                teams: {
                  enabled: true,
                  webhookUrl: "https://outlook.office.com/webhook/...",
                  title: "Workflow Alert",
                  message: "Workflow {{workflowName}} completed successfully.",
                  messageFormat: "adaptive_card",
                },
              },
            },
            context: {
              workflowName: "Customer Onboarding",
            },
          },
          slack: {
            config: {
              type: "notification",
              channels: {
                slack: {
                  enabled: true,
                  webhookUrl: "https://hooks.slack.com/services/...",
                  message: "Deployment to {{environment}} completed!",
                  messageFormat: "plain_text",
                },
              },
            },
            context: {
              environment: "production",
            },
          },
          internal: {
            config: {
              type: "notification",
              channels: {
                internal: {
                  enabled: true,
                  users: "user@example.com",
                  title: "Task Assigned",
                  message: "You have been assigned task: {{taskName}}",
                  notificationType: "information",
                },
              },
            },
            context: {
              taskName: "Review customer feedback",
            },
          },
        },
      },
      notes: {
        email: "Requires SMTP_HOST environment variable configured",
        teams: "Provide webhookUrl for Teams connector",
        slack: "Provide webhookUrl for Slack app/webhook",
        sms: "Provide channel webhookUrl or NOTIFICATION_SMS_WEBHOOK_URL",
        whatsapp: "Provide channel webhookUrl or NOTIFICATION_WHATSAPP_WEBHOOK_URL",
        internal: "Creates notification in database for in-app display",
        variables: "Use {{variableName}} syntax in channel fields",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
