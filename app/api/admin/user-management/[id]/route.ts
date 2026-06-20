import { NextResponse } from "next/server";
import { deleteEmployee, EmployeeError, updateEmployee } from "@/lib/admin/user-management";
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

  if (!body || typeof body.name !== "string" || typeof body.email !== "string") {
    return NextResponse.json({ message: "Name and email are required." }, { status: 400 });
  }

  try {
    const { id } = await context.params;

    await updateEmployee(
      id,
      {
        companyId: String(body.companyId ?? ""),
        companyIds: Array.isArray(body.companyIds)
          ? body.companyIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        roleId: String(body.roleId ?? ""),
        name: body.name,
        email: body.email,
        employeeCode: typeof body.employeeCode === "string" ? body.employeeCode : undefined,
        status: body.status === "disabled" || body.status === "active" ? body.status : "invited",
        moduleKeys: Array.isArray(body.moduleKeys)
          ? body.moduleKeys.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeError) {
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
    await deleteEmployee(id, session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
