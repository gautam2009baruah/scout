// Email Credentials API
// Manage IMAP/Gmail/Outlook credentials for email triggers

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { fetchIMAPEmails } from "@/lib/integrations/email/imap";
import { INPUT_LIMITS, exceedsCharacterLimit } from "@/lib/validation/input-limits";

async function validateTargetAppScope(companyId: string, targetAppId: string | null) {
  if (!targetAppId) {
    return false;
  }

  const scopeCheck = await getPool().query<{ id: string }>(
    `SELECT cta.id
     FROM company_target_applications cta
     WHERE cta.id = $1
       AND cta.company_id = $2
       AND cta.deleted_at IS NULL`,
    [targetAppId, companyId]
  );

  return (scopeCheck.rowCount ?? 0) > 0;
}

function normalizeEnvironmentIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

async function validateEnvironmentIds(targetAppId: string, environmentIds: string[]) {
  if (environmentIds.length === 0) {
    return false;
  }

  const result = await getPool().query<{ id: string }>(
    `SELECT id
     FROM target_app_environments
     WHERE id = ANY($1::uuid[])
       AND target_app_id = $2`,
    [environmentIds, targetAppId]
  );

  return (result.rowCount ?? 0) === environmentIds.length;
}

/**
 * GET /api/orchestrations/email-credentials?companyId=xxx
 * List all email credentials for specified company (or all if admin)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const pool = getPool();

    // Fetch credentials with their assigned target app — always scoped to
    // the caller's own company, never a client-supplied companyId.
    const result = await pool.query(
      `SELECT
        ec.id,
        ec.company_id,
        ec.target_app_id,
        cta.name AS target_app_name,
        ec.provider,
        ec.name,
        ec.email_address,
        ec.is_active,
        ec.last_tested_at,
        ec.last_test_status,
        ec.last_test_error,
        ec.created_at,
        COALESCE((
          SELECT json_agg(json_build_object('id', e.id, 'name', e.name) ORDER BY e.name)
          FROM email_credential_environments ece
          JOIN target_app_environments e ON e.id = ece.environment_id
          WHERE ece.email_credential_id = ec.id
        ), '[]'::json) AS environments
       FROM email_credentials ec
       LEFT JOIN company_target_applications cta ON cta.id = ec.target_app_id
       WHERE ec.company_id = $1
       ORDER BY ec.created_at DESC`,
      [session.user.tenantId]
    );

    return NextResponse.json({
      success: true,
      credentials: result.rows,
    });
  } catch (error: any) {
    console.error("[API] Error fetching email credentials:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve email credentials" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/orchestrations/email-credentials
 * Add new email credential
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      provider,
      name,
      emailAddress,
      imapHost,
      imapPort,
      imapPassword,
      imapTls,
      targetAppId,
    } = body;
    const companyId = session.user.tenantId;

    if (!companyId || !provider || !name || !emailAddress) {
      return NextResponse.json(
        { success: false, error: "Company, provider, name, and email address are required" },
        { status: 400 }
      );
    }
    if (exceedsCharacterLimit(String(name), INPUT_LIMITS.resourceName)) {
      return NextResponse.json({ success: false, error: `Name must be ${INPUT_LIMITS.resourceName} characters or fewer.` }, { status: 400 });
    }
    if (exceedsCharacterLimit(String(emailAddress), INPUT_LIMITS.emailAddress)) {
      return NextResponse.json({ success: false, error: `Email address must be ${INPUT_LIMITS.emailAddress} characters or fewer.` }, { status: 400 });
    }
    if (imapHost && exceedsCharacterLimit(String(imapHost), 255)) {
      return NextResponse.json({ success: false, error: "IMAP host must be 255 characters or fewer." }, { status: 400 });
    }

    if (provider === "imap" && (!imapHost || !imapPassword)) {
      return NextResponse.json(
        { success: false, error: "IMAP host and password are required" },
        { status: 400 }
      );
    }

    if (!targetAppId || !(await validateTargetAppScope(companyId, String(targetAppId)))) {
      return NextResponse.json(
        { success: false, error: "A valid target application is required" },
        { status: 400 }
      );
    }

    const environmentIds = normalizeEnvironmentIds(body.environmentIds);
    if (environmentIds.length > 100) {
      return NextResponse.json({ success: false, error: "At most 100 environments may be assigned." }, { status: 400 });
    }
    if (!(await validateEnvironmentIds(String(targetAppId), environmentIds))) {
      return NextResponse.json(
        { success: false, error: "At least one valid environment is required." },
        { status: 400 }
      );
    }

    const createdBy = session.user.id;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // TODO: Encrypt password before storing
      const encryptedPassword = provider === "imap" ? `encrypted:${imapPassword}` : null;

      // Insert credential
      const result = await client.query(
        `INSERT INTO email_credentials
         (company_id, target_app_id, provider, name, email_address, imap_host, imap_port, imap_password, imap_tls, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
         RETURNING id, target_app_id, provider, name, email_address, is_active`,
        [
          companyId,
          targetAppId,
          provider,
          name,
          emailAddress,
          provider === "imap" ? imapHost : null,
          provider === "imap" ? (imapPort || 993) : null,
          encryptedPassword,
          provider === "imap" ? (imapTls !== false) : null,
          createdBy,
        ]
      );

      await client.query(
        `INSERT INTO email_credential_environments (email_credential_id, environment_id)
         SELECT $1, unnest($2::uuid[])`,
        [result.rows[0].id, environmentIds]
      );

      await client.query('COMMIT');

      return NextResponse.json({
        success: true,
        credential: result.rows[0],
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[API] Error creating email credential:", error);
    return NextResponse.json(
      { success: false, error: "Unable to save email credential" },
      { status: 500 }
    );
  }
}
