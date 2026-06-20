import { NextResponse } from "next/server";
import { EmployeeError, registerEmployee } from "@/lib/admin/user-management";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string" || typeof body.email !== "string") {
    return NextResponse.json({ message: "Name and email are required." }, { status: 400 });
  }

  try {
    const id = await registerEmployee(
      {
        companyId: String(body.companyId ?? ""),
        companyIds: Array.isArray(body.companyIds)
          ? body.companyIds.filter((value: unknown): value is string => typeof value === "string")
          : [],
        roleId: String(body.roleId ?? ""),
        name: body.name,
        email: body.email,
        employeeCode: typeof body.employeeCode === "string" ? body.employeeCode : undefined,
        moduleKeys: Array.isArray(body.moduleKeys)
          ? body.moduleKeys.filter((value: unknown): value is string => typeof value === "string")
          : []
      },
      session
    );

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
