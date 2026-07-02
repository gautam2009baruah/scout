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
  triggerType: OrchestrationTriggerType;
  triggerConfig: Record<string, unknown>;
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
