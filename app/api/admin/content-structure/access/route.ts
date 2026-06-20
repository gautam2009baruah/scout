import { NextResponse } from "next/server";
import { grantTopicAccess, TopicError } from "@/lib/admin/content-structure";
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

  if (!body || typeof body.topicId !== "string") {
    return NextResponse.json({ message: "Topic is required." }, { status: 400 });
  }

  try {
    await grantTopicAccess(
      {
        topicId: body.topicId,
        roleIds: Array.isArray(body.roleIds)
          ? body.roleIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        userIds: Array.isArray(body.userIds)
          ? body.userIds.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof TopicError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
