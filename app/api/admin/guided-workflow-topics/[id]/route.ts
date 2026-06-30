import { NextResponse } from "next/server";
import { deleteGuidedWorkflowTopic, getGuidedWorkflowTopicById, GuidedWorkflowError, listRecordedActionsForTopic, updateGuidedWorkflowTopic } from "@/lib/admin/guided-workflows";
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
    const [topic, actions] = await Promise.all([
      getGuidedWorkflowTopicById(id, auth.session),
      listRecordedActionsForTopic(id, auth.session)
    ]);

    return NextResponse.json({ topic, actions });
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
    return NextResponse.json({
      topic: await updateGuidedWorkflowTopic(
        id,
        {
          title: typeof body?.title === "string" ? body.title : undefined,
          move: body?.move === "up" || body?.move === "down" ? body.move : undefined
        },
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
    await deleteGuidedWorkflowTopic(id, auth.session);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
