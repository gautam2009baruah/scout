// GET/PUT which environments a guided workflow guide is promoted to, and at
// which published version. Publishing a guide is not sufficient for it to be
// eligible on the live player path — it must also be explicitly promoted to
// an environment here, and edits after promotion don't affect that
// environment until it's promoted again. Promotion can target any past
// published version, not just the latest, so a rollback or an intentionally
// older tested build is always available. See lib/admin/guided-workflows.ts
// (promoteGuideToEnvironment / revokeGuideFromEnvironment /
// getGuideEnvironmentReleases / getGuideVersionInfo / listGuideVersionSummaries).

import { NextResponse } from "next/server";
import {
  getGuidedWorkflowById,
  getGuideEnvironmentReleases,
  getGuideVersionInfo,
  listGuideVersionSummaries,
  promoteGuideToEnvironment,
  revokeGuideFromEnvironment,
  GuidedWorkflowError,
} from "@/lib/admin/guided-workflows";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function requireSession() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return { response: NextResponse.json({ message: "Authentication required." }, { status: 401 }) };
  }

  if (!hasModuleAccess(session, MODULE_KEYS.guidedWorkflows)) {
    return { response: NextResponse.json({ message: "You do not have permission to manage guided workflows." }, { status: 403 }) };
  }

  return { session };
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const guide = await getGuidedWorkflowById(id, auth.session);
    if (!guide.targetAppId) {
      return NextResponse.json({ message: "Assign a target app to this guide before releasing it to an environment." }, { status: 400 });
    }

    const [versionInfo, environments, versions] = await Promise.all([
      getGuideVersionInfo(id),
      getGuideEnvironmentReleases(id),
      listGuideVersionSummaries(id),
    ]);

    return NextResponse.json({
      currentVersionMajor: versionInfo?.versionMajor ?? 1,
      currentVersionBuild: versionInfo?.versionBuild ?? 0,
      environments,
      versions,
    });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    // Confirms the guide exists and is visible to this session before writing.
    const guide = await getGuidedWorkflowById(id, auth.session);
    if (!guide.targetAppId) {
      return NextResponse.json({ message: "Assign a target app to this guide before releasing it to an environment." }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const environmentId = typeof body?.environmentId === "string" ? body.environmentId : "";
    const action = body?.action === "promote" || body?.action === "revoke" ? body.action : null;
    if (!environmentId || !action) {
      return NextResponse.json({ message: "environmentId and action are required." }, { status: 400 });
    }

    let prunedVersionsCount = 0;

    if (action === "promote") {
      const versionMajor = Number(body?.versionMajor);
      const versionBuild = Number(body?.versionBuild);
      if (!Number.isInteger(versionMajor) || versionMajor < 1 || !Number.isInteger(versionBuild) || versionBuild < 0) {
        return NextResponse.json({ message: "A valid version is required to promote." }, { status: 400 });
      }
      const result = await promoteGuideToEnvironment(id, environmentId, versionMajor, versionBuild, auth.session.user.id);
      prunedVersionsCount = result.prunedVersionsCount;
    } else {
      await revokeGuideFromEnvironment(id, environmentId, auth.session.user.id);
    }

    const [versionInfo, environments, versions] = await Promise.all([
      getGuideVersionInfo(id),
      getGuideEnvironmentReleases(id),
      listGuideVersionSummaries(id),
    ]);

    return NextResponse.json({
      currentVersionMajor: versionInfo?.versionMajor ?? 1,
      currentVersionBuild: versionInfo?.versionBuild ?? 0,
      environments,
      versions,
      prunedVersionsCount,
    });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
