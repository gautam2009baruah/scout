import { NextResponse } from "next/server";
import { PasswordResetError, resetPassword } from "@/lib/admin/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.token !== "string" || typeof body.password !== "string") {
    return NextResponse.json({ message: "Reset token and password are required." }, { status: 400 });
  }

  try {
    await resetPassword(body.token, body.password);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }

    throw error;
  }
}
