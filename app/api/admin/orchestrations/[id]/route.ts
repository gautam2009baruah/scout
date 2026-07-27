/**
 * API endpoint for single orchestration operations
 * GET: Load a single orchestration by id (e.g. for URL-param auto-load in
 * the designer — see components/admin/orchestration-designer.tsx)
 * DELETE: Delete an orchestration
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteOrchestration, getOrchestrationById } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const orchestration = await getOrchestrationById(id);

    if (!orchestration || orchestration.companyId !== session.user.tenantId) {
      return NextResponse.json({ message: "Orchestration not found" }, { status: 404 });
    }

    return NextResponse.json({ orchestration });
  } catch (error) {
    console.error("Error fetching orchestration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch orchestration" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await deleteOrchestration(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting orchestration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete orchestration" },
      { status: 500 }
    );
  }
}
