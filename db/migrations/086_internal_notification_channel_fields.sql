-- Migration 086: Add internal notification channel fields
-- Created: 2026-07-12
-- Purpose: Support rich internal notification configuration from Notification Node

ALTER TABLE IF EXISTS internal_notifications
  ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) DEFAULT 'information',
  ADD COLUMN IF NOT EXISTS action_label VARCHAR(255),
  ADD COLUMN IF NOT EXISTS action_url TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS persistent_until_read BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_internal_notifications_expires_at
  ON internal_notifications(expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_internal_notifications_persistent_until_read
  ON internal_notifications(persistent_until_read)
  WHERE persistent_until_read = TRUE;

COMMENT ON COLUMN internal_notifications.notification_type IS 'Severity/type for UI display: information, success, warning, critical';
COMMENT ON COLUMN internal_notifications.action_label IS 'Optional label for notification action button';
COMMENT ON COLUMN internal_notifications.action_url IS 'Optional URL opened when action button is clicked';
COMMENT ON COLUMN internal_notifications.expires_at IS 'Optional expiry timestamp after which notification is no longer active';
COMMENT ON COLUMN internal_notifications.persistent_until_read IS 'If true, keep notification visible until marked as read';
