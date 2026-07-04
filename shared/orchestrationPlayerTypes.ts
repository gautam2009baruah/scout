// Types for postMessage communication between Scout chatbot and parent window
// Used for in-context orchestration execution

export type OrchestrationPlayerMessage =
  | StartExecutionMessage
  | ExecutionStatusMessage
  | ExecutionCompleteMessage
  | ExecutionErrorMessage
  | PlayerReadyMessage;

// Message sent from chatbot to parent window to start orchestration execution
export interface StartExecutionMessage {
  type: 'SCOUT_START_EXECUTION';
  payload: {
    executionId: string;
    orchestrationId: string;
    orchestrationName: string;
    triggerData: Record<string, unknown>;
    context: Record<string, unknown>;
  };
}

// Message sent from parent window to chatbot with execution progress
export interface ExecutionStatusMessage {
  type: 'SCOUT_EXECUTION_STATUS';
  payload: {
    executionId: string;
    status: 'running' | 'paused' | 'waiting_for_input';
    currentStep?: string;
    completedSteps: number;
    totalSteps: number;
    message?: string;
  };
}

// Message sent from parent window to chatbot when execution completes
export interface ExecutionCompleteMessage {
  type: 'SCOUT_EXECUTION_COMPLETE';
  payload: {
    executionId: string;
    status: 'success' | 'partial_success';
    completedSteps: number;
    totalSteps: number;
    result?: Record<string, unknown>;
    message: string;
  };
}

// Message sent from parent window to chatbot when execution fails
export interface ExecutionErrorMessage {
  type: 'SCOUT_EXECUTION_ERROR';
  payload: {
    executionId: string;
    error: string;
    failedStep?: string;
    completedSteps: number;
    totalSteps: number;
  };
}

// Message sent from parent window to chatbot when player is ready
export interface PlayerReadyMessage {
  type: 'SCOUT_PLAYER_READY';
  payload: {
    ready: true;
  };
}

// Status overlay data displayed to user during execution
export interface ExecutionOverlayState {
  visible: boolean;
  executionId: string;
  orchestrationName: string;
  status: 'running' | 'paused' | 'completed' | 'error';
  currentStep?: string;
  completedSteps: number;
  totalSteps: number;
  steps: ExecutionStep[];
  message?: string;
  error?: string;
}

export interface ExecutionStep {
  id: string;
  label: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'skipped';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}
