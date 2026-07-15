import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

function encryptSecret(secret: string | null | undefined) {
  if (!secret) return null;
  return `encrypted:${secret}`;
}

async function validateTargetAppScope(companyId: string, targetAppId: string | null) {
  if (!targetAppId) {
    return;
  }

  const scopeCheck = await getPool().query<{ id: string }>(
    "SELECT id FROM guided_workflow_target_apps WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL",
    [targetAppId, companyId]
  );

  if ((scopeCheck.rowCount ?? 0) === 0) {
    throw new Error("Invalid target app scope for selected company.");
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const companyId = request.nextUrl.searchParams.get("companyId") || session.user.tenantId;

    const result = await getPool().query<{
      id: string;
      company_id: string;
      target_app_id: string | null;
      target_app_name: string | null;
      provider: "smtp" | "gmail" | "outlook";
      name: string;
      description: string | null;
      from_name: string | null;
      from_email: string;
      reply_to_email: string | null;
      smtp_host: string | null;
      smtp_port: number | null;
      smtp_secure: boolean;
      smtp_username: string | null;
      is_active: boolean;
      is_primary: boolean;
      updated_at: Date;
      created_at: Date;
    }>(
      `
        SELECT
          esc.id,
          esc.company_id,
          esc.target_app_id,
          ta.name AS target_app_name,
          esc.provider,
          esc.name,
          esc.description,
          esc.from_name,
          esc.from_email,
          esc.reply_to_email,
          esc.smtp_host,
          esc.smtp_port,
          esc.smtp_secure,
          esc.smtp_username,
          esc.is_active,
          esc.is_primary,
          esc.updated_at,
          esc.created_at
        FROM email_sender_credentials esc
        LEFT JOIN guided_workflow_target_apps ta ON ta.id = esc.target_app_id
        WHERE esc.company_id = $1
        ORDER BY esc.target_app_id NULLS FIRST, esc.is_primary DESC, esc.created_at DESC
      `,
      [companyId]
    );

    return NextResponse.json({ success: true, credentials: result.rows });
  } catch (error) {
    console.error("[API] Error listing sender email credentials:", error);
    return NextResponse.json({ success: false, error: "Unable to retrieve sender credentials" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json();
    const companyId = String(body.companyId || session.user.tenantId);
    const targetAppId = body.targetAppId ? String(body.targetAppId) : null;
    const provider = String(body.provider || "smtp") as "smtp" | "gmail" | "outlook";
    const name = String(body.name || "").trim();
    const description = body.description ? String(body.description).trim() : null;
    const fromName = body.fromName ? String(body.fromName).trim() : null;
    const fromEmail = String(body.fromEmail || "").trim();
    const replyToEmail = body.replyToEmail ? String(body.replyToEmail).trim() : null;
    const smtpHost = body.smtpHost ? String(body.smtpHost).trim() : null;
    const smtpPort = body.smtpPort ? Number(body.smtpPort) : 587;
    const smtpSecure = body.smtpSecure === true;
    const smtpUsername = body.smtpUsername ? String(body.smtpUsername).trim() : null;
    const smtpPassword = body.smtpPassword ? String(body.smtpPassword) : null;
    const oauthAccessToken = body.oauthAccessToken ? String(body.oauthAccessToken) : null;
    const oauthRefreshToken = body.oauthRefreshToken ? String(body.oauthRefreshToken) : null;
    const oauthTokenExpiresAt = body.oauthTokenExpiresAt ? new Date(String(body.oauthTokenExpiresAt)) : null;
    const oauthScope = body.oauthScope ? String(body.oauthScope) : null;
    const isActive = body.isActive !== false;
    const isPrimary = body.isPrimary === true;

    if (!name || !fromEmail) {
      return NextResponse.json({ success: false, error: "Name and From email are required" }, { status: 400 });
    }

    if (provider === "smtp" && (!smtpHost || !smtpUsername || !smtpPassword)) {
      return NextResponse.json({ success: false, error: "SMTP host, username, and password are required for SMTP provider" }, { status: 400 });
    }

    await validateTargetAppScope(companyId, targetAppId);

    const client = await getPool().connect();
    try {
      await client.query("BEGIN");

      if (isPrimary && isActive) {
        await client.query(
          `
            UPDATE email_sender_credentials
            SET is_primary = false, updated_by = $3, updated_at = now()
            WHERE company_id = $1
              AND COALESCE(target_app_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          `,
          [companyId, targetAppId, session.user.id]
        );
      }

      const result = await client.query(
        `
          INSERT INTO email_sender_credentials (
            company_id,
            target_app_id,
            provider,
            name,
            description,
            from_name,
            from_email,
            reply_to_email,
            smtp_host,
            smtp_port,
            smtp_secure,
            smtp_username,
            smtp_password,
            oauth_access_token,
            oauth_refresh_token,
            oauth_token_expires_at,
            oauth_scope,
            is_active,
            is_primary,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$20
          )
          RETURNING id
        `,
        [
          companyId,
          targetAppId,
          provider,
          name,
          description,
          fromName,
          fromEmail,
          replyToEmail,
          smtpHost,
          Number.isFinite(smtpPort) ? smtpPort : 587,
          smtpSecure,
          smtpUsername,
          encryptSecret(smtpPassword),
          encryptSecret(oauthAccessToken),
          encryptSecret(oauthRefreshToken),
          oauthTokenExpiresAt,
          oauthScope,
          isActive,
          isPrimary && isActive,
          session.user.id
        ]
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true, credentialId: result.rows[0].id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[API] Error creating sender email credential:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to create sender credential" }, { status: 500 });
  }
}
