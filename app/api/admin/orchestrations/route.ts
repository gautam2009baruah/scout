// API route for orchestrations CRUD operations
// GET, POST, PUT, DELETE orchestrations

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import type { Orchestration } from "@/shared/orchestrationTypes";

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
    const status = searchParams.get("status");

    // Get orchestrations
    // In production, query from database
    const orchestrations: Orchestration[] = [];

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

    // Create orchestration
    // In production, insert into database
    const orchestration: Orchestration = {
      id: crypto.randomUUID(),
      companyId,
      name,
      description: description || null,
      version: 1,
      status: "draft",
      triggerType,
      triggerConfig: triggerConfig || {},
      variables: variables || {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByEmail: session.user.email,
      updatedByEmail: session.user.email,
      publishedAt: null,
      publishedByEmail: null,
    };

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
    const { id, name, description, triggerType, triggerConfig, variables } = body;

    if (!id) {
      return NextResponse.json(
        { message: "Missing required field: id" },
        { status: 400 }
      );
    }

    // Update orchestration
    // In production, update database
    const orchestration: Orchestration = {
      id,
      companyId: body.companyId,
      name,
      description: description || null,
      version: body.version || 1,
      status: body.status || "draft",
      triggerType,
      triggerConfig: triggerConfig || {},
      variables: variables || {},
      createdAt: body.createdAt,
      updatedAt: new Date().toISOString(),
      createdByEmail: body.createdByEmail,
      updatedByEmail: session.user.email,
      publishedAt: body.publishedAt || null,
      publishedByEmail: body.publishedByEmail || null,
    };

    return NextResponse.json({ orchestration });
  } catch (error) {
    console.error("Error updating orchestration:", error);
    return NextResponse.json(
      { message: "Failed to update orchestration" },
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

    // Delete orchestration
    // In production, delete from database (CASCADE will handle related records)

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting orchestration:", error);
    return NextResponse.json(
      { message: "Failed to delete orchestration" },
      { status: 500 }
    );
  }
}
