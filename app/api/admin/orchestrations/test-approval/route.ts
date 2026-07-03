// Test endpoint for human approval workflow
// Allows testing approval functionality without full orchestration

import { NextRequest, NextResponse } from "next/server";
import { executeHumanApprovalNode } from "@/lib/orchestrations/nodes/human-approval-node";
import type { HumanApprovalNodeConfig } from "@/shared/orchestrationTypes";
import { getCurrentAdminSession } from "@/lib/admin/session";

// POST - Test approval node execution
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { config, context, executionId, nodeId } = body;

    if (!config || !context) {
      return NextResponse.json(
        { error: "config and context are required" },
        { status: 400 }
      );
    }

    // Use test IDs if not provided
    const testExecutionId = executionId || `test-exec-${Date.now()}`;
    const testNodeId = nodeId || `test-node-${Date.now()}`;

    // Execute the approval node
    const result = await executeHumanApprovalNode(
      config as HumanApprovalNodeConfig,
      context,
      testExecutionId,
      testNodeId
    );

    return NextResponse.json({
      result,
      message: result.paused
        ? "Approval created and email sent. Check the approvals page to respond."
        : result.success
        ? "Approval node executed successfully"
        : "Approval node failed",
    });
  } catch (error) {
    console.error("Error testing approval node:", error);
    return NextResponse.json(
      {
        error: "Failed to test approval node",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET - Return test examples
export async function GET() {
  return NextResponse.json({
    description: "Test human approval workflow",
    endpoint: "/api/admin/orchestrations/test-approval",
    method: "POST",
    examples: [
      {
        name: "Simple Approval",
        description: "Basic approval request with no fields",
        request: {
          config: {
            type: "human_approval",
            title: "Test Approval Required",
            description: "Please approve this test request",
            approverEmail: "approver@example.com",
            fields: [],
          },
          context: {
            requestId: "12345",
            requesterName: "John Doe",
          },
        },
      },
      {
        name: "Approval with Fields",
        description: "Approval with dynamic field values from context",
        request: {
          config: {
            type: "human_approval",
            title: "Invoice Approval Required",
            description: "Please review and approve this invoice",
            approverEmail: "{{managerEmail}}",
            fields: [
              {
                label: "Invoice Number",
                value: "{{invoiceNumber}}",
              },
              {
                label: "Amount",
                value: "{{amount}}",
              },
              {
                label: "Vendor",
                value: "{{vendorName}}",
              },
              {
                label: "Department",
                value: "{{department}}",
              },
            ],
          },
          context: {
            managerEmail: "manager@example.com",
            invoiceNumber: "INV-2024-001",
            amount: "$5,000.00",
            vendorName: "Acme Corp",
            department: "IT",
          },
        },
      },
      {
        name: "Expense Approval",
        description: "Travel expense approval with multiple fields",
        request: {
          config: {
            type: "human_approval",
            title: "Travel Expense Approval",
            description: "A team member has submitted a travel expense report for your approval",
            approverEmail: "{{approverEmail}}",
            fields: [
              {
                label: "Employee",
                value: "{{employeeName}}",
              },
              {
                label: "Trip Purpose",
                value: "{{tripPurpose}}",
              },
              {
                label: "Travel Dates",
                value: "{{travelDates}}",
              },
              {
                label: "Total Amount",
                value: "{{totalAmount}}",
              },
              {
                label: "Categories",
                value: "{{categories}}",
              },
            ],
          },
          context: {
            approverEmail: "approver@example.com",
            employeeName: "Jane Smith",
            tripPurpose: "Client meeting in New York",
            travelDates: "Jan 15-18, 2024",
            totalAmount: "$2,450.00",
            categories: "Flights, Hotel, Meals",
          },
        },
      },
      {
        name: "Content Approval",
        description: "Content publishing approval workflow",
        request: {
          config: {
            type: "human_approval",
            title: "Content Publishing Approval",
            description: "New content is ready for review before publishing",
            approverEmail: "editor@example.com",
            fields: [
              {
                label: "Content Title",
                value: "{{contentTitle}}",
              },
              {
                label: "Author",
                value: "{{author}}",
              },
              {
                label: "Category",
                value: "{{category}}",
              },
              {
                label: "Publish Date",
                value: "{{publishDate}}",
              },
            ],
          },
          context: {
            contentTitle: "Q4 2024 Product Roadmap",
            author: "Product Team",
            category: "Product Updates",
            publishDate: "December 1, 2024",
            contentUrl: "https://cms.example.com/content/123",
          },
        },
      },
    ],
    workflow: [
      "1. POST to this endpoint with approval config and context",
      "2. Approval record created in database",
      "3. Email sent to approver with approval link",
      "4. Approver visits /control-panel/approvals/[id] to respond",
      "5. On approval, orchestration automatically resumes",
    ],
    notes: [
      "Requires valid SMTP configuration for email sending",
      "Approver email can use {{variable}} syntax",
      "Field values can use {{variable}} syntax from context",
      "For testing, use your own email as approverEmail",
    ],
  });
}
