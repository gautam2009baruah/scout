import { NextResponse } from "next/server";
import { DocumentError, getDocumentAccess, replaceDocumentAccess } from "@/lib/admin/documents";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const access = await getDocumentAccess(id, session);
    return NextResponse.json({ access });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  try {
    const { id } = await context.params;
    const access = await replaceDocumentAccess(
      id,
      {
        roleIds: Array.isArray(body?.roleIds)
          ? body.roleIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        userIds: Array.isArray(body?.userIds)
          ? body.userIds.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );
    return NextResponse.json({ access });
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }
}
