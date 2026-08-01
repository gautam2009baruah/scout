import { NextResponse } from "next/server";
import { PasswordResetError, resetPassword } from "@/lib/admin/password-reset";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_COOKIE_SECURE, revokeCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ message: "Reset token and password are required." }, { status: 400 });
  }

  try {
    await resetPassword(body.token, body.password);

    // Whoever's session cookie happens to be in this browser (which may not be
    // the account that was just reset, e.g. an admin resetting someone else's
    // password on a shared machine) must not silently stay logged in — clear it
    // so the "Go to login" link on this page actually reaches the login form
    // instead of the middleware bouncing back to that stale session's dashboard.
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
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
