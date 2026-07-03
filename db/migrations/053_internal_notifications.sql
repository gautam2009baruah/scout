-- Migration 053: Internal Notifications for Orchestrations
-- Created: 2026-07-02
-- Purpose: Store internal notifications for orchestration workflows

-- Internal notifications table
-- Stores notifications that can be displayed in-app to users
CREATE TABLE IF NOT EXISTS internal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  type VARCHAR(50) NOT NULL DEFAULT 'orchestration',
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  read_at TIMESTAMP
);

-- Index for querying user notifications
CREATE INDEX IF NOT EXISTS idx_internal_notifications_user_id ON internal_notifications(user_id);

-- Index for unread notifications
CREATE INDEX IF NOT EXISTS idx_internal_notifications_unread ON internal_notifications(user_id, read) WHERE read = FALSE;

-- Index for notification type
CREATE INDEX IF NOT EXISTS idx_internal_notifications_type ON internal_notifications(type);

-- Index for created_at for sorting
CREATE INDEX IF NOT EXISTS idx_internal_notifications_created_at ON internal_notifications(created_at DESC);

COMMENT ON TABLE internal_notifications IS 'Internal notifications for orchestration workflows and system events';
COMMENT ON COLUMN internal_notifications.user_id IS 'User identifier (email or user ID)';
COMMENT ON COLUMN internal_notifications.title IS 'Notification title/subject';
COMMENT ON COLUMN internal_notifications.message IS 'Notification message body';
COMMENT ON COLUMN internal_notifications.read IS 'Whether the notification has been read';
COMMENT ON COLUMN internal_notifications.type IS 'Notification type (orchestration, system, workflow, etc)';
COMMENT ON COLUMN internal_notifications.metadata IS 'Additional metadata as JSON';
COMMENT ON COLUMN internal_notifications.read_at IS 'Timestamp when notification was marked as read';
