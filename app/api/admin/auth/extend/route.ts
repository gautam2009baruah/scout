import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_MINUTES, extendCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST() {
  const expiresAt = await extendCurrentAdminSession();

  if (!expiresAt) {
    return NextResponse.json({ message: "No active session found." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;

  const response = NextResponse.json({ ok: true, expiresAt });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  if (token) {
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_MINUTES * 60
    });
  }

  return response;
}
