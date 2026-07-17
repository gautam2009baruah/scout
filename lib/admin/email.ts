import { getPool } from "@/lib/db/pool";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  fromName?: string;
  priority?: "low" | "normal" | "high";
  senderCredentialId?: string;
  companyId?: string;
  targetAppId?: string;
  htmlBody?: string;
  attachments?: Array<{
    filename?: string;
    path?: string;
    contentType?: string;
    content?: string;
    encoding?: string;
  }>;
};

function decryptSecret(value: string | null) {
  if (!value) return "";
  return value.startsWith("encrypted:") ? value.slice("encrypted:".length) : value;
}

async function resolveSenderCredential(message: EmailMessage) {
  if (!message.senderCredentialId) {
    return null;
  }

  const result = await getPool().query<{
    id: string;
    company_id: string;
    target_app_id: string | null;
    provider: "smtp" | "gmail" | "outlook";
    from_name: string | null;
    from_email: string;
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_secure: boolean;
    smtp_username: string | null;
    smtp_password: string | null;
    is_active: boolean;
  }>(
    `SELECT
       id,
       company_id,
       target_app_id,
       provider,
       from_name,
       from_email,
       smtp_host,
       smtp_port,
       smtp_secure,
       smtp_username,
       smtp_password,
       is_active
     FROM email_sender_credentials
     WHERE id = $1`,
    [message.senderCredentialId]
  );

  if ((result.rowCount ?? 0) === 0) {
    throw new Error("Selected sender provider not found");
  }

  const credential = result.rows[0];
  if (!credential.is_active) {
    throw new Error("Selected sender provider is inactive");
  }

  if (message.companyId && credential.company_id !== message.companyId) {
    throw new Error("Selected sender provider does not belong to this company");
  }

  if (message.targetAppId && credential.target_app_id && credential.target_app_id !== message.targetAppId) {
    throw new Error("Selected sender provider is not scoped to this target app");
  }

  if (!credential.smtp_host || !credential.smtp_username || !credential.smtp_password) {
    throw new Error("Selected sender provider is missing SMTP configuration");
  }

  return credential;
}

export async function sendEmail(message: EmailMessage) {
  const outboxResult = await getPool().query<{ id: string }>(
    `
      INSERT INTO email_outbox (recipient, subject, body, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING id
    `,
    [message.to, message.subject, message.body]
  );

  const outboxId = outboxResult.rows[0].id;

  if (!process.env.SMTP_HOST && !message.senderCredentialId) {
    const warning = "SMTP not configured. Email was queued but not sent.";
    await getPool().query(
      "UPDATE email_outbox SET status = 'queued', error = $2 WHERE id = $1",
      [outboxId, warning]
    );
    console.warn(`[Email] ${warning} outboxId=${outboxId} to=${message.to} subject=${message.subject}`);
    const queuedError = new Error(warning);
    (queuedError as Error & { outboxId?: string }).outboxId = outboxId;
    throw queuedError;
  }

  try {
    const credential = await resolveSenderCredential(message);

    const transportConfig = credential
      ? {
          host: credential.smtp_host!,
          port: credential.smtp_port || 587,
          secure: credential.smtp_secure === true,
          auth: {
            user: credential.smtp_username!,
            pass: decryptSecret(credential.smtp_password),
          },
        }
      : {
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: process.env.SMTP_SECURE === "true",
          auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
            ? {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
              }
            : undefined,
        };

    const transporter = nodemailer.createTransport(transportConfig);

    const fromAddress = credential?.from_email || process.env.EMAIL_FROM_ADDRESS || "no-reply@localhost";
    const defaultFromName = credential?.from_name || "Scout Admin";
    const fromHeader = message.fromName
      ? `${message.fromName} <${fromAddress}>`
      : `${defaultFromName} <${fromAddress}>`;

    await transporter.sendMail({
      from: fromHeader,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      text: message.body,
      html: message.htmlBody,
      priority: message.priority,
      attachments: message.attachments,
    });

    await getPool().query("UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1", [outboxId]);
    return { outboxId };
  } catch (error) {
    await getPool().query(
      "UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1",
      [outboxId, error instanceof Error ? error.message : "Unknown email error"]
    );
    console.error(`[Email] Send failed outboxId=${outboxId} to=${message.to} subject=${message.subject}`, error);
    throw error;
  }
}
