// GET the list of published versions for a guide, for the "Version history"
// picker in the editor (see components/admin/guided-workflow-console.tsx).
// Loading a version's content lives at ./[version]/route.ts.

import { NextResponse } from "next/server";
import { getGuidedWorkflowById, listGuideVersionSummaries, GuidedWorkflowError } from "@/lib/admin/guided-workflows";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }
  if (!hasModuleAccess(session, MODULE_KEYS.guidedWorkflows)) {
    return NextResponse.json({ message: "You do not have permission to manage guided workflows." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    // Confirms the guide exists and is visible to this session.
    await getGuidedWorkflowById(id, session);

    const versions = await listGuideVersionSummaries(id);
    return NextResponse.json({ versions });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
