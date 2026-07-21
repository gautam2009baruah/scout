import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/admin/password-reset";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body.email !== "string") {
    return NextResponse.json({ message: "Email is required." }, { status: 400 });
  }

  try {
    await requestPasswordReset(body.email);
  } catch (error) {
    // Never surface delivery/lookup errors to the caller — doing so would leak
    // whether an account exists. Log for operators and still return success.
    console.error("[ForgotPassword] Failed to process reset request", error);
  }

  // Always respond the same way regardless of whether the email is registered.
  return NextResponse.json({ ok: true });
}
