import { NextResponse } from "next/server";
import { createTopic, TopicError } from "@/lib/admin/content-structure";
import { MODULE_KEYS, hasModuleAccess } from "@/lib/admin/permissions";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  if (!hasModuleAccess(session, MODULE_KEYS.contentStructure)) {
    return NextResponse.json({ message: "You do not have permission to manage topics." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.companyId !== "string" || typeof body.name !== "string") {
    return NextResponse.json({ message: "Company and topic name are required." }, { status: 400 });
  }

  try {
    const id = await createTopic(
      {
        allRoles: body.allRoles === true,
        allUsers: body.allUsers === true,
        companyId: body.companyId,
        parentId: typeof body.parentId === "string" && body.parentId ? body.parentId : null,
        name: body.name,
        roleIds: Array.isArray(body.roleIds)
          ? body.roleIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        userIds: Array.isArray(body.userIds)
          ? body.userIds.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
