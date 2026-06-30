import { NextResponse } from "next/server";
import { createGuidedWorkflowTopic, GuidedWorkflowError, listGuidedWorkflowTopics } from "@/lib/admin/guided-workflows";
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
  if ("response" in auth) return auth.response;
  return NextResponse.json({ topics: await listGuidedWorkflowTopics(auth.session) });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Topic payload is required." }, { status: 400 });
  }

  try {
    const topic = await createGuidedWorkflowTopic(
      {
        recordingSessionId: String(body.recordingSessionId ?? ""),
        title: String(body.title ?? "")
      },
      auth.session
    );

    return NextResponse.json({ topic }, { status: 201 });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
