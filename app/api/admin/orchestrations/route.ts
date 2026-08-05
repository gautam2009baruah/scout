// API route for orchestrations CRUD operations
// GET, POST, PUT, DELETE orchestrations

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import {
  getOrchestrationPage,
  getOrchestrationById,
  assertOrchestrationOwnership,
  OrchestrationAccessError,
} from "@/lib/orchestrations/db";
import type { OrchestrationStatus } from "@/shared/orchestrationTypes";

function resolveScopedCompanyId(session: Awaited<ReturnType<typeof getCurrentAdminSession>>, requested: string | null): string {
  if (!session) return "";
  if (requested && session.availableCompanies.some((company) => company.companyId === requested)) {
    return requested;
  }
  return session.user.tenantId;
}

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
    const targetAppId = searchParams.get("targetAppId");
    const search = searchParams.get("search");

    // Get single orchestration by ID
    if (orchestrationId) {
      const orchestration = await getOrchestrationById(orchestrationId);
      if (!orchestration || orchestration.companyId !== session.user.tenantId) {
        return NextResponse.json({ message: "Orchestration not found" }, { status: 404 });
      }
      return NextResponse.json({ orchestration });
    }

    // Get orchestrations with filters — companyId is always the caller's own
    // (or another company they explicitly have access to), never trusted
    // as-is from the query string.
    const result = await getOrchestrationPage({
      companyId: resolveScopedCompanyId(session, companyId),
      targetAppId: targetAppId || undefined,
      status: status || undefined,
      search: search || undefined,
      page: Number(searchParams.get("page") || 1),
      pageSize: Number(searchParams.get("pageSize") || 25),
      userId: session.user.id,
    });

    return NextResponse.json(result);
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
    const { targetAppId, name, description, variables } = body;
    const companyId = resolveScopedCompanyId(session, typeof body.companyId === "string" ? body.companyId : null);

    // Validate required fields
    if (!companyId || !name) {
      return NextResponse.json(
        { message: "Missing required fields: companyId, name" },
        { status: 400 }
      );
    }

    // Create orchestration in database
    const { createOrchestration } = await import("@/lib/orchestrations/db");
    const orchestration = await createOrchestration({
      companyId,
      targetAppId,
      name,
      description,
      variables,
      createdById: session.user.id,
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
    const { id, name, description, variables, targetAppId, publish } = body;

    if (!id) {
      return NextResponse.json(
        { message: "Missing required field: id" },
        { status: 400 }
      );
    }

    await assertOrchestrationOwnership(session, id);

    const { updateOrchestration, publishOrchestration } = await import("@/lib/orchestrations/db");

    // Handle publish action
    if (publish) {
      const orchestration = await publishOrchestration(id, session.user.id);
      return NextResponse.json({ orchestration });
    }

    // Update orchestration
    const orchestration = await updateOrchestration(id, {
      name,
      description,
      variables,
      targetAppId,
      updatedById: session.user.id,
    });

    return NextResponse.json({ orchestration });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
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

    await assertOrchestrationOwnership(session, orchestrationId);

    // Delete orchestration (CASCADE will handle related records)
    const { deleteOrchestration } = await import("@/lib/orchestrations/db");
    await deleteOrchestration(orchestrationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof OrchestrationAccessError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("Error deleting orchestration:", error);
    return NextResponse.json(
      { message: "Failed to delete orchestration" },
      { status: 500 }
    );
  }
}
