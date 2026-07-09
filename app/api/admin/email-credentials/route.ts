// Email Credentials Management API
// POST /api/admin/email-credentials - Create email credential
// GET /api/admin/email-credentials - List all credentials
// DELETE /api/admin/email-credentials/[id] - Delete credential
// POST /api/admin/email-credentials/[id]/test - Test connection

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";

export const runtime = "nodejs";

/**
 * Encrypt token/password
 * TODO: Implement proper AES-256-GCM encryption
 */
function encryptSecret(secret: string): string {
  // Placeholder encryption
  return `encrypted:${secret}`;
}

/**
 * GET - List all email credentials
 */
export async function GET() {
  const session = await getCurrentAdminSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const pool = await getPool();
    
    const result = await pool.query(
      `SELECT 
        id, name, description, provider, email_address, is_active,
        last_used_at, last_error, created_at, created_by_email
       FROM email_credentials
       ORDER BY created_at DESC`
    );
    
    return NextResponse.json({
      credentials: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        provider: row.provider,
        emailAddress: row.email_address,
        isActive: row.is_active,
        lastUsedAt: row.last_used_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        createdByEmail: row.created_by_email,
      })),
    });
  } catch (error: any) {
    console.error("Error listing email credentials:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST - Create new email credential
 */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const body = await request.json();
    const { name, description, provider, emailAddress, oauthAccessToken, oauthRefreshToken, tokenExpiresAt, imapHost, imapPort, imapPassword, imapTls } = body;
    
    if (!name || !provider || !emailAddress) {
      return NextResponse.json(
        { error: "Name, provider, and email address are required" },
        { status: 400 }
      );
    }
    
    if (!["gmail", "outlook", "imap"].includes(provider)) {
      return NextResponse.json(
        { error: "Provider must be gmail, outlook, or imap" },
        { status: 400 }
      );
    }
    
    // Validate provider-specific fields
    if (provider === "imap") {
      if (!imapHost || !imapPassword) {
        return NextResponse.json(
          { error: "IMAP host and password are required" },
          { status: 400 }
        );
      }
    } else {
      if (!oauthAccessToken) {
        return NextResponse.json(
          { error: "OAuth access token is required for Gmail/Outlook" },
          { status: 400 }
        );
      }
    }
    
    const pool = await getPool();
    
    // Encrypt sensitive data
    const encryptedAccessToken = oauthAccessToken ? encryptSecret(oauthAccessToken) : null;
    const encryptedRefreshToken = oauthRefreshToken ? encryptSecret(oauthRefreshToken) : null;
    const encryptedPassword = imapPassword ? encryptSecret(imapPassword) : null;
    
    const result = await pool.query(
      `INSERT INTO email_credentials
       (name, description, provider, email_address, oauth_access_token, oauth_refresh_token,
        oauth_token_expires_at, imap_host, imap_port, imap_password, imap_tls,
        is_active, created_by_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12)
       RETURNING id, name, provider, email_address, created_at`,
      [
        name,
        description || null,
        provider,
        emailAddress,
        encryptedAccessToken,
        encryptedRefreshToken,
        tokenExpiresAt || null,
        imapHost || null,
        imapPort || null,
        encryptedPassword,
        imapTls !== false,
        session.user.email,
      ]
    );
    
    const credential = result.rows[0];
    
    return NextResponse.json({
      credential: {
        id: credential.id,
        name: credential.name,
        provider: credential.provider,
        emailAddress: credential.email_address,
        createdAt: credential.created_at,
      },
    });
    
  } catch (error: any) {
    console.error("Error creating email credential:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Delete email credential
 */
export async function DELETE(request: Request) {
  const session = await getCurrentAdminSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    
    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }
    
    const pool = await getPool();
    
    const result = await pool.query(
      `DELETE FROM email_credentials WHERE id = $1`,
      [id]
    );
    
    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        { error: "Credential not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error("Error deleting email credential:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
