// Outlook/Office 365 OAuth Client
// Fetches emails from Outlook using OAuth2 authentication

import { getPool } from "@/lib/db/pool";
import type { EmailMessage } from "./imap";

export type OutlookConfig = {
  email: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: Date;
};

/**
 * Decrypt OAuth token from database
 */
function decryptToken(encryptedToken: string): string {
  // TODO: Implement proper AES-256-GCM decryption
  if (encryptedToken.startsWith("encrypted:")) {
    return encryptedToken.substring(10);
  }
  return encryptedToken;
}

/**
 * Fetch Outlook credentials from database
 */
export async function getOutlookCredentials(credentialId: string): Promise<OutlookConfig | null> {
  const pool = await getPool();
  
  const result = await pool.query(
    `SELECT email_address, oauth_access_token, oauth_refresh_token, oauth_token_expires_at
     FROM email_credentials
     WHERE id = $1 AND provider = 'outlook' AND is_active = true`,
    [credentialId]
  );
  
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  
  const row = result.rows[0];
  
  return {
    email: row.email_address,
    accessToken: decryptToken(row.oauth_access_token),
    refreshToken: decryptToken(row.oauth_refresh_token),
    tokenExpiresAt: new Date(row.oauth_token_expires_at),
  };
}

/**
 * Refresh Outlook OAuth access token if expired
 */
async function refreshAccessTokenIfNeeded(
  credentialId: string,
  config: OutlookConfig
): Promise<OutlookConfig> {
  const now = new Date();
  
  if (config.tokenExpiresAt > now) {
    return config; // Token still valid
  }
  
  console.log("Outlook access token expired, refreshing...");
  
  // TODO: Implement OAuth token refresh
  /*
  const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID,
      client_secret: process.env.OUTLOOK_CLIENT_SECRET,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Read'
    })
  });
  
  const data = await response.json();
  const newAccessToken = data.access_token;
  const expiresIn = data.expires_in; // seconds
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);
  
  // Update database
  const pool = await getPool();
  await pool.query(
    `UPDATE email_credentials
     SET oauth_access_token = $2, oauth_token_expires_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [credentialId, encryptToken(newAccessToken), newExpiresAt]
  );
  
  return {
    ...config,
    accessToken: newAccessToken,
    tokenExpiresAt: newExpiresAt
  };
  */
  
  console.warn("OAuth refresh not implemented. Update email credentials manually.");
  return config;
}

/**
 * Fetch emails from Outlook using Microsoft Graph API
 */
export async function fetchOutlookEmails(
  credentialId: string,
  config: OutlookConfig,
  folder: string = "inbox",
  filter?: string
): Promise<EmailMessage[]> {
  // Refresh token if needed
  config = await refreshAccessTokenIfNeeded(credentialId, config);
  
  console.log(`Fetching Outlook emails for ${config.email} from folder: ${folder}`);
  
  // TODO: Implement Microsoft Graph API calls
  /*
  // Build filter query
  let url = `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages?$top=50`;
  if (filter) {
    url += `&$filter=${encodeURIComponent(filter)}`;
  }
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (!data.value || data.value.length === 0) {
    return [];
  }
  
  const messages: EmailMessage[] = data.value.map((msg: any) => ({
    messageId: msg.id,
    from: msg.from?.emailAddress?.address || '',
    to: msg.toRecipients?.map((r: any) => r.emailAddress?.address).join(', ') || '',
    subject: msg.subject || '',
    bodyText: msg.body?.contentType === 'text' ? msg.body.content : '',
    bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : '',
    receivedAt: new Date(msg.receivedDateTime),
    attachments: (msg.hasAttachments && msg.attachments) ? msg.attachments.map((att: any) => ({
      filename: att.name,
      contentType: att.contentType,
      size: att.size,
      data: Buffer.from(att.contentBytes, 'base64')
    })) : []
  }));
  
  return messages;
  */
  
  console.warn("Microsoft Graph API implementation pending. Set up OAuth2 app and implement above.");
  return [];
}

/**
 * Mark Outlook email as read
 */
export async function markOutlookEmailAsRead(
  config: OutlookConfig,
  messageId: string
): Promise<void> {
  console.log(`Marking Outlook message ${messageId} as read`);
  
  // TODO: Implement Microsoft Graph API call
  /*
  await fetch(
    `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        isRead: true
      })
    }
  );
  */
}

/**
 * Build Outlook filter string from trigger config
 */
export function buildOutlookFilter(config: {
  unreadOnly?: boolean;
  senderFilter?: string;
  subjectContains?: string;
  hasAttachment?: boolean;
  receivedAfter?: Date;
}): string {
  const filters: string[] = [];
  
  if (config.unreadOnly) {
    filters.push("isRead eq false");
  }
  
  if (config.senderFilter) {
    filters.push(`from/emailAddress/address eq '${config.senderFilter}'`);
  }
  
  if (config.subjectContains) {
    filters.push(`contains(subject, '${config.subjectContains}')`);
  }
  
  if (config.hasAttachment) {
    filters.push("hasAttachments eq true");
  }
  
  if (config.receivedAfter) {
    // Microsoft Graph supports full ISO 8601 timestamp comparison.
    filters.push(`receivedDateTime ge ${config.receivedAfter.toISOString()}`);
  }
  
  return filters.join(" and ");
}

/**
 * Test Outlook connection
 */
export async function testOutlookConnection(
  credentialId: string,
  config: OutlookConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    config = await refreshAccessTokenIfNeeded(credentialId, config);
    
    // TODO: Test with a simple API call
    // const response = await fetch('https://graph.microsoft.com/v1.0/me', ...)
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
