import { NextResponse } from "next/server";
import { createGuidedWorkflow, GuidedWorkflowError, listGuidedWorkflows } from "@/lib/admin/guided-workflows";
import { hasModuleAccess, MODULE_KEYS } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

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

export async function GET() {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  return NextResponse.json({ guides: await listGuidedWorkflows(auth.session) });
}

export async function POST(request: Request) {
  const auth = await requireSession();

  if ("response" in auth) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Guide payload is required." }, { status: 400 });
  }

  try {
    const guide = await createGuidedWorkflow(
      {
        companyId: String(body.companyId ?? body.company_id ?? ""),
        topicId: typeof body.topicId === "string" ? body.topicId : undefined,
        title: typeof body.title === "string" ? body.title : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        recordedActions: Array.isArray(body.recordedActions) ? body.recordedActions : Array.isArray(body.recorded_actions) ? body.recorded_actions : [],
        steps: Array.isArray(body.steps) ? body.steps : undefined
      },
      auth.session
    );

    return NextResponse.json({ guide }, { status: 201 });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
