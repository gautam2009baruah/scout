-- Remove reply-to email from outbound sender credentials model.

ALTER TABLE email_sender_credentials
  DROP COLUMN IF EXISTS reply_to_email;
