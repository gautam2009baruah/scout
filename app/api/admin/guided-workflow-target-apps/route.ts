import { NextResponse } from "next/server";
import { createGuidedWorkflowTargetApp, GuidedWorkflowError, listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";
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
  return NextResponse.json({ targetApps: await listGuidedWorkflowTargetApps(auth.session) });
}

export async function POST(request: Request) {
  const auth = await requireSession();
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Target app payload is required." }, { status: 400 });
  }

  try {
    const app = await createGuidedWorkflowTargetApp(
      {
        companyId: String(body.companyId ?? ""),
        name: String(body.name ?? ""),
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : ""
      },
      auth.session
    );

    return NextResponse.json({ targetApp: app }, { status: 201 });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }

    throw error;
  }
}
