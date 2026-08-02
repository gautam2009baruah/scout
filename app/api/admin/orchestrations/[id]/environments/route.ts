// GET/PUT which environments an orchestration is promoted to, and at which
// published version. Publishing an orchestration is not sufficient for it to
// be eligible on the live chat path — it must also be explicitly promoted to
// an environment here, and edits after promotion don't affect that
// environment until it's promoted again. Promotion can target any past
// published version, not just the latest, so a rollback or an intentionally
// older tested build is always available. Versions are MAJOR.BUILD — see
// lib/orchestrations/db.ts (promoteOrchestrationToEnvironment /
// revokeOrchestrationFromEnvironment / getOrchestrationEnvironmentReleases /
// listOrchestrationVersionSummaries).

import { NextRequest, NextResponse } from "next/server";
import {
  getOrchestrationById,
  getOrchestrationEnvironmentReleases,
  listOrchestrationVersionSummaries,
  promoteOrchestrationToEnvironment,
  revokeOrchestrationFromEnvironment,
} from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { requireModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteContext) {
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
    if (!orchestration.targetAppId) {
      return NextResponse.json({ message: "Assign a target app to this orchestration before releasing it to an environment." }, { status: 400 });
    }

    const [environments, versions] = await Promise.all([
      getOrchestrationEnvironmentReleases(id),
      listOrchestrationVersionSummaries(id),
    ]);

    return NextResponse.json({
      currentVersionMajor: orchestration.versionMajor,
      currentVersionBuild: orchestration.versionBuild,
      environments,
      versions,
    });
  } catch (error) {
    console.error("Error fetching orchestration environment releases:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch environment releases" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
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
    if (!orchestration.targetAppId) {
      return NextResponse.json({ message: "Assign a target app to this orchestration before releasing it to an environment." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const environmentId = typeof body?.environmentId === "string" ? body.environmentId : "";
    const action = body?.action === "promote" || body?.action === "revoke" ? body.action : null;
    if (!environmentId || !action) {
      return NextResponse.json({ message: "environmentId and action are required." }, { status: 400 });
    }

    if (action === "promote") {
      const versionMajor = Number(body?.versionMajor);
      const versionBuild = Number(body?.versionBuild);
      if (!Number.isInteger(versionMajor) || versionMajor < 1 || !Number.isInteger(versionBuild) || versionBuild < 0) {
        return NextResponse.json({ message: "A valid version is required to promote." }, { status: 400 });
      }
      await promoteOrchestrationToEnvironment(id, environmentId, versionMajor, versionBuild, session.user.id);
    } else {
      await revokeOrchestrationFromEnvironment(id, environmentId, session.user.id);
    }

    const refreshed = await getOrchestrationById(id);
    const [environments, versions] = await Promise.all([
      getOrchestrationEnvironmentReleases(id),
      listOrchestrationVersionSummaries(id),
    ]);

    return NextResponse.json({
      currentVersionMajor: refreshed?.versionMajor ?? orchestration.versionMajor,
      currentVersionBuild: refreshed?.versionBuild ?? orchestration.versionBuild,
      environments,
      versions,
    });
  } catch (error) {
    console.error("Error saving orchestration environment releases:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to save environment releases" },
      { status: 500 }
    );
  }
}
