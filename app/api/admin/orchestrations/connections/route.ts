// API route for orchestration connections
// Manage connections between nodes

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getConnections, createConnection, deleteConnection } from "@/lib/orchestrations/db";

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
    const connections = await getConnections(orchestrationId);

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
    const connection = await createConnection({
      orchestrationId,
      sourceNodeId,
      targetNodeId,
      sourceHandle,
      targetHandle,
      condition,
    });

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
    await deleteConnection(connectionId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting connection:", error);
    return NextResponse.json({ message: "Failed to delete connection" }, { status: 500 });
  }
}
