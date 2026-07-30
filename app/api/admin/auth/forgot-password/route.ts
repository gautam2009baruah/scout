import { NextResponse } from "next/server";
import { PasswordResetError, requestPasswordReset } from "@/lib/admin/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ message: "Email is required." }, { status: 400 });
  }

  try {
    await requestPasswordReset(body.email);
  } catch (error) {
    if (error instanceof PasswordResetError) {
      return NextResponse.json({ message: error.message }, { status: 404 });
    }

    console.error("[ForgotPassword] Failed to process reset request", error);
    return NextResponse.json({ message: "Unable to process your request. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
