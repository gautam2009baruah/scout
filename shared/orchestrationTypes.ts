// Orchestration types for visual workflow orchestration system

// ============================================================================
// Core Orchestration Types
// ============================================================================

export type OrchestrationStatus = "draft" | "published";

export type OrchestrationTriggerType =
  | "manual"
  | "chatbot"
  | "schedule"
  | "webhook"
  | "api"
  | "email"
  | "file_upload";

export type Orchestration = {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  version: number;
  status: OrchestrationStatus;
  variables: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  updatedByEmail: string | null;
  publishedAt: string | null;
  publishedByEmail: string | null;
};

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | "trigger"
  | "workflow"
  | "ai_extraction"
  | "ai_decision"
  | "condition"
  | "human_approval"
  | "notification"
  | "variable"
  | "end";

export type OrchestrationNode = {
  id: string;
  orchestrationId: string;
  nodeType: NodeType;
  label: string;
  positionX: number;
  positionY: number;
  config: NodeConfig;
  createdAt: string;
  updatedAt: string;
};

// Node-specific configurations
export type NodeConfig =
  | TriggerNodeConfig
  | WorkflowNodeConfig
  | AIExtractionNodeConfig
  | AIDecisionNodeConfig
  | ConditionNodeConfig
  | HumanApprovalNodeConfig
  | NotificationNodeConfig
  | VariableNodeConfig
  | EndNodeConfig;

export type TriggerNodeConfig = {
  type: "trigger";
  triggerType: OrchestrationTriggerType;
  schedule?: {
    cron?: string;
    timezone?: string;
  };
  webhook?: {
    authRequired?: boolean;
    secretKey?: string;
  };
};

export type WorkflowNodeConfig = {
  type: "workflow";
  workflowId?: string;
  workflowVersion?: number;
  executionMode?: "manual" | "auto" | "scheduled"; // How to execute the workflow
  targetUrl?: string; // Target URL for workflow execution (can be expression)
  waitForCompletion?: boolean; // Whether to wait for workflow to complete
  notifyUser?: boolean; // Whether to notify user for manual execution
  inputMapping: Record<string, string>; // variable expressions to workflow inputs
  outputMapping: Record<string, string>; // workflow outputs to variables
  continueOnFailure: boolean;
  timeout?: number;
};

export type AIExtractionNodeConfig = {
  type: "ai_extraction";
  inputType: "email" | "document" | "text" | "variables";
  inputSource: string; // variable expression
  prompt?: string;
  schema: Record<string, unknown>; // JSON schema for output validation
  outputVariable: string; // where to store extracted data
};

export type AIDecisionNodeConfig = {
  type: "ai_decision";
  inputSource: string; // variable expression
  prompt: string;
  decisions: Array<{
    label: string;
    description?: string;
    outputHandle: string;
  }>;
  defaultDecision?: string;
};

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater_than"
  | "less_than"
  | "exists"
  | "not_exists"
  | "empty"
  | "not_empty";

export type ConditionNodeConfig = {
  type: "condition";
  conditions: Array<{
    variable: string; // variable expression
    operator: ConditionOperator;
    value?: unknown;
  }>;
  logic: "and" | "or";
};

export type HumanApprovalNodeConfig = {
  type: "human_approval";
  approverEmail: string; // can use variable expression
  title: string;
  description?: string;
  fields?: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    options?: string[];
    editable: boolean;
    defaultValue?: unknown;
  }>;
  timeout?: number; // minutes
  escalationEmail?: string;
};

export type NotificationNodeConfig = {
  type: "notification";
  channel: "email" | "teams" | "slack" | "internal";
  recipient: string; // can use variable expression
  subject?: string; // for email
  message: string; // can use variable expressions
  template?: string;
};

export type VariableOperation = "create" | "update" | "transform" | "delete";

export type VariableNodeConfig = {
  type: "variable";
  operation: VariableOperation;
  variableName: string;
  value?: unknown; // can be expression or literal
  expression?: string; // for transforms
};

export type EndNodeConfig = {
  type: "end";
  status: "success" | "failure";
  message?: string;
  outputVariables?: string[]; // which variables to include in final output
};

// ============================================================================
// Connection Types
// ============================================================================

export type OrchestrationConnection = {
  id: string;
  orchestrationId: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  condition: Record<string, unknown> | null;
  createdAt: string;
};

// ============================================================================
// Execution Types
// ============================================================================

export type OrchestrationExecutionStatus =
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export type OrchestrationExecution = {
  id: string;
  orchestrationId: string;
  orchestrationVersion: number;
  status: OrchestrationExecutionStatus;
  context: Record<string, unknown>; // shared execution context
  triggerData: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  currentNodeId: string | null;
  triggeredBy: string | null;
};

export type NodeExecutionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export type OrchestrationNodeExecution = {
  id: string;
  executionId: string;
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  status: NodeExecutionStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  retryCount: number;
};

// ============================================================================
// Approval Types
// ============================================================================

export type ApprovalStatus = "pending" | "approved" | "rejected";

export type OrchestrationApproval = {
  id: string;
  executionId: string;
  nodeExecutionId: string;
  approverEmail: string;
  status: ApprovalStatus;
  requestData: Record<string, unknown> | null;
  responseData: Record<string, unknown> | null;
  requestedAt: string;
  respondedAt: string | null;
  respondedByEmail: string | null;
  notes: string | null;
};

// ============================================================================
// Version Types
// ============================================================================

export type OrchestrationVersion = {
  id: string;
  orchestrationId: string;
  version: number;
  snapshot: OrchestrationSnapshot;
  createdAt: string;
  createdByEmail: string | null;
  changeNotes: string | null;
};

export type OrchestrationSnapshot = {
  orchestration: Orchestration;
  nodes: OrchestrationNode[];
  connections: OrchestrationConnection[];
};

// ============================================================================
// Designer Types (for UI)
// ============================================================================

export type DesignerNode = {
  id: string;
  type: NodeType;
  data: {
    label: string;
    config: NodeConfig;
  };
  position: {
    x: number;
    y: number;
  };
};

export type DesignerEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
};

// ============================================================================
// Node Interface (for plugin architecture)
// ============================================================================

export interface IOrchestrationNode {
  validate(config: NodeConfig): { valid: boolean; errors: string[] };
  execute(
    config: NodeConfig,
    context: Record<string, unknown>,
    execution: OrchestrationExecution
  ): Promise<{
    success: boolean;
    output?: Record<string, unknown>;
    error?: string;
  }>;
  serialize(config: NodeConfig): Record<string, unknown>;
  deserialize(data: Record<string, unknown>): NodeConfig;
  renderProperties(
    config: NodeConfig,
    onChange: (config: NodeConfig) => void
  ): React.ReactNode;
}

// ============================================================================
// Analytics Types
// ============================================================================

export type OrchestrationAnalytics = {
  totalExecutions: number;
  successRate: number;
  failedExecutions: number;
  averageDurationMs: number;
  aiUsageCount: number;
  humanApprovalTime: number;
  workflowUsageCount: number;
  timeSavedMs: number;
  nodeExecutionStats: Array<{
    nodeType: NodeType;
    totalExecutions: number;
    failures: number;
    averageDurationMs: number;
  }>;
};

// ============================================================================
// Trigger Types
// ============================================================================

export type TriggerStatus = "active" | "inactive" | "error";

export type OrchestrationTrigger = {
  id: string;
  orchestrationId: string;
  triggerType: OrchestrationTriggerType;
  name: string;
  description: string | null;
  config: Record<string, unknown>; // Encrypted sensitive data
  status: TriggerStatus;
  lastTriggeredAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  createdByEmail: string | null;
  updatedByEmail: string | null;
};

export type TriggerExecutionLog = {
  id: string;
  triggerId: string;
  orchestrationId: string;
  executionId: string | null;
  status: "received" | "validated" | "started" | "failed";
  payload: Record<string, unknown>;
  errorMessage: string | null;
  triggeredAt: string;
  triggeredBy: string | null;
};

// Trigger configuration schemas for each type
export type ManualTriggerConfig = {
  type: "manual";
  inputFields?: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "boolean" | "select" | "textarea";
    required: boolean;
    defaultValue?: string | number | boolean;
    options?: Array<{ label: string; value: string }>; // for select
    placeholder?: string;
    description?: string;
  }>;
};

export type ScheduleTriggerConfig = {
  type: "schedule";
  scheduleType: "one-time" | "daily" | "weekly" | "monthly" | "cron"; // Schedule frequency
  cronExpression?: string; // Required if scheduleType is "cron"
  specificTime?: string; // e.g., "14:30" for daily/weekly
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  oneTimeDate?: string; // ISO date for one-time
  timezone: string; // e.g., "UTC", "America/New_York"
  startDate?: string; // ISO date - when to start the schedule
  endDate?: string; // ISO date - when to end the schedule
  enabled: boolean;
  nextRunAt?: string; // Computed next execution time
};

export type WebhookTriggerConfig = {
  type: "webhook";
  webhookUrl?: string; // Generated after trigger creation
  secret: string; // Encrypted, validated via X-Scout-Webhook-Secret header
  allowedMethods: Array<"GET" | "POST" | "PUT">; // Default: ["POST"]
  allowedIPs?: string[]; // Optional IP allowlist
  payloadSchema?: Record<string, unknown>; // Optional JSON schema validation
  enabled: boolean;
};

export type ChatbotTriggerConfig = {
  type: "chatbot";
  intentName: string; // Name of the intent that triggers this
  examplePhrases: string[]; // Example user phrases for intent matching
  requiredVariables?: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    description?: string;
    options?: Array<{ label: string; value: string }>; // For select type
  }>;
  confirmationRequired: boolean; // If true, ask user before running
  confirmationMessage?: string; // Custom confirmation message
  allowedRoles?: string[]; // Roles that can trigger this (empty = all)
  allowedUsers?: string[]; // Specific user emails (empty = all)
  minConfidence: number; // Minimum confidence threshold (0-1)
  enabled: boolean;
};

export type APITriggerConfig = {
  type: "api";
  allowedClients?: string[]; // Client IDs that can use this trigger
  requestSchema?: Record<string, unknown>; // Expected request body schema
  rateLimit?: number; // Requests per minute, 0 = unlimited
  enabled: boolean;
};

export type EmailTriggerConfig = {
  type: "email";
  provider: "gmail" | "outlook" | "imap"; // Email provider
  mailbox: string; // Email address to monitor
  folder?: string; // Folder/label to monitor (default: INBOX)
  senderFilter?: string; // Filter by sender email
  subjectContains?: string; // Subject must contain this
  bodyContains?: string; // Body must contain this
  unreadOnly: boolean; // Only process unread emails
  hasAttachment?: boolean; // Require attachment
  pollingIntervalMinutes: number; // How often to check for emails
  markAsProcessed: boolean; // Mark email as read/processed after execution
  credentialId?: string; // Reference to stored OAuth token or IMAP credentials
  imapConfig?: {
    host: string;
    port: number;
    tls: boolean;
    username: string;
    // Password stored separately in secure vault, not here
  };
  enabled: boolean;
};

export type FileUploadTriggerConfig = {
  type: "file_upload";
  allowedFileTypes: string[]; // e.g., [".pdf", ".docx", ".txt"]
  maxFileSizeMB: number; // Maximum file size in megabytes
  allowMultipleFiles: boolean; // Allow multiple file uploads
  requiredMetadata?: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "select";
    required: boolean;
    description?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
  virusScanEnabled: boolean; // Enable virus scanning if available
  storageLocation: string; // Where to store uploaded files
  aiExtractionCompatible: boolean; // If true, files can be read by AI extraction nodes
  enabled: boolean;
};

export type TriggerConfig =
  | ManualTriggerConfig
  | ScheduleTriggerConfig
  | WebhookTriggerConfig
  | ChatbotTriggerConfig
  | APITriggerConfig
  | EmailTriggerConfig
  | FileUploadTriggerConfig;

// ============================================================================
// API Client & Key Types (for API Trigger authentication)
// ============================================================================

export type APIClient = {
  id: string;
  name: string;
  description: string | null;
  apiKey: string; // Encrypted
  isActive: boolean;
  rateLimit: number; // Requests per minute, 0 = unlimited
  allowedOrchestrations: string[]; // Empty = all orchestrations
  lastUsedAt: string | null;
  createdAt: string;
  createdByEmail: string | null;
};

export type APIRequestLog = {
  id: string;
  clientId: string;
  orchestrationId: string;
  triggerId: string | null;
  executionId: string | null;
  endpoint: string;
  method: string;
  statusCode: number;
  requestBody: Record<string, unknown> | null;
  responseBody: Record<string, unknown> | null;
  errorMessage: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestedAt: string;
  durationMs: number | null;
};

// Trigger context that gets passed to orchestration
export type TriggerContext = {
  type: OrchestrationTriggerType;
  triggerId: string;
  startedBy: string | null;
  startedAt: string;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
