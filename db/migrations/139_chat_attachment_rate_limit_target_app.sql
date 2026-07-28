-- Finishes migration 138 for chat_attachment_rate_limit_windows, which
-- couldn't follow the same pattern at the time because it had no
-- target_app_id column at all (company_id was part of its primary key).
-- Contents are purely rolling rate-limit bookkeeping (rows older than a day
-- are deleted at the top of every enforceChatAttachmentRateLimit call — see
-- lib/chat/attachments.ts), so there's nothing worth backfilling; existing
-- windows are just reset.
TRUNCATE TABLE chat_attachment_rate_limit_windows;

ALTER TABLE chat_attachment_rate_limit_windows DROP CONSTRAINT chat_attachment_rate_limit_windows_pkey;
ALTER TABLE chat_attachment_rate_limit_windows DROP COLUMN company_id;
ALTER TABLE chat_attachment_rate_limit_windows
  ADD COLUMN target_app_id UUID NOT NULL REFERENCES company_target_applications(id) ON DELETE CASCADE;
ALTER TABLE chat_attachment_rate_limit_windows
  ADD CONSTRAINT chat_attachment_rate_limit_windows_pkey PRIMARY KEY (target_app_id, client_key, window_start);
