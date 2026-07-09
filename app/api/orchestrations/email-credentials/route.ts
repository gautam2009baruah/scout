// Email Credentials API
// Manage IMAP/Gmail/Outlook credentials for email triggers

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { fetchIMAPEmails } from "@/lib/integrations/email/imap";

/**
 * GET /api/orchestrations/email-credentials
 * List all email credentials for current company
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

    const companyId = session.user.tenantId;

    const pool = getPool();
    
    const result = await pool.query(
      `SELECT 
        id,
        provider,
        name,
        email_address,
        is_active,
        last_tested_at,
        last_test_status,
        last_test_error,
        created_at
       FROM email_credentials
       WHERE company_id = $1
       ORDER BY created_at DESC`,
      [companyId]
    );

    return NextResponse.json({
      success: true,
      credentials: result.rows,
    });
  } catch (error: any) {
    console.error("[API] Error fetching email credentials:", error);
    return NextResponse.json(
      { success: false, error: error.message },
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
      imapUsername,
      imapPassword,
      imapTls,
    } = body;

    if (!provider || !name || !emailAddress) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (provider === "imap" && (!imapHost || !imapUsername || !imapPassword)) {
      return NextResponse.json(
        { success: false, error: "IMAP credentials require host, username, and password" },
        { status: 400 }
      );
    }

    const companyId = session.user.tenantId;
    const createdBy = session.user.email;

    const pool = getPool();

    // TODO: Encrypt password before storing
    const encryptedPassword = provider === "imap" ? `encrypted:${imapPassword}` : null;

    const result = await pool.query(
      `INSERT INTO email_credentials
       (company_id, provider, name, email_address, imap_host, imap_port, imap_username, imap_password, imap_tls, created_by_email, updated_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
       RETURNING id, provider, name, email_address, is_active`,
      [
        companyId,
        provider,
        name,
        emailAddress,
        provider === "imap" ? imapHost : null,
        provider === "imap" ? (imapPort || 993) : null,
        provider === "imap" ? imapUsername : null,
        encryptedPassword,
        provider === "imap" ? (imapTls !== false) : null,
        createdBy,
      ]
    );

    return NextResponse.json({
      success: true,
      credential: result.rows[0],
    });
  } catch (error: any) {
    console.error("[API] Error creating email credential:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
