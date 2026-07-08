// IMAP Email Client
// Connects to generic IMAP servers and fetches emails

import { getPool } from "@/lib/db/pool";
import { createDecipheriv } from "crypto";
import Imap from "imap";
import { simpleParser, ParsedMail, Attachment } from "mailparser";

export type IMAPConfig = {
  host: string;
  port: number;
  username: string;
  password: string; // Encrypted
  tls: boolean;
};

export type EmailMessage = {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
  attachments: Array<{
    filename: string;
    contentType: string;
    size: number;
    data: Buffer;
  }>;
};

/**
 * Decrypt password from database
 */
function decryptPassword(encryptedPassword: string): string {
  // TODO: Implement proper AES-256-GCM decryption
  // For now, return as-is (assuming encryption is implemented elsewhere)
  if (encryptedPassword.startsWith("encrypted:")) {
    return encryptedPassword.substring(10);
  }
  return encryptedPassword;
}

/**
 * Fetch credentials from database
 */
export async function getIMAPCredentials(credentialId: string): Promise<IMAPConfig | null> {
  const pool = await getPool();
  
  const result = await pool.query(
    `SELECT imap_host, imap_port, imap_username, imap_password, imap_tls
     FROM email_credentials
     WHERE id = $1 AND provider = 'imap' AND is_active = true`,
    [credentialId]
  );
  
  if ((result.rowCount ?? 0) === 0) {
    return null;
  }
  
  const row = result.rows[0];
  
  return {
    host: row.imap_host,
    port: row.imap_port,
    username: row.imap_username,
    password: decryptPassword(row.imap_password),
    tls: row.imap_tls,
  };
}

/**
 * Connect to IMAP server and fetch unread emails
 */
export async function fetchIMAPEmails(
  config: IMAPConfig,
  folder: string = "INBOX",
  unreadOnly: boolean = true
): Promise<EmailMessage[]> {
  console.log(`[IMAP] Connecting to ${config.host}:${config.port}`);
  console.log(`[IMAP] Folder: ${folder}, Unread only: ${unreadOnly}`);
  
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.username,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    let messages: EmailMessage[] = [];

    imap.once("ready", () => {
      console.log("[IMAP] Connected, opening mailbox...");
      
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          console.error("[IMAP] Error opening mailbox:", err);
          imap.end();
          return reject(err);
        }

        console.log(`[IMAP] Mailbox opened: ${box.messages.total} total messages`);

        // Search criteria: unread or all
        const searchCriteria = unreadOnly ? ["UNSEEN"] : ["ALL"];
        
        imap.search(searchCriteria, (err, results) => {
          if (err) {
            console.error("[IMAP] Search error:", err);
            imap.end();
            return reject(err);
          }

          if (!results || results.length === 0) {
            console.log("[IMAP] No messages found");
            imap.end();
            return resolve([]);
          }

          console.log(`[IMAP] Found ${results.length} message(s)`);

          // Fetch message details
          const fetch = imap.fetch(results, {
            bodies: "",
            struct: true,
          });

          let processed = 0;

          fetch.on("message", (msg, seqno) => {
            console.log(`[IMAP] Processing message #${seqno}`);
            
            let buffer = "";

            msg.on("body", (stream, info) => {
              stream.on("data", (chunk) => {
                buffer += chunk.toString("utf8");
              });

              stream.once("end", async () => {
                try {
                  // Parse email with mailparser
                  const parsed = await simpleParser(buffer);
                  
                  // Extract message data
                  const emailMessage: EmailMessage = {
                    messageId: parsed.messageId || `${seqno}-${Date.now()}`,
                    from: extractEmailAddress(parsed.from),
                    to: extractEmailAddress(parsed.to),
                    subject: parsed.subject || "(no subject)",
                    bodyText: parsed.text || "",
                    bodyHtml: parsed.html || "",
                    receivedAt: parsed.date || new Date(),
                    attachments: extractAttachments(parsed),
                  };

                  messages.push(emailMessage);
                  processed++;

                  console.log(`[IMAP] ✅ Parsed message: ${emailMessage.subject}`);

                  // If all messages processed, close connection
                  if (processed === results.length) {
                    imap.end();
                  }
                } catch (parseError) {
                  console.error("[IMAP] Error parsing message:", parseError);
                  processed++;
                  
                  if (processed === results.length) {
                    imap.end();
                  }
                }
              });
            });

            msg.once("attributes", (attrs) => {
              // Could use attrs for additional metadata if needed
            });

            msg.once("end", () => {
              // Message fetched completely
            });
          });

          fetch.once("error", (err) => {
            console.error("[IMAP] Fetch error:", err);
            imap.end();
            reject(err);
          });

          fetch.once("end", () => {
            console.log("[IMAP] Fetch completed");
            // Connection will be closed after all messages are parsed
          });
        });
      });
    });

    imap.once("error", (err) => {
      console.error("[IMAP] Connection error:", err);
      reject(err);
    });

    imap.once("end", () => {
      console.log(`[IMAP] Connection closed. Returning ${messages.length} message(s)`);
      resolve(messages);
    });

    imap.connect();
  });
}

/**
 * Extract email address from parsed address object
 */
function extractEmailAddress(addressObj: any): string {
  if (!addressObj) return "";
  
  if (typeof addressObj === "string") return addressObj;
  
  if (Array.isArray(addressObj.value) && addressObj.value.length > 0) {
    return addressObj.value[0].address || "";
  }
  
  if (addressObj.value && typeof addressObj.value === "object") {
    return addressObj.value.address || "";
  }
  
  return "";
}

/**
 * Extract attachments from parsed email
 */
function extractAttachments(parsed: ParsedMail): EmailMessage["attachments"] {
  if (!parsed.attachments || parsed.attachments.length === 0) {
    return [];
  }

  return parsed.attachments.map((att: Attachment) => ({
    filename: att.filename || "unnamed",
    contentType: att.contentType || "application/octet-stream",
    size: att.size || 0,
    data: att.content,
  }));
}

/**
 * Mark emails as read (add SEEN flag)
 */
export async function markEmailsAsRead(
  config: IMAPConfig,
  messageIds: string[],
  folder: string = "INBOX"
): Promise<{ success: boolean; markedCount: number; error?: string }> {
  if (messageIds.length === 0) {
    return { success: true, markedCount: 0 };
  }

  console.log(`[IMAP] Marking ${messageIds.length} email(s) as read`);

  return new Promise((resolve) => {
    const imap = new Imap({
      user: config.username,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    imap.once("ready", () => {
      imap.openBox(folder, false, (err, box) => {
        if (err) {
          console.error("[IMAP] Error opening mailbox:", err);
          imap.end();
          return resolve({ success: false, markedCount: 0, error: err.message });
        }

        // Search for messages by messageId
        // Note: IMAP HEADER search can be slow, but it's the most reliable way
        const searchPromises = messageIds.map((messageId) => {
          return new Promise<number[]>((resolveSearch) => {
            imap.search([["HEADER", "MESSAGE-ID", messageId]], (err, results) => {
              if (err) {
                console.error(`[IMAP] Error searching for messageId ${messageId}:`, err);
                return resolveSearch([]);
              }
              resolveSearch(results || []);
            });
          });
        });

        Promise.all(searchPromises).then((allResults) => {
          // Flatten array and get unique UIDs
          const uids = [...new Set(allResults.flat())];

          if (uids.length === 0) {
            console.log("[IMAP] No messages found to mark as read");
            imap.end();
            return resolve({ success: true, markedCount: 0 });
          }

          console.log(`[IMAP] Found ${uids.length} message(s) to mark as read`);

          // Add SEEN flag
          imap.addFlags(uids, ["\\Seen"], (err) => {
            if (err) {
              console.error("[IMAP] Error marking messages as read:", err);
              imap.end();
              return resolve({ success: false, markedCount: 0, error: err.message });
            }

            console.log(`[IMAP] ✅ Marked ${uids.length} message(s) as read`);
            imap.end();
            resolve({ success: true, markedCount: uids.length });
          });
        });
      });
    });

    imap.once("error", (err) => {
      console.error("[IMAP] Connection error:", err);
      resolve({ success: false, markedCount: 0, error: err.message });
    });

    imap.once("end", () => {
      console.log("[IMAP] Connection closed");
    });

    imap.connect();
  });
}

/**
 * Mark email as read on IMAP server
 */
export async function markIMAPEmailAsRead(
  config: IMAPConfig,
  messageId: string,
  folder: string = "INBOX"
): Promise<void> {
  console.log(`Marking email ${messageId} as read in ${folder}`);
  
  // TODO: Implement with node-imap
  // imap.openBox, search by messageId, addFlags('\\Seen')
}

/**
 * Test IMAP connection
 */
export async function testIMAPConnection(config: IMAPConfig): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`Testing IMAP connection to ${config.host}:${config.port}`);
    
    // TODO: Implement actual connection test
    // For now, just validate config
    if (!config.host || !config.username || !config.password) {
      return { success: false, error: "Missing required IMAP configuration" };
    }
    
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
