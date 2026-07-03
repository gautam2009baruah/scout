// API endpoint for trigger execution logs
// Retrieve audit logs for trigger executions

import { NextRequest, NextResponse } from "next/server";
import { getTriggerLogs } from "@/lib/orchestrations/triggers";
import { getCurrentAdminSession } from "@/lib/admin/session";

// GET - Get trigger execution logs
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const triggerId = searchParams.get("triggerId");
    const orchestrationId = searchParams.get("orchestrationId");
    const executionId = searchParams.get("executionId");
    const status = searchParams.get("status");
    const limit = searchParams.get("limit");

    const filters: any = {};
    if (triggerId) filters.triggerId = triggerId;
    if (orchestrationId) filters.orchestrationId = orchestrationId;
    if (executionId) filters.executionId = executionId;
    if (status) filters.status = status;
    if (limit) filters.limit = parseInt(limit) || 50;

    const logs = await getTriggerLogs(filters);
    return NextResponse.json({ logs });
  } catch (error) {
    console.error("Error getting trigger logs:", error);
    return NextResponse.json(
      { error: "Failed to get trigger logs" },
      { status: 500 }
    );
  }
}
