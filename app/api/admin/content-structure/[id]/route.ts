import { NextResponse } from "next/server";
import { deleteTopic, TopicError, updateTopic } from "@/lib/admin/content-structure";
import { MODULE_KEYS, hasModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    return NextResponse.json({ message: "You do not have permission to manage folders." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ message: "Folder name is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    await updateTopic(
      id,
      {
        allRoles: body.allRoles === true,
        allUsers: body.allUsers === true,
        name: body.name,
        roleIds: Array.isArray(body.roleIds)
          ? body.roleIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        userIds: Array.isArray(body.userIds)
          ? body.userIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        targetAppIds: Array.isArray(body.targetAppIds)
          ? body.targetAppIds.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Unable to update folder", error);
    return NextResponse.json({ message: "Unable to update folder." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    return NextResponse.json({ message: "You do not have permission to manage folders." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    await deleteTopic(id, session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
