/**
 * API route for testing notification node execution
 * POST /api/admin/orchestrations/test-notification
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { executeNotificationNode } from "@/lib/orchestrations/nodes/notification-node";
import { assertEnvironmentScope, assertTargetAppScope, RequestScopeError } from "@/lib/orchestrations/request-scope";
import { getPool } from "@/lib/db/pool";

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

    const supplied = context && typeof context === "object" ? context as Record<string, unknown> : {};
    const suppliedTrigger = supplied.trigger && typeof supplied.trigger === "object" ? supplied.trigger as Record<string, unknown> : {};
    const suppliedInput = suppliedTrigger.input && typeof suppliedTrigger.input === "object" ? suppliedTrigger.input as Record<string, unknown> : {};
    const targetAppId = String(supplied.targetAppId || suppliedInput.targetAppId || "").trim();
    const environmentId = String(supplied.environmentId || suppliedInput.environmentId || "").trim();
    if (environmentId && !targetAppId) {
      throw new RequestScopeError("An environment requires a target application.", 400);
    }
    if (environmentId) await assertEnvironmentScope(session, targetAppId, environmentId);
    else if (targetAppId) await assertTargetAppScope(session, targetAppId);

    const emailConfig = config?.channels?.email;
    if (emailConfig?.enabled) {
      if (!targetAppId) {
        throw new RequestScopeError("A target application is required to test an email notification.", 400);
      }
      const selectedId = environmentId
        ? String(emailConfig.senderCredentialIdByEnvironment?.[environmentId] || emailConfig.senderCredentialId || "")
        : String(emailConfig.senderCredentialId || "");
      if (!selectedId) {
        throw new RequestScopeError("An email sender credential is required.", 400);
      }
      const sender = await getPool().query<{ id: string }>(
        `SELECT esc.id
         FROM email_sender_credentials esc
         WHERE esc.id = $1
           AND esc.company_id = $2
           AND esc.target_app_id = $3
           AND esc.is_active = true
           AND ($4::uuid IS NULL OR EXISTS (
             SELECT 1 FROM email_sender_credential_environments esce
             WHERE esce.email_sender_credential_id = esc.id AND esce.environment_id = $4
           ))`,
        [selectedId, session.user.tenantId, targetAppId, environmentId || null],
      );
      if (!sender.rows[0]) {
        throw new RequestScopeError("Email sender credential was not found in this scope.");
      }
    }

    // Tenant identity is authoritative from the session. Never allow a test
    // payload to select another company's SMTP credential via context.
    const scopedContext = {
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
    const result = await executeNotificationNode(config, scopedContext);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    if (error instanceof RequestScopeError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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
                senderCredentialId: "<email_sender_credentials.id>",
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
                  senderCredentialId: "0d8a4f2c-6b6b-4f25-8b56-71f50f93af92",
                  to: "user@example.com",
                  subject: "Order Confirmation for {{customerName}}",
                  body: "Hello {{customerName}},\n\nYour order {{orderId}} has been confirmed.\n\nThank you!",
                  bodyFormat: "rich_text",
                  priority: "normal",
                },
              },
            },
            context: {
              companyId: "<company-id>",
              targetAppId: "<target-app-id>",
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
        email: "Requires channels.email.senderCredentialId mapped to an active sender credential in email_sender_credentials",
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
