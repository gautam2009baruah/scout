import { NextResponse } from "next/server";
import { createGuideFromRecordingSession, deleteGuidedWorkflowRecordingSession, getGuidedWorkflowRecordingSessionById, GuidedWorkflowError, listRecordedActionsForSession, updateGuidedWorkflowRecordingSession } from "@/lib/admin/guided-workflows";
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
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    const [recordingSession, actions] = await Promise.all([
      getGuidedWorkflowRecordingSessionById(id, auth.session),
      listRecordedActionsForSession(id, auth.session)
    ]);

    return NextResponse.json({ session: recordingSession, actions });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);

  try {
    const { id } = await context.params;

    if (body?.convert === true) {
      return NextResponse.json({ guide: await createGuideFromRecordingSession(String(body.topicId ?? id), auth.session) });
    }

    return NextResponse.json({
      session: await updateGuidedWorkflowRecordingSession(
        id,
        { title: body?.title },
        auth.session
      )
    });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;

  try {
    const { id } = await context.params;
    await deleteGuidedWorkflowRecordingSession(id, auth.session);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
