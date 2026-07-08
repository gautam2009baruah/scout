-- Migration 062: Webhook Triggers System
-- Adds webhook endpoint support for triggering orchestrations via HTTP POST

-- Create webhook_triggers table
-- Stores webhook endpoints and their configurations
CREATE TABLE IF NOT EXISTS webhook_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orchestration_id UUID NOT NULL REFERENCES orchestrations(id) ON DELETE CASCADE,
  trigger_id UUID NOT NULL REFERENCES orchestration_triggers(id) ON DELETE CASCADE,
  
  -- Webhook identification
  webhook_token TEXT NOT NULL UNIQUE, -- Unique token for webhook URL
  webhook_url TEXT NOT NULL, -- Full webhook URL (computed)
  
  -- Security
  secret_key TEXT, -- Optional secret for HMAC signature validation
  allowed_ips TEXT[], -- Optional IP whitelist
  require_signature BOOLEAN DEFAULT false,
  
  -- Request filtering
  expected_method TEXT DEFAULT 'POST' CHECK (expected_method IN ('POST', 'GET', 'PUT', 'PATCH')),
  expected_content_type TEXT DEFAULT 'application/json',
  
  -- Payload filtering (JSONPath or simple key matching)
  payload_filters JSONB, -- e.g., {"event_type": "user.created", "source": "github"}
  
  -- Data extraction (JSONPath expressions to extract data from webhook payload)
  data_mapping JSONB, -- e.g., {"userId": "$.user.id", "email": "$.user.email"}
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMP WITH TIME ZONE,
  total_deliveries INTEGER DEFAULT 0,
  successful_deliveries INTEGER DEFAULT 0,
  failed_deliveries INTEGER DEFAULT 0,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by_email TEXT,
  updated_by_email TEXT
);

-- Create webhook_deliveries table
-- Logs each webhook request received
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_trigger_id UUID NOT NULL REFERENCES webhook_triggers(id) ON DELETE CASCADE,
  orchestration_id UUID NOT NULL,
  execution_id UUID REFERENCES orchestration_executions(id) ON DELETE SET NULL,
  
  -- Request details
  request_method TEXT NOT NULL,
  request_headers JSONB,
  request_body TEXT,
  request_ip TEXT,
  request_user_agent TEXT,
  
  -- Response details
  status_code INTEGER,
  response_body TEXT,
  
  -- Processing
  processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processing_duration_ms INTEGER,
  
  -- Validation
  signature_valid BOOLEAN,
  ip_allowed BOOLEAN,
  filters_matched BOOLEAN,
  
  -- Outcome
  success BOOLEAN NOT NULL,
  error_message TEXT,
  extracted_data JSONB,
  
  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for webhook_triggers
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_orchestration ON webhook_triggers(orchestration_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_trigger ON webhook_triggers(trigger_id);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_token ON webhook_triggers(webhook_token);
CREATE INDEX IF NOT EXISTS idx_webhook_triggers_active ON webhook_triggers(is_active);

-- Indexes for webhook_deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_trigger_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_orchestration ON webhook_deliveries(orchestration_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_execution ON webhook_deliveries(execution_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created ON webhook_deliveries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_success ON webhook_deliveries(success);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_webhook_triggers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_webhook_triggers_updated_at ON webhook_triggers;
CREATE TRIGGER trigger_webhook_triggers_updated_at
  BEFORE UPDATE ON webhook_triggers
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_triggers_updated_at();
