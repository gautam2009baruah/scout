import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

function encryptSecret(secret: string | null | undefined) {
  if (!secret) return null;
  return `encrypted:${secret}`;
}

async function getCredentialById(id: string, companyId: string) {
  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string | null;
    provider: "smtp" | "gmail" | "outlook";
    is_active: boolean;
  }>(
    `
      SELECT id, company_id, target_app_id, provider, is_active
      FROM email_sender_credentials
      WHERE id = $1 AND company_id = $2
    `,
    [id, companyId]
  );

  return result.rows[0] ?? null;
}

async function validateTargetAppScope(companyId: string, targetAppId: string | null) {
  if (!targetAppId) return;

  const scopeCheck = await getPool().query<{ id: string }>(
    "SELECT id FROM guided_workflow_target_apps WHERE id = $1 AND company_id = $2 AND deleted_at IS NULL",
    [targetAppId, companyId]
  );

  if ((scopeCheck.rowCount ?? 0) === 0) {
    throw new Error("Invalid target app scope for selected company.");
  }
}

export async function GET(
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

    const result = await getPool().query(
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
          esc.oauth_token_expires_at,
          esc.oauth_scope,
          esc.is_active,
          esc.is_primary,
          esc.updated_at,
          esc.created_at
        FROM email_sender_credentials esc
        LEFT JOIN guided_workflow_target_apps ta ON ta.id = esc.target_app_id
        WHERE esc.id = $1
          AND esc.company_id = $2
      `,
      [id, companyId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, credential: result.rows[0] });
  } catch (error) {
    console.error("[API] Error fetching sender email credential:", error);
    return NextResponse.json({ success: false, error: "Unable to fetch sender credential" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const companyId = session.user.tenantId;
    const existing = await getCredentialById(id, companyId);

    if (!existing) {
      return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
    }

    const body = await request.json();
    const scopeTargetAppId = body.targetAppId !== undefined ? (body.targetAppId ? String(body.targetAppId) : null) : existing.target_app_id;
    await validateTargetAppScope(companyId, scopeTargetAppId);

    const updates: string[] = [];
    const values: unknown[] = [];
    let index = 1;

    const addUpdate = (column: string, value: unknown) => {
      updates.push(`${column} = $${index}`);
      values.push(value);
      index += 1;
    };

    if (body.provider !== undefined) addUpdate("provider", String(body.provider));
    if (body.targetAppId !== undefined) addUpdate("target_app_id", scopeTargetAppId);
    if (body.name !== undefined) addUpdate("name", String(body.name).trim());
    if (body.description !== undefined) addUpdate("description", body.description ? String(body.description).trim() : null);
    if (body.fromName !== undefined) addUpdate("from_name", body.fromName ? String(body.fromName).trim() : null);
    if (body.fromEmail !== undefined) addUpdate("from_email", String(body.fromEmail).trim());
    if (body.replyToEmail !== undefined) addUpdate("reply_to_email", body.replyToEmail ? String(body.replyToEmail).trim() : null);
    if (body.smtpHost !== undefined) addUpdate("smtp_host", body.smtpHost ? String(body.smtpHost).trim() : null);
    if (body.smtpPort !== undefined) addUpdate("smtp_port", Number(body.smtpPort));
    if (body.smtpSecure !== undefined) addUpdate("smtp_secure", Boolean(body.smtpSecure));
    if (body.smtpUsername !== undefined) addUpdate("smtp_username", body.smtpUsername ? String(body.smtpUsername).trim() : null);
    if (body.smtpPassword !== undefined && String(body.smtpPassword).length > 0) addUpdate("smtp_password", encryptSecret(String(body.smtpPassword)));
    if (body.oauthAccessToken !== undefined && String(body.oauthAccessToken).length > 0) addUpdate("oauth_access_token", encryptSecret(String(body.oauthAccessToken)));
    if (body.oauthRefreshToken !== undefined && String(body.oauthRefreshToken).length > 0) addUpdate("oauth_refresh_token", encryptSecret(String(body.oauthRefreshToken)));
    if (body.oauthTokenExpiresAt !== undefined) addUpdate("oauth_token_expires_at", body.oauthTokenExpiresAt ? new Date(String(body.oauthTokenExpiresAt)) : null);
    if (body.oauthScope !== undefined) addUpdate("oauth_scope", body.oauthScope ? String(body.oauthScope) : null);
    if (body.isActive !== undefined) addUpdate("is_active", Boolean(body.isActive));
    if (body.isPrimary !== undefined) addUpdate("is_primary", Boolean(body.isPrimary));

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" }, { status: 400 });
    }

    const isPrimary = body.isPrimary === true;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : existing.is_active;

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
              AND id <> $4
          `,
          [companyId, scopeTargetAppId, session.user.id, id]
        );
      }

      updates.push(`updated_by = $${index}`);
      values.push(session.user.id);
      index += 1;

      values.push(id);

      await client.query(
        `
          UPDATE email_sender_credentials
          SET ${updates.join(", ")}, updated_at = now()
          WHERE id = $${index}
        `,
        values
      );

      await client.query("COMMIT");
      return NextResponse.json({ success: true });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[API] Error updating sender email credential:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to update sender credential" }, { status: 500 });
  }
}

export async function DELETE(
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

    const result = await getPool().query(
      "DELETE FROM email_sender_credentials WHERE id = $1 AND company_id = $2",
      [id, companyId]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json({ success: false, error: "Credential not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API] Error deleting sender email credential:", error);
    return NextResponse.json({ success: false, error: "Unable to delete sender credential" }, { status: 500 });
  }
}
