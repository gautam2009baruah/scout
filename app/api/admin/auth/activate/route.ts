import { NextResponse } from "next/server";
import { activateEmployeeAccount, EmployeeError } from "@/lib/admin/user-management";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_COOKIE_SECURE, revokeCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ message: "Activation token and password are required." }, { status: 400 });
  }

  try {
    await activateEmployeeAccount(body.token, body.password);

    // Clear any pre-existing session cookie in this browser (it may belong to a
    // different, already-logged-in user) so "Go to login" reaches the login
    // form instead of silently continuing that other session.
    await revokeCurrentAdminSession();

    const response = NextResponse.json({ ok: true });

    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: "",
      httpOnly: true,
      sameSite: "strict",
      secure: ADMIN_SESSION_COOKIE_SECURE,
      path: "/",
      maxAge: 0
    });

    return response;
  } catch (error) {
    if (error instanceof EmployeeError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
