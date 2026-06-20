import { NextResponse } from "next/server";
import { activateEmployeeAccount, EmployeeError } from "@/lib/admin/user-management";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ message: "Activation token and password are required." }, { status: 400 });
  }

  try {
    await activateEmployeeAccount(body.token, body.password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof EmployeeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
