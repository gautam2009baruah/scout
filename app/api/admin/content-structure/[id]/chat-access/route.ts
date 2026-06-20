import { NextResponse } from "next/server";
import { getFolderDocumentAccess, replaceFolderDocumentAccess, TopicError } from "@/lib/admin/content-structure";
import { MODULE_KEYS, hasModuleAccess } from "@/lib/admin/permissions";
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

  if (!hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    return NextResponse.json({ message: "You do not have permission to manage folder chat access." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const access = await getFolderDocumentAccess(id, session);
    return NextResponse.json({ access });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    return NextResponse.json({ message: "You do not have permission to manage folder chat access." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  try {
    const { id } = await context.params;
    const access = await replaceFolderDocumentAccess(
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
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
