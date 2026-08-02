// GET a single past published version's full graph (nodes/connections), for
// loading it back into the designer canvas (see
// components/admin/orchestration-designer.tsx). This only reads — nothing is
// persisted until the admin explicitly saves.

import { NextResponse } from "next/server";
import { getOrchestrationById, getOrchestrationVersionSnapshot } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";

type RouteContext = { params: Promise<{ id: string; major: string; build: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    requireModuleAccess(session, MODULE_KEYS.guidedWorkflows);

    const { id, major, build } = await params;
    const orchestration = await getOrchestrationById(id);
    if (!orchestration || orchestration.companyId !== session.user.tenantId) {
      return NextResponse.json({ message: "Orchestration not found" }, { status: 404 });
    }

    const versionMajor = Number(major);
    const versionBuild = Number(build);
    if (!Number.isInteger(versionMajor) || versionMajor < 1 || !Number.isInteger(versionBuild) || versionBuild < 0) {
      return NextResponse.json({ message: "Invalid version." }, { status: 400 });
    }

    const snapshot = await getOrchestrationVersionSnapshot(id, versionMajor, versionBuild);
    if (!snapshot) {
      return NextResponse.json({ message: `Version ${versionMajor}.${String(versionBuild).padStart(3, "0")} was not found.` }, { status: 404 });
    }

    return NextResponse.json({ nodes: snapshot.nodes, connections: snapshot.connections });
  } catch (error) {
    console.error("Error fetching orchestration version content:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch version content" },
      { status: 500 }
    );
  }
}
