import { NextResponse } from "next/server";
import { deleteRole, MasterDataError, updateRole } from "@/lib/admin/administration";
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

  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ message: "Role name is required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;
    const role = await updateRole(
      id,
      {
        name: body.name,
        isAdminRole: body.isAdminRole === true,
        description: typeof body.description === "string" ? body.description : undefined,
        moduleKeys: Array.isArray(body.moduleKeys) ? body.moduleKeys.map((k: unknown) => String(k)) : undefined
      },
      session
    );

    return NextResponse.json({ role });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await deleteRole(id, session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MasterDataError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
