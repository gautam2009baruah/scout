// Test Email Credential Connection
// POST /api/admin/email-credentials/[credentialId]/test

import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getIMAPCredentials, testIMAPConnection } from "@/lib/integrations/email/imap";
import { getGmailCredentials, testGmailConnection } from "@/lib/integrations/email/gmail";
import { getOutlookCredentials, testOutlookConnection } from "@/lib/integrations/email/outlook";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ credentialId: string }> }
) {
  const session = await getCurrentAdminSession();
  
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  try {
    const { credentialId } = await params;
    
    // Try each provider type
    const gmailCreds = await getGmailCredentials(credentialId);
    if (gmailCreds) {
      const result = await testGmailConnection(credentialId, gmailCreds);
      return NextResponse.json({
        provider: "gmail",
        email: gmailCreds.email,
        success: result.success,
        error: result.error,
      });
    }
    
    const outlookCreds = await getOutlookCredentials(credentialId);
    if (outlookCreds) {
      const result = await testOutlookConnection(credentialId, outlookCreds);
      return NextResponse.json({
        provider: "outlook",
        email: outlookCreds.email,
        success: result.success,
        error: result.error,
      });
    }
    
    const imapCreds = await getIMAPCredentials(credentialId);
    if (imapCreds) {
      const result = await testIMAPConnection(imapCreds);
      return NextResponse.json({
        provider: "imap",
        host: imapCreds.host,
        success: result.success,
        error: result.error,
      });
    }
    
    return NextResponse.json(
      { error: "Credential not found or inactive" },
      { status: 404 }
    );
    
  } catch (error: any) {
    console.error("Error testing email credential:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
