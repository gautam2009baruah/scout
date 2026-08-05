// API route for orchestration nodes
// Manage nodes within an orchestration

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  getNodes,
  createNode,
  updateNode,
  deleteNode,
  getNodeById,
  assertOrchestrationOwnership,
  OrchestrationAccessError,
} from "@/lib/orchestrations/db";
import type { NodeType } from "@/shared/orchestrationTypes";

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

    await assertOrchestrationOwnership(session, orchestrationId);

    // Get nodes for orchestration
    const nodes = await getNodes(orchestrationId);

    return NextResponse.json({ nodes });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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
    const { orchestrationId, nodeType, label, positionX, positionY, config, displayDescription } = body;

    if (!orchestrationId || !nodeType || !label) {
      return NextResponse.json(
        { message: "Missing required fields" },
        { status: 400 }
      );
    }

    await assertOrchestrationOwnership(session, orchestrationId);

    // Create node
    const node = await createNode({
      orchestrationId,
      nodeType: nodeType as NodeType,
      label,
      positionX: positionX || 0,
      positionY: positionY || 0,
      config: config || {},
      displayDescription,
    });

    return NextResponse.json({ node }, { status: 201 });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Error creating node:", error instanceof Error ? error.message : error);
    const message = error instanceof Error ? error.message : "Failed to create node";
    return NextResponse.json({ message }, { status: 500 });
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
    const { id, label, positionX, positionY, config, displayDescription } = body;

    if (!id) {
      return NextResponse.json({ message: "Missing required field: id" }, { status: 400 });
    }

    const existingNode = await getNodeById(id);
    if (!existingNode) {
      return NextResponse.json({ message: "Node not found" }, { status: 404 });
    }
    await assertOrchestrationOwnership(session, existingNode.orchestrationId);

    // Update node
    const node = await updateNode(id, {
      label,
      positionX,
      positionY,
      config,
      displayDescription,
    });

    return NextResponse.json({ node });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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

    const existingNode = await getNodeById(nodeId);
    if (!existingNode) {
      return NextResponse.json({ message: "Node not found" }, { status: 404 });
    }
    await assertOrchestrationOwnership(session, existingNode.orchestrationId);

    // Delete node
    await deleteNode(nodeId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting node:", error);
    return NextResponse.json({ message: "Failed to delete node" }, { status: 500 });
  }
}
