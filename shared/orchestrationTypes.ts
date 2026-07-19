// Orchestration types for visual workflow orchestration system

// ============================================================================
// Core Orchestration Types
// ============================================================================

export type OrchestrationStatus = "draft" | "published";

export type OrchestrationTriggerType =
  | "manual"
  | "chatbot"
  | "schedule"
  | "email"
  | "http_api";

/**
 * All available trigger types as a constant array (alphabetically sorted)
 * Use this for dropdowns, filters, and validation
 */
export const TRIGGER_TYPES: readonly OrchestrationTriggerType[] = [
  "chatbot",
  "email",
  "http_api",
  "manual",
  "schedule",
] as const;

/**
 * Display labels for trigger types
 * Use this for consistent UI labeling
 */
export const TRIGGER_TYPE_LABELS: Record<OrchestrationTriggerType, string> = {
  manual: "Manual",
  chatbot: "Chatbot",
  schedule: "Schedule",
  email: "Email",
  http_api: "HTTP/API",
};

/**
 * Upcoming trigger types that are not yet implemented
 * These will be shown as disabled/strikethrough in UI
 */
export const UPCOMING_TRIGGER_TYPES: readonly OrchestrationTriggerType[] = [
] as const;

export type Orchestration = {
  id: string;
  companyId: string;
  targetAppId?: string | null;
  name: string;
  description: string | null;
  version: number;
  status: OrchestrationStatus;
  variables: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  createdById?: string | null;
  updatedById?: string | null;
  createdByEmail: string | null;
  updatedByEmail: string | null;
  publishedAt: string | null;
  publishedById?: string | null;
  publishedByEmail: string | null;
};

// ============================================================================
// Node Types
// ============================================================================

export type NodeType =
  | "trigger"
  | "workflow"
  | "data_capture"
  | "ai_extraction"
  | "ai_decision"
  | "condition"
  | "human_approval"
  | "notification"
  | "variable"
  | "api_call"
  | "database"
  | "end";

export type OrchestrationNode = {
  id: string;
  orchestrationId: string;
  nodeType: NodeType;
  label: string;
  positionX: number;
  positionY: number;
  config: NodeConfig;
  displayDescription?: string; // Human-readable step description for execution plan
  createdAt: string;
  updatedAt: string;
};

// Node-specific configurations
export type NodeConfig =
  | TriggerNodeConfig
  | WorkflowNodeConfig
  | DataCaptureNodeConfig
  | AIExtractionNodeConfig
  | AIDecisionNodeConfig
  | ConditionNodeConfig
  | HumanApprovalNodeConfig
  | NotificationNodeConfig
  | VariableNodeConfig
  | ApiCallNodeConfig
  | DatabaseNodeConfig
  | EndNodeConfig;

export type TriggerNodeConfig = {
  type: "trigger";
  triggerType: OrchestrationTriggerType;
  schedule?: {
    cron?: string;
    timezone?: string;
  };
};

export type OutputMappingField = {
  fieldName: string; // Variable name to store the captured value
  selector: string; // CSS selector to find the element
  dataType: "text" | "number" | "date"; // Type of data to extract
  required: boolean; // Whether to prompt user if not found
};

export type WorkflowNodeConfig = {
  type: "workflow";
  workflowId?: string;
  workflowVersion?: number;
  targetUrl?: string; // Target URL for workflow execution (can be expression)
  waitForCompletion?: boolean; // Whether to wait for workflow to complete
  inputMapping: Record<string, string>; // variable expressions to workflow inputs
  outputMapping?: OutputMappingField[]; // Capture system-generated values from final page
  continueOnFailure: boolean;
  timeout?: number;
  triggerPhrases?: string[]; // Which trigger phrases execute this workflow (multi-select)
  autoFillFromDataCapture?: boolean; // Auto-fill from previous data capture
  autoAdvancement?: boolean; // Auto-advance after filling each field (requires autoFillFromDataCapture)
};

export type DataCaptureMode = "dom" | "ai" | "hybrid" | "comprehensive";

export type DataCaptureNodeConfig = {
  type: "data_capture";
  mode: DataCaptureMode; // Capture strategy
  showReviewScreen?: boolean; // Show review overlay (default true)
  allowEdit?: boolean; // Allow user to edit captured values (default true)
  autoReviewTimeout?: number; // Auto-continue after N seconds (0 = require click)
  pageWaitMs?: number; // Wait before capturing (for dynamic content)
  outputVariable?: string; // Where to store captured data (default "capturedData")
  continueOnFailure?: boolean; // Continue even if required fields missing
};

export type AIExtractionNodeConfig = {
  type: "ai_extraction";
  inputType?: "email" | "document" | "text" | "variables";
  input?: string; // template text (supports {{variable}} interpolation)
  inputSource?: string; // legacy: single variable path
  prompt?: string; // optional extra instructions for the model
  clarificationTimeoutMinutes?: number; // how long to keep a clarification request active
  fields?: Array<{
    key: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    description?: string;
    required?: boolean;
  }>;
  schema: Record<string, unknown>; // fields to extract: { key: { type, description } }
  outputVariable: string; // where to store extracted data
};

export type AIDecisionIntent =
  | "chat"
  | "workflow_match"
  | "need_clarification"
  | "propose_plan"
  | "execute_plan"
  | "fallback";

export type AIDecisionClarificationQuestion = {
  question: string;
  purpose?: string;
  inputKey?: string;
  required?: boolean;
};

export type AIDecisionPlanStep = {
  id: string;
  label: string;
  nodeType: NodeType | string;
  reason: string;
  inputMapping?: Record<string, string>;
  outputVariable?: string;
  requiresConfirmation?: boolean;
  confidence?: number;
  metadata?: Record<string, unknown>;
};

export type AIDecisionStructuredResult = {
  intent: AIDecisionIntent;
  confidence: number;
  reason?: string;
  message?: string;
  selectedDecisionLabel?: string;
  selectedDecisionHandle?: string;
  matchedOrchestrationIds?: string[];
  matchedOrchestrationNames?: string[];
  needsClarification?: boolean;
  clarifyingQuestions?: AIDecisionClarificationQuestion[];
  requireUserConfirmation?: boolean;
  plan?: AIDecisionPlanStep[];
  metadata?: Record<string, unknown>;
};

export type AIDecisionOption = {
  label: string;
  description?: string;
  outputHandle: string;
  aliases?: string[];
  keywords?: string[];
  metadata?: Record<string, unknown>;
};

export type AIDecisionNodeConfig = {
  type: "ai_decision";
  inputSource: string; // variable expression
  prompt: string;
  decisions: AIDecisionOption[];
  defaultDecision?: string;
};

export type ConditionOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "contains_any"
  | "contains_all"
  | "not_contains_any"
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
    logicAfter?: "and" | "or"; // Logic operator to apply AFTER this condition (not used for last condition)
    caseSensitive?: boolean; // Whether string comparison is case-sensitive (default: false - case-insensitive)
  }>;
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
  // Legacy single-channel fields (kept for backward compatibility)
  channel?: "email" | "teams" | "slack" | "internal";
  recipient?: string; // can use variable expression
  subject?: string; // legacy subject
  message?: string; // legacy message
  template?: string;
  // New multi-channel configuration
  channels?: {
    email?: {
      enabled: boolean;
      senderCredentialId?: string;
      fromName?: string;
      to?: string;
      cc?: string;
      bcc?: string;
      subject?: string;
      body?: string;
      bodyFormat?: "rich_text" | "plain_text";
      template?: string;
      attachments?: Array<{
        name?: string;
        url?: string;
        contentType?: string;
      }>;
      priority?: "low" | "normal" | "high";
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
    internal?: {
      enabled: boolean;
      users?: string;
      roles?: string;
      teams?: string;
      groups?: string;
      title?: string;
      message?: string;
      notificationType?: "information" | "success" | "warning" | "critical";
      actionLabel?: string;
      actionUrl?: string;
      expiryDate?: string;
      persistentUntilRead?: boolean;
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
    teams?: {
      enabled: boolean;
      connection?: string;
      workspace?: string;
      team?: string;
      channel?: string;
      mentions?: string;
      title?: string;
      message?: string;
      messageFormat?: "adaptive_card" | "plain_text";
      actionButtons?: Array<{
        label: string;
        url: string;
      }>;
      webhookUrl?: string;
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
    slack?: {
      enabled: boolean;
      connection?: string;
      workspace?: string;
      channel?: string;
      directMessageRecipient?: string;
      mentions?: string;
      message?: string;
      messageFormat?: "plain_text" | "block_kit";
      actionButtons?: Array<{
        label: string;
        url: string;
      }>;
      threadTs?: string;
      webhookUrl?: string;
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
    sms?: {
      enabled: boolean;
      senderId?: string;
      recipients?: string;
      message?: string;
      template?: string;
      unicodeSupport?: boolean;
      webhookUrl?: string;
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
    whatsapp?: {
      enabled: boolean;
      businessAccount?: string;
      senderNumber?: string;
      recipients?: string;
      messageType?: "approved_template" | "session_message";
      templateName?: string;
      templateLanguage?: string;
      templateVariables?: string;
      body?: string;
      mediaAttachment?: string;
      interactiveButtons?: Array<{
        label: string;
        actionType: "url" | "reply";
        value: string;
      }>;
      webhookUrl?: string;
      delivery?: {
        mode?: "immediate" | "scheduled";
        scheduledAt?: string;
      };
      retry?: {
        enabled?: boolean;
        maxAttempts?: number;
        delaySeconds?: number;
      };
    };
  };
};

export type VariableNodeConfig = {
  type: "variable";
  variables: Array<{
    name: string;
    value: string; // Can be literal value or expression like {{capturedData.xxx}}
  }>;
};

export type ApiCallAuthConfig = {
  type: "none" | "api_key" | "bearer" | "basic" | "oauth2" | "custom_headers";
  // Legacy flat fields (backward compatibility)
  headerName?: string;
  value?: string;
  username?: string;
  password?: string;
  token?: string;
  // Preferred structured auth config
  apiKey?: {
    location: "header" | "query";
    name: string;
    value: string;
  };
  bearerToken?: string;
  basic?: {
    username: string;
    password: string;
  };
  oauth2?: {
    accessToken?: string;
    tokenUrl?: string;
    clientId?: string;
    clientSecret?: string;
    scope?: string;
    audience?: string;
    grantType?: "client_credentials" | "password";
    username?: string;
    password?: string;
    authStyle?: "basic" | "body";
  };
  customHeaders?: Array<{
    key: string;
    value: string;
    secret?: boolean;
  }>;
  mtls?: {
    enabled?: boolean;
    certPath?: string;
    keyPath?: string;
    caPath?: string;
    passphrase?: string;
  };
};

export type ApiCallNodeConfig = {
  type: "api_call";
  apiUrl: string; // Can be expression like {{workflowId}}
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
  pathVariables?: Array<{
    name: string;
    value: string;
  }>;
  queryParameters?: Array<{
    key: string;
    value: string;
    enabled?: boolean;
  }>;
  headers?:
    | Record<string, string>
    | Array<{
        key: string;
        value: string;
        enabled?: boolean;
        secret?: boolean;
      }>;
  auth: ApiCallAuthConfig;
  bodyFormat?: "none" | "json" | "form_data" | "url_encoded" | "raw_text" | "xml" | "binary";
  requestBodyTemplate?: string;
  formDataFields?: Array<{
    key: string;
    value?: string;
    isFile?: boolean;
    filePath?: string;
    fileName?: string;
    contentType?: string;
    enabled?: boolean;
  }>;
  urlEncodedFields?: Array<{
    key: string;
    value: string;
    enabled?: boolean;
  }>;
  binaryBodyBase64?: string;
  fileUploads?: Array<{
    fieldName: string;
    filePath: string;
    fileName?: string;
    contentType?: string;
    enabled?: boolean;
  }>;
  responseMapping?: Record<string, string>; // Map response fields to output (JSONPath)
  responseFieldMappings?: Array<{
    outputKey: string;
    jsonPath: string;
  }>;
  outputVariableName?: string;
  successStatusCodes?: string;
  includeRawResponse?: boolean;
  timeout: number; // milliseconds
  retryAttempts: number;
  retryDelayMs: number;
  failureStrategy: "stop" | "continue" | "alert"; // What to do on API failure
};

export type DatabaseNodeConfig = {
  type: "database";
  schemaId?: string;
  outputVariable?: string;
  userRequestVariablePath?: string;
  extractedInputVariablePath?: string;
  additionalContextVariablePath?: string;
  maxRows?: number;
  customInstructions?: string;
  allowSelectStar?: boolean;
};

export type EndNodeConfig = {
  type: "end";
  displayMessage?: boolean; // Whether to display a message to the user
  message?: string; // Message to display (only used if displayMessage is true)
  outputVariables?: string[]; // which variables to include in final output
  responseVariablePath?: string; // where to store the aggregated final response
  includeNodeResponses?: boolean; // include per-node outputs/status in final response
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
  | "paused"
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
  respondedById?: string | null;
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
  createdById?: string | null;
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

export type TriggerStatus =
  | "active"
  | "inactive"
  | "error"
  | "suspended"
  | "revoked";

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
  createdById?: string | null;
  updatedById?: string | null;
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
  specificTimeUtc?: string; // UTC time-of-day persisted for recurring schedules (HH:mm)
  dayOfWeek?: number; // 0-6 for weekly (0 = Sunday)
  dayOfMonth?: number; // 1-31 for monthly
  oneTimeDate?: string; // ISO date for one-time
  timezone: string; // e.g., "UTC", "America/New_York"
  startDate?: string; // ISO date - when to start the schedule
  endDate?: string; // ISO date - when to end the schedule
  enabled: boolean;
  nextRunAt?: string; // Computed next execution time
};

export type ChatbotTriggerConfig = {
  type: "chatbot";
  triggerPhrases: string[]; // User phrases that trigger this orchestration
  examplePhrases: string[]; // Example user phrases for intent matching
  requiredVariables?: Array<{
    name: string;
    label: string;
    type: "text" | "number" | "boolean" | "select";
    description?: string;
    options?: Array<{ label: string; value: string }>; // For select type
  }>;
  allowedRoles?: string[]; // Roles that can trigger this (empty = all)
  allowedUsers?: string[]; // Specific user emails (empty = all)
  minConfidence: number; // Auto-match strictness threshold (0-1), not a hard truth
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

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type HttpApiAuthType =
  | "none"
  | "api_key"
  | "basic"
  | "oauth2_jwt"
  | "hmac"
  | "m_tls";

export type HttpApiFieldRule = {
  name: string;
  required: boolean;
  pattern?: string;
  description?: string;
};

export type HttpApiRateLimitConfig = {
  enabled: boolean;
  maxRequests: number;
  windowSeconds: number;
  throttleDelayMs?: number;
};

export type HttpApiReplayProtectionConfig = {
  enabled: boolean;
  timestampHeader: string;
  nonceHeader: string;
  maxAgeSeconds: number;
};

export type HttpApiApiKeyCredential = {
  id: string;
  label: string;
  secretHash: string;
  isActive: boolean;
  createdAt?: string;
};

export type HttpApiBasicCredential = {
  id: string;
  username: string;
  passwordHash: string;
  isActive: boolean;
  createdAt?: string;
};

export type HttpApiJwtConfig = {
  headerName: string;
  issuer?: string;
  audience?: string;
  sharedSecretHash?: string;
  sharedSecretEnc?: string;
  clockSkewSeconds?: number;
};

export type HttpApiHmacCredential = {
  keyId: string;
  secretHash: string;
  secretEnc?: string;
  isActive: boolean;
  createdAt?: string;
};

export type HttpApiHmacConfig = {
  keyIdHeader: string;
  signatureHeader: string;
  timestampHeader: string;
  nonceHeader: string;
  algorithm: "sha256";
  credentials: HttpApiHmacCredential[];
};

export type HttpApiMutualTlsConfig = {
  required: boolean;
  subjectAllowlist?: string[];
};

export type HttpApiAuthConfig =
  | {
      type: "none";
    }
  | {
      type: "api_key";
      headerName: string;
      credentials: HttpApiApiKeyCredential[];
    }
  | {
      type: "basic";
      credentials: HttpApiBasicCredential[];
    }
  | {
      type: "oauth2_jwt";
      jwt: HttpApiJwtConfig;
    }
  | {
      type: "hmac";
      hmac: HttpApiHmacConfig;
    }
  | {
      type: "m_tls";
      mutualTls: HttpApiMutualTlsConfig;
    };

export type HttpApiTriggerConfig = {
  type: "http_api";
  shortName: string;
  allowedMethods: HttpMethod[];
  allowedContentTypes: string[];
  maxPayloadBytes: number;
  requireBody: boolean;
  headers: HttpApiFieldRule[];
  queryParameters: HttpApiFieldRule[];
  pathParameters: HttpApiFieldRule[];
  auth: HttpApiAuthConfig;
  ipAllowlist: string[];
  rateLimit: HttpApiRateLimitConfig;
  replayProtection: HttpApiReplayProtectionConfig;
  enforceHttps: boolean;
  status: "active" | "suspended" | "revoked";
};

export type TriggerConfig =
  | ManualTriggerConfig
  | ScheduleTriggerConfig
  | ChatbotTriggerConfig
  | EmailTriggerConfig
  | HttpApiTriggerConfig;

// Trigger context that gets passed to orchestration
export type TriggerContext = {
  type: OrchestrationTriggerType;
  triggerId: string;
  startedBy: string | null;
  startedAt: string;
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
};
