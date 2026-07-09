// Test Email Credentials API
// Test IMAP connection before saving

import { NextRequest, NextResponse } from "next/server";
import { fetchIMAPEmails, type IMAPConfig } from "@/lib/integrations/email/imap";
import { getPool } from "@/lib/db/pool";

/**
 * POST /api/orchestrations/email-credentials/test
 * Test email credentials (IMAP connection)
 */
export async function POST(request: NextRequest) {
  let credentialIdForError: string | null = null;
  try {
    const body = await request.json();
    const { credentialId, provider, imapHost, imapPort, imapUsername, imapPassword, imapTls } = body;
    credentialIdForError = credentialId || null;

    // Test existing credential by ID
    if (credentialId) {
      const pool = getPool();
      
      const result = await pool.query(
        `SELECT 
          provider,
          imap_host,
          imap_port,
          imap_username,
          imap_password,
          imap_tls
         FROM email_credentials
         WHERE id = $1 AND is_active = true`,
        [credentialId]
      );

      if (result.rowCount === 0) {
        return NextResponse.json(
          { success: false, error: "Credential not found" },
          { status: 404 }
        );
      }

      const cred = result.rows[0];
      
      if (cred.provider === "imap") {
        const config: IMAPConfig = {
          host: cred.imap_host,
          port: cred.imap_port,
          username: cred.imap_username,
          password: cred.imap_password.replace("encrypted:", ""),
          tls: cred.imap_tls,
        };

        const emails = await fetchIMAPEmails(config, "INBOX", false);
        
        // Update last test status
        await pool.query(
          `UPDATE email_credentials
           SET last_tested_at = NOW(),
               last_test_status = 'success',
               last_test_error = NULL
           WHERE id = $1`,
          [credentialId]
        );

        return NextResponse.json({
          success: true,
          message: "Connection successful",
          emailsFound: emails.length,
        });
      }

      return NextResponse.json(
        { success: false, error: `Provider ${cred.provider} not yet supported for testing` },
        { status: 400 }
      );
    }

    // Test new credentials (not yet saved)
    if (provider === "imap") {
      if (!imapHost || !imapUsername || !imapPassword) {
        return NextResponse.json(
          { success: false, error: "Missing IMAP credentials" },
          { status: 400 }
        );
      }

      const config: IMAPConfig = {
        host: imapHost,
        port: imapPort || 993,
        username: imapUsername,
        password: imapPassword,
        tls: imapTls !== false,
      };

      const emails = await fetchIMAPEmails(config, "INBOX", false);

      return NextResponse.json({
        success: true,
        message: "Connection successful",
        emailsFound: emails.length,
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported provider or missing credentials" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[API] Error testing email credentials:", error);
    
    // Update failed test status if testing existing credential
    if (credentialIdForError) {
      try {
        const pool = getPool();
        await pool.query(
          `UPDATE email_credentials
           SET last_tested_at = NOW(),
               last_test_status = 'failed',
               last_test_error = $1
           WHERE id = $2`,
          [error.message, credentialIdForError]
        );
      } catch (updateError) {
        console.error("[API] Error updating test status:", updateError);
      }
    }

    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
