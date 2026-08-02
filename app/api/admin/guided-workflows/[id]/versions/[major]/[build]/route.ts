// GET a single past published version's full content, for loading it back
// into the editor (see components/admin/guided-workflow-console.tsx). This
// only reads — nothing is persisted until the admin explicitly saves.

import { NextResponse } from "next/server";
import { getGuidedWorkflowById, getGuideVersionContent, GuidedWorkflowError } from "@/lib/admin/guided-workflows";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; major: string; build: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }
  if (!hasModuleAccess(session, MODULE_KEYS.guidedWorkflows)) {
    return NextResponse.json({ message: "You do not have permission to manage guided workflows." }, { status: 403 });
  }

  try {
    const { id, major, build } = await context.params;
    // Confirms the guide exists and is visible to this session.
    await getGuidedWorkflowById(id, session);

    const versionMajor = Number(major);
    const versionBuild = Number(build);
    if (!Number.isInteger(versionMajor) || versionMajor < 1 || !Number.isInteger(versionBuild) || versionBuild < 0) {
      return NextResponse.json({ message: "Invalid version." }, { status: 400 });
    }

    const content = await getGuideVersionContent(id, versionMajor, versionBuild);
    if (!content) {
      return NextResponse.json({ message: `Version ${versionMajor}.${String(versionBuild).padStart(3, "0")} was not found.` }, { status: 404 });
    }

    return NextResponse.json({ content });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
