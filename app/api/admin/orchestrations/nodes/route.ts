// API route for orchestration nodes
// Manage nodes within an orchestration

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import type { OrchestrationNode } from "@/shared/orchestrationTypes";

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

    // Get nodes for orchestration
    // In production, query from database
    const nodes: OrchestrationNode[] = [];

    return NextResponse.json({ nodes });
  } catch (error) {
    console.error("Error fetching nodes:", error);
    return NextResponse.json({ message: "Failed to fetch nodes" }, { status: 500 });
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
    const { orchestrationId, nodeType, label, positionX, positionY, config } = body;

    if (!orchestrationId || !nodeType || !label) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    // Create node
    const node: OrchestrationNode = {
      id: crypto.randomUUID(),
      orchestrationId,
      nodeType,
      label,
      positionX: positionX || 0,
      positionY: positionY || 0,
      config: config || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ node }, { status: 201 });
  } catch (error) {
    console.error("Error creating node:", error);
    return NextResponse.json({ message: "Failed to create node" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const body = await request.json();
    const { id, label, positionX, positionY, config } = body;

    if (!id) {
      return NextResponse.json({ message: "Missing required field: id" }, { status: 400 });
    }

    // Update node
    // In production, update database

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating node:", error);
    return NextResponse.json({ message: "Failed to update node" }, { status: 500 });
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
    const nodeId = searchParams.get("id");

    if (!nodeId) {
      return NextResponse.json({ message: "Missing required parameter: id" }, { status: 400 });
    }

    // Delete node
    // In production, delete from database

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting node:", error);
    return NextResponse.json({ message: "Failed to delete node" }, { status: 500 });
  }
}
