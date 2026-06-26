import { NextResponse } from "next/server";
import { deleteRecordedActionForGuideStep, getGuidedWorkflowById, GuidedWorkflowError, regenerateGuidedWorkflow, updateGuidedWorkflow } from "@/lib/admin/guided-workflows";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

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
    return NextResponse.json({ guide: await getGuidedWorkflowById(id, auth.session) });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Guide payload is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const guide = typeof body.deleteStepId === "string"
      ? await deleteRecordedActionForGuideStep(id, body.deleteStepId, auth.session)
      : body.regenerate === true
      ? await regenerateGuidedWorkflow(id, auth.session)
      : await updateGuidedWorkflow(
        id,
        {
          title: typeof body.title === "string" ? body.title : undefined,
          description: typeof body.description === "string" ? body.description : undefined,
          status: body.status === "unpublished" || body.status === "draft" || body.status === "published" ? body.status : undefined,
          recordedActions: Array.isArray(body.recordedActions) ? body.recordedActions : undefined,
          steps: Array.isArray(body.steps) ? body.steps : undefined
        },
        auth.session
      );

    return NextResponse.json({ guide });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
