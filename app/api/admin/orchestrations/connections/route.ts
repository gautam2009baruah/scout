// API route for orchestration connections
// Manage connections between nodes

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import type { OrchestrationConnection } from "@/shared/orchestrationTypes";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const { searchParams } = request.nextUrl;
    const orchestrationId = searchParams.get("orchestrationId");

    if (!orchestrationId) {
      return NextResponse.json(
        { message: "Missing required parameter: orchestrationId" },
        { status: 400 }
      );
    }

    // Get connections for orchestration
    // In production, query from database
    const connections: OrchestrationConnection[] = [];

    return NextResponse.json({ connections });
  } catch (error) {
    console.error("Error fetching connections:", error);
    return NextResponse.json({ message: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { orchestrationId, sourceNodeId, targetNodeId, sourceHandle, targetHandle, condition } =
      body;

    if (!orchestrationId || !sourceNodeId || !targetNodeId) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    // Create connection
    const connection: OrchestrationConnection = {
      id: crypto.randomUUID(),
      orchestrationId,
      sourceNodeId,
      targetNodeId,
      sourceHandle: sourceHandle || null,
      targetHandle: targetHandle || null,
      condition: condition || null,
      createdAt: new Date().toISOString(),
    };

    return NextResponse.json({ connection }, { status: 201 });
  } catch (error) {
    console.error("Error creating connection:", error);
    return NextResponse.json({ message: "Failed to create connection" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const { searchParams } = request.nextUrl;
    const connectionId = searchParams.get("id");

    if (!connectionId) {
      return NextResponse.json({ message: "Missing required parameter: id" }, { status: 400 });
    }

    // Delete connection
    // In production, delete from database

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting connection:", error);
    return NextResponse.json({ message: "Failed to delete connection" }, { status: 500 });
  }
}
