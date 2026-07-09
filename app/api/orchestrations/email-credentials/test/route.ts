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
          email_address,
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
        // Validate credentials exist
        if (!cred.imap_password) {
          return NextResponse.json(
            { success: false, error: "Password not found for this credential" },
            { status: 400 }
          );
        }

        const config: IMAPConfig = {
          host: cred.imap_host,
          port: cred.imap_port,
          username: cred.email_address,
          password: cred.imap_password.replace("encrypted:", ""),
          tls: cred.imap_tls,
        };

        // For testing, only fetch 1 recent message to verify connection
        const emails = await fetchIMAPEmails(config, "INBOX", false, 1);
        
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

      // For testing, only fetch 1 recent message to verify connection
      const emails = await fetchIMAPEmails(config, "INBOX", false, 1);

      return NextResponse.json({
        success: true,
        message: "Connection successful",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported provider or missing credentials" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("[API] Error testing email credentials:", error);
    
    // Provide user-friendly error messages
    let errorMessage = error.message;
    if (error.message.includes("authentication") || error.message.includes("Lookup failed")) {
      errorMessage = "Authentication failed. For Gmail: Enable IMAP and use an App Password (Settings → Security → 2-Step Verification → App Passwords). For Outlook: Verify IMAP is enabled and password is correct.";
    } else if (error.message.includes("ENOTFOUND") || error.message.includes("getaddrinfo")) {
      errorMessage = "Cannot reach IMAP server. Check host address and internet connection.";
    } else if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
      errorMessage = "Connection timeout. Check port number and firewall settings.";
    }
    
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
          [errorMessage, credentialIdForError]
        );
      } catch (updateError) {
        console.error("[API] Error updating test status:", updateError);
      }
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
