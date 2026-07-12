import { getPool } from "@/lib/db/pool";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  replyTo?: string;
  fromName?: string;
  priority?: "low" | "normal" | "high";
  htmlBody?: string;
  attachments?: Array<{
    filename?: string;
    path?: string;
    contentType?: string;
    content?: string;
    encoding?: string;
  }>;
};

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

  if (!process.env.SMTP_HOST) {
    console.log(`Email queued for ${message.to}: ${message.subject}`);
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER && process.env.SMTP_PASSWORD
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
          }
        : undefined
    });

    await transporter.sendMail({
      from: message.fromName
        ? `${message.fromName} <${process.env.EMAIL_FROM_ADDRESS || "no-reply@localhost"}>`
        : (process.env.EMAIL_FROM || "Scout Admin <no-reply@localhost>"),
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      replyTo: message.replyTo,
      subject: message.subject,
      text: message.body,
      html: message.htmlBody,
      priority: message.priority,
      attachments: message.attachments,
    });

    await getPool().query("UPDATE email_outbox SET status = 'sent', sent_at = now() WHERE id = $1", [outboxId]);
  } catch (error) {
    await getPool().query(
      "UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1",
      [outboxId, error instanceof Error ? error.message : "Unknown email error"]
    );
    throw error;
  }
}
