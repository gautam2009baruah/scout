-- Remove deprecated reply-to usage from sender credentials and notification node configs.

ALTER TABLE email_sender_credentials
  DROP COLUMN IF EXISTS reply_to_email;

UPDATE orchestration_nodes
SET config = jsonb_set(
  config,
  '{channels,email}',
  (COALESCE(config->'channels'->'email', '{}'::jsonb) - 'replyTo'),
  true
)
WHERE config ? 'channels'
  AND (config->'channels') ? 'email'
  AND (config->'channels'->'email') ? 'replyTo';
