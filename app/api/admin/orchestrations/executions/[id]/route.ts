/**
 * API endpoint for single orchestration execution details
 * GET: Get execution with node execution logs
 */

import { NextRequest, NextResponse } from "next/server";
import { getExecutionById, getNodeExecutions } from "@/lib/orchestrations/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const execution = await getExecutionById(id);
    if (!execution) {
      return NextResponse.json({ message: "Execution not found" }, { status: 404 });
    }

    const nodeExecutions = await getNodeExecutions(id);

    return NextResponse.json({ 
      execution,
      nodeExecutions
    });
  } catch (error) {
    console.error("Error fetching execution details:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch execution details" },
      { status: 500 }
    );
  }
}
