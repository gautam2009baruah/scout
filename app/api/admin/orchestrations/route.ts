// API route for orchestrations CRUD operations
// GET, POST, PUT, DELETE orchestrations

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getOrchestrations, getOrchestrationById } from "@/lib/orchestrations/db";
import type { OrchestrationStatus } from "@/shared/orchestrationTypes";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const { searchParams } = request.nextUrl;
    const orchestrationId = searchParams.get("id");
    const companyId = searchParams.get("companyId");
    const status = searchParams.get("status") as OrchestrationStatus | null;

    // Get single orchestration by ID
    if (orchestrationId) {
      const orchestration = await getOrchestrationById(orchestrationId);
      if (!orchestration) {
        return NextResponse.json({ message: "Orchestration not found" }, { status: 404 });
      }
      return NextResponse.json({ orchestration });
    }

    // Get orchestrations with filters
    const orchestrations = await getOrchestrations({
      companyId: companyId || undefined,
      status: status || undefined,
    });

    return NextResponse.json({ orchestrations });
  } catch (error) {
    console.error("Error fetching orchestrations:", error);
    return NextResponse.json(
      { message: "Failed to fetch orchestrations" },
      { status: 500 }
    );
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
    const { companyId, name, description, triggerType, triggerConfig, variables } = body;

    // Validate required fields
    if (!companyId || !name || !triggerType) {
      return NextResponse.json(
        { message: "Missing required fields: companyId, name, triggerType" },
        { status: 400 }
      );
    }

    // Create orchestration in database
    const { createOrchestration } = await import("@/lib/orchestrations/db");
    const orchestration = await createOrchestration({
      companyId,
      name,
      description,
      triggerType,
      triggerConfig,
      variables,
      createdByEmail: session.user.email,
    });

    return NextResponse.json({ orchestration }, { status: 201 });
  } catch (error) {
    console.error("Error creating orchestration:", error);
    return NextResponse.json(
      { message: "Failed to create orchestration" },
      { status: 500 }
    );
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
    const { id, name, description, triggerType, triggerConfig, variables, publish } = body;

    if (!id) {
      return NextResponse.json(
        { message: "Missing required field: id" },
        { status: 400 }
      );
    }

    const { updateOrchestration, publishOrchestration } = await import("@/lib/orchestrations/db");

    // Handle publish action
    if (publish) {
      const orchestration = await publishOrchestration(id, session.user.email);
      return NextResponse.json({ orchestration });
    }

    // Update orchestration
    const orchestration = await updateOrchestration(id, {
      name,
      description,
      triggerType,
      triggerConfig,
      variables,
      updatedByEmail: session.user.email,
    });

    return NextResponse.json({ orchestration });
  } catch (error) {
    console.error("Error updating orchestration:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to update orchestration";
    return NextResponse.json(
      { message: errorMessage },
      { status: 500 }
    );
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
    const orchestrationId = searchParams.get("id");

    if (!orchestrationId) {
      return NextResponse.json(
        { message: "Missing required parameter: id" },
        { status: 400 }
      );
    }

    // Delete orchestration (CASCADE will handle related records)
    const { deleteOrchestration } = await import("@/lib/orchestrations/db");
    await deleteOrchestration(orchestrationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting orchestration:", error);
    return NextResponse.json(
      { message: "Failed to delete orchestration" },
      { status: 500 }
    );
  }
}
