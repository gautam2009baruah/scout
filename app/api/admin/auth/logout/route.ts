import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, revokeCurrentAdminSession } from "@/lib/admin/session";

export const runtime = "nodejs";

export async function POST() {
  await revokeCurrentAdminSession();

  const response = NextResponse.json({ ok: true });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  response.cookies.set({
    name: "scout_logout_lock",
    value: "1",
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 120
  });

  return response;
}
