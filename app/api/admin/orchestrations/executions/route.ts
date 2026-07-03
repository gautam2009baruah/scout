/**
 * API endpoint for orchestration executions
 * GET: List executions with filters
 */

import { NextRequest, NextResponse } from "next/server";
import { getExecutions } from "@/lib/orchestrations/db";
import type { OrchestrationExecutionStatus } from "@/shared/orchestrationTypes";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const orchestrationId = searchParams.get("orchestrationId");
    const status = searchParams.get("status");

    const filters: {
      orchestrationId?: string;
      status?: OrchestrationExecutionStatus;
    } = {};

    if (orchestrationId) filters.orchestrationId = orchestrationId;
    if (status) filters.status = status as OrchestrationExecutionStatus;

    let executions = await getExecutions(filters);
    
    // Apply limit on the client side since DB doesn't support it
    const limit = parseInt(searchParams.get("limit") || "50");
    if (limit > 0) {
      executions = executions.slice(0, limit);
    }

    return NextResponse.json({ executions });
  } catch (error) {
    console.error("Error fetching executions:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch executions" },
      { status: 500 }
    );
  }
}
