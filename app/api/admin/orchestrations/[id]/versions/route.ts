// GET the list of published versions for an orchestration, for the "Version
// history" picker in the designer (see components/admin/orchestration-designer.tsx).
// Loading a version's graph content lives at ./[version]/route.ts.

import { NextResponse } from "next/server";
import { getOrchestrationById, listOrchestrationVersionSummaries } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const { id } = await params;
    const orchestration = await getOrchestrationById(id);
    if (!orchestration || orchestration.companyId !== session.user.tenantId) {
      return NextResponse.json({ message: "Orchestration not found" }, { status: 404 });
    }

    const versions = await listOrchestrationVersionSummaries(id);
    return NextResponse.json({ versions });
  } catch (error) {
    console.error("Error fetching orchestration version history:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch version history" },
      { status: 500 }
    );
  }
}
