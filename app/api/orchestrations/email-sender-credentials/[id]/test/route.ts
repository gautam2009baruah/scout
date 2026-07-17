import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";

function decryptSecret(value: string | null) {
  if (!value) return "";
  return value.startsWith("encrypted:") ? value.slice("encrypted:".length) : value;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const companyId = session.user.tenantId;

    const result = await getPool().query<{
      provider: "smtp" | "gmail" | "outlook";
      smtp_host: string | null;
      smtp_port: number | null;
      smtp_secure: boolean;
      smtp_username: string | null;
      smtp_password: string | null;
      is_active: boolean;
    }>(
      `
        SELECT provider, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_password, is_active
        FROM email_sender_credentials
        WHERE id = $1
          AND company_id = $2
      `,
      [id, companyId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
    }

    const credential = result.rows[0];
    if (!credential.is_active) {
      return NextResponse.json({ success: false, error: "Credential is inactive" }, { status: 400 });
    }

    if (credential.provider !== "smtp") {
      return NextResponse.json({ success: false, error: "Only SMTP provider test is currently supported" }, { status: 400 });
    }

    if (!credential.smtp_host || !credential.smtp_username || !credential.smtp_password) {
      return NextResponse.json({ success: false, error: "SMTP host, username and password must be configured" }, { status: 400 });
    }

    const transporter = nodemailer.createTransport({
      host: credential.smtp_host,
      port: credential.smtp_port || 587,
      secure: credential.smtp_secure === true,
      auth: {
        user: credential.smtp_username,
        pass: decryptSecret(credential.smtp_password),
      },
    });

    await transporter.verify();

    return NextResponse.json({ success: true, message: "Sender connection successful" });
  } catch (error) {
    console.error("[API] Error testing sender credential:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unable to test sender credential" },
      { status: 500 }
    );
  }
}
