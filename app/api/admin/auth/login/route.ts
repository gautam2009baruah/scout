import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MINUTES, createAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.email !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ message: "Email and password are required." }, { status: 400 });
  }

  const login = await createAdminSession({
    email: body.email,
    password: body.password
  });

  if (!login) {
    return NextResponse.json({ message: "Invalid email or password." }, { status: 401 });
  }

  const response = NextResponse.json({
    user: login.session.user,
    tenant: login.session.tenant,
    mustChangePassword: login.session.user.mustChangePassword,
    expiresAt: login.session.expiresAt
  });

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: login.token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MINUTES * 60
  });

  return response;
}
