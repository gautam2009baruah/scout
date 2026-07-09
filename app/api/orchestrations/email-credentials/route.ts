// Email Credentials API
// Manage IMAP/Gmail/Outlook credentials for email triggers

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { fetchIMAPEmails } from "@/lib/integrations/email/imap";

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

    const { searchParams } = request.nextUrl;
    const companyId = searchParams.get("companyId");

    const pool = getPool();
    
    // Fetch credentials with their assigned target apps
    const result = await pool.query(
      `SELECT 
        ec.id,
        ec.company_id,
        ec.provider,
        ec.name,
        ec.email_address,
        ec.is_active,
        ec.last_tested_at,
        ec.last_test_status,
        ec.last_test_error,
        ec.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ta.id,
              'name', ta.name
            )
            ORDER BY ta.name
          ) FILTER (WHERE ta.id IS NOT NULL),
          '[]'
        ) as target_apps
       FROM email_credentials ec
       LEFT JOIN email_credential_target_apps ecta ON ec.id = ecta.email_credential_id
       LEFT JOIN guided_workflow_target_apps ta ON ecta.target_app_id = ta.id
       WHERE ($1::uuid IS NULL OR ec.company_id = $1::uuid)
       GROUP BY ec.id
       ORDER BY ec.created_at DESC`,
      [companyId]
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
      companyId,
      provider,
      name,
      emailAddress,
      imapHost,
      imapPort,
      imapPassword,
      imapTls,
      targetAppIds,
    } = body;

    if (!companyId || !provider || !name || !emailAddress) {
      return NextResponse.json(
        { success: false, error: "Company, provider, name, and email address are required" },
        { status: 400 }
      );
    }

    if (provider === "imap" && (!imapHost || !imapPassword)) {
      return NextResponse.json(
        { success: false, error: "IMAP host and password are required" },
        { status: 400 }
      );
    }

    const createdBy = session.user.email;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // TODO: Encrypt password before storing
      const encryptedPassword = provider === "imap" ? `encrypted:${imapPassword}` : null;

      // Insert credential
      const result = await client.query(
        `INSERT INTO email_credentials
         (company_id, provider, name, email_address, imap_host, imap_port, imap_password, imap_tls, created_by_email, updated_by_email)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
         RETURNING id, provider, name, email_address, is_active`,
        [
          companyId,
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

      const credentialId = result.rows[0].id;

      // Insert target app assignments if provided
      if (targetAppIds && Array.isArray(targetAppIds) && targetAppIds.length > 0) {
        const appAssignments = targetAppIds.map((appId: string) => 
          client.query(
            `INSERT INTO email_credential_target_apps (email_credential_id, target_app_id, created_by_email)
             VALUES ($1, $2, $3)
             ON CONFLICT (email_credential_id, target_app_id) DO NOTHING`,
            [credentialId, appId, createdBy]
          )
        );
        await Promise.all(appAssignments);
      }

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
