// Gmail OAuth Client
// Fetches emails from Gmail using OAuth2 authentication

import { getPool } from "@/lib/db/pool";
import type { EmailMessage } from "./imap";

export type GmailConfig = {
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
 * Fetch Gmail credentials from database
 */
export async function getGmailCredentials(credentialId: string): Promise<GmailConfig | null> {
  const pool = await getPool();
  
  const result = await pool.query(
    `SELECT email_address, oauth_access_token, oauth_refresh_token, oauth_token_expires_at
     FROM email_credentials
     WHERE id = $1 AND provider = 'gmail' AND is_active = true`,
    [credentialId]
  );
  
  if (result.rowCount === 0) {
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
 * Refresh Gmail OAuth access token if expired
 */
async function refreshAccessTokenIfNeeded(
  credentialId: string,
  config: GmailConfig
): Promise<GmailConfig> {
  const now = new Date();
  
  if (config.tokenExpiresAt > now) {
    return config; // Token still valid
  }
  
  console.log("Gmail access token expired, refreshing...");
  
  // TODO: Implement OAuth token refresh
  /*
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      client_secret: process.env.GMAIL_CLIENT_SECRET,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
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
 * Fetch emails from Gmail using Gmail API
 */
export async function fetchGmailEmails(
  credentialId: string,
  config: GmailConfig,
  query: string = "is:unread"
): Promise<EmailMessage[]> {
  // Refresh token if needed
  config = await refreshAccessTokenIfNeeded(credentialId, config);
  
  console.log(`Fetching Gmail emails for ${config.email} with query: ${query}`);
  
  // TODO: Implement Gmail API calls
  /*
  // 1. List messages
  const listResponse = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}`,
    {
      headers: {
        'Authorization': `Bearer ${config.accessToken}`
      }
    }
  );
  
  const listData = await listResponse.json();
  
  if (!listData.messages || listData.messages.length === 0) {
    return [];
  }
  
  // 2. Fetch full message details for each
  const messages: EmailMessage[] = [];
  
  for (const msg of listData.messages) {
    const msgResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
      {
        headers: {
          'Authorization': `Bearer ${config.accessToken}`
        }
      }
    );
    
    const msgData = await msgResponse.json();
    
    // Parse message data
    const headers = msgData.payload.headers;
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
    
    const message: EmailMessage = {
      messageId: msgData.id,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      bodyText: extractTextBody(msgData.payload),
      bodyHtml: extractHtmlBody(msgData.payload),
      receivedAt: new Date(parseInt(msgData.internalDate)),
      attachments: extractAttachments(msgData.payload)
    };
    
    messages.push(message);
  }
  
  return messages;
  */
  
  console.warn("Gmail API implementation pending. Set up OAuth2 client and implement above.");
  return [];
}

/**
 * Mark Gmail email as read
 */
export async function markGmailEmailAsRead(
  config: GmailConfig,
  messageId: string
): Promise<void> {
  console.log(`Marking Gmail message ${messageId} as read`);
  
  // TODO: Implement Gmail API call
  /*
  await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        removeLabelIds: ['UNREAD']
      })
    }
  );
  */
}

/**
 * Build Gmail query string from trigger config
 */
export function buildGmailQuery(config: {
  unreadOnly?: boolean;
  senderFilter?: string;
  subjectContains?: string;
  bodyContains?: string;
  hasAttachment?: boolean;
}): string {
  const parts: string[] = [];
  
  if (config.unreadOnly) {
    parts.push("is:unread");
  }
  
  if (config.senderFilter) {
    parts.push(`from:${config.senderFilter}`);
  }
  
  if (config.subjectContains) {
    parts.push(`subject:${config.subjectContains}`);
  }
  
  if (config.bodyContains) {
    parts.push(config.bodyContains);
  }
  
  if (config.hasAttachment) {
    parts.push("has:attachment");
  }
  
  return parts.join(" ");
}

/**
 * Test Gmail connection
 */
export async function testGmailConnection(
  credentialId: string,
  config: GmailConfig
): Promise<{ success: boolean; error?: string }> {
  try {
    config = await refreshAccessTokenIfNeeded(credentialId, config);
    
    // TODO: Test with a simple API call
    // const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', ...)
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
