import { NextResponse } from "next/server";
import { EmployeeError, resetEmployeePassword } from "@/lib/admin/user-management";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    await resetEmployeePassword(id, session);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    console.error("Error resetting employee password:", error);
    const message = error instanceof Error ? error.message : "Unable to reset password.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
