import { NextResponse } from "next/server";
import { changeCurrentUserPassword, PasswordChangeError } from "@/lib/admin/password-change";
import { getCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.password !== "string") {
    return NextResponse.json({ message: "Password is required." }, { status: 400 });
  }

  try {
    await changeCurrentUserPassword(session, body.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PasswordChangeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
