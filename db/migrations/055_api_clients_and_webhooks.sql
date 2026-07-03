-- Migration 055: API Clients and Enhanced Webhook Support
-- Created: 2026-07-03
-- Purpose: Add API client management and enhanced webhook trigger support

-- ============================================================================
-- API Clients Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  api_key TEXT NOT NULL, -- Encrypted API key
  is_active BOOLEAN NOT NULL DEFAULT true,
  rate_limit INTEGER NOT NULL DEFAULT 60, -- Requests per minute, 0 = unlimited
  allowed_orchestrations TEXT[] DEFAULT '{}', -- Empty array = all orchestrations allowed
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_email VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT api_clients_name_unique UNIQUE (name),
  CONSTRAINT api_clients_rate_limit_check CHECK (rate_limit >= 0)
);

CREATE INDEX IF NOT EXISTS idx_api_clients_is_active ON api_clients(is_active);
CREATE INDEX IF NOT EXISTS idx_api_clients_created_at ON api_clients(created_at);

COMMENT ON TABLE api_clients IS 'API clients for authenticated orchestration execution via API triggers';
COMMENT ON COLUMN api_clients.api_key IS 'Encrypted API key for authentication';
COMMENT ON COLUMN api_clients.rate_limit IS 'Maximum requests per minute, 0 means unlimited';
COMMENT ON COLUMN api_clients.allowed_orchestrations IS 'Array of orchestration IDs this client can execute, empty means all';

-- ============================================================================
-- API Request Logs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES api_clients(id) ON DELETE SET NULL,
  orchestration_id UUID REFERENCES orchestrations(id) ON DELETE SET NULL,
  trigger_id UUID REFERENCES orchestration_triggers(id) ON DELETE SET NULL,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  endpoint VARCHAR(500) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,
  request_body JSONB,
  response_body JSONB,
  error_message TEXT,
  ip_address VARCHAR(45), -- IPv6 compatible
  user_agent TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  CONSTRAINT api_request_logs_status_code_check CHECK (status_code >= 100 AND status_code < 600),
  CONSTRAINT api_request_logs_duration_check CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_client_id ON api_request_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_orchestration_id ON api_request_logs(orchestration_id);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_status_code ON api_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_requested_at ON api_request_logs(requested_at DESC);

COMMENT ON TABLE api_request_logs IS 'Audit log for all API trigger requests';
COMMENT ON COLUMN api_request_logs.status_code IS 'HTTP status code returned';
COMMENT ON COLUMN api_request_logs.duration_ms IS 'Request processing time in milliseconds';

-- ============================================================================
-- Webhook Request Logs Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  method VARCHAR(10) NOT NULL,
  headers JSONB,
  query_params JSONB,
  request_body JSONB,
  status_code INTEGER NOT NULL,
  response_body JSONB,
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  secret_validated BOOLEAN NOT NULL DEFAULT false,
  ip_allowed BOOLEAN NOT NULL DEFAULT true,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INTEGER,
  
  CONSTRAINT webhook_request_logs_status_code_check CHECK (status_code >= 100 AND status_code < 600),
  CONSTRAINT webhook_request_logs_duration_check CHECK (duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_trigger_id ON webhook_request_logs(trigger_id);
CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_orchestration_id ON webhook_request_logs(orchestration_id);
CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_status_code ON webhook_request_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_received_at ON webhook_request_logs(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_request_logs_secret_validated ON webhook_request_logs(secret_validated);

COMMENT ON TABLE webhook_request_logs IS 'Audit log for all webhook trigger requests';
COMMENT ON COLUMN webhook_request_logs.secret_validated IS 'Whether the X-Scout-Webhook-Secret header was valid';
COMMENT ON COLUMN webhook_request_logs.ip_allowed IS 'Whether the requesting IP was in the allowlist (if configured)';

-- ============================================================================
-- Rate Limiting Helper Table (for API clients)
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_rate_limits (
  client_id UUID NOT NULL REFERENCES api_clients(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  
  PRIMARY KEY (client_id, window_start)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start ON api_rate_limits(window_start);

COMMENT ON TABLE api_rate_limits IS 'Sliding window rate limit tracking for API clients';
COMMENT ON COLUMN api_rate_limits.window_start IS 'Start of the 1-minute window';
COMMENT ON COLUMN api_rate_limits.request_count IS 'Number of requests in this window';

-- ============================================================================
-- Cleanup Policy (Optional)
-- ============================================================================

-- Cleanup old rate limit windows (older than 2 minutes)
-- This can be run as a scheduled job
-- DELETE FROM api_rate_limits WHERE window_start < NOW() - INTERVAL '2 minutes';

-- Cleanup old request logs (optional, configure retention policy)
-- DELETE FROM api_request_logs WHERE requested_at < NOW() - INTERVAL '90 days';
-- DELETE FROM webhook_request_logs WHERE received_at < NOW() - INTERVAL '90 days';
