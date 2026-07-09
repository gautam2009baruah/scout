export type ApiNodeAuthType = "none" | "api_key" | "bearer" | "basic";

export type ApiNodeRequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiNodeAuthConfig {
  type: ApiNodeAuthType;
  headerName?: string; // For API Key: e.g., "X-API-Key"
  value?: string; // Auth value
  username?: string; // For Basic Auth
  password?: string; // For Basic Auth
  token?: string; // For Bearer
}

export interface ApiNodeConfig {
  id: number;
  orchestrationId: number;
  nodeName: string;
  nodeDescription?: string;
  apiUrl: string;
  method: ApiNodeRequestMethod;
  headers?: Record<string, string>; // Custom headers
  auth: ApiNodeAuthConfig;
  requestBodyTemplate?: string; // JSON template, supports {{variable}} syntax
  responseMapping?: Record<string, string>; // Map response fields to output
  timeout: number; // milliseconds
  retryAttempts: number;
  retryDelayMs: number;
  failureStrategy: "stop" | "continue" | "alert"; // What to do on API failure
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiNodeExecutionRequest {
  nodeId: number;
  executionId: string;
  contextData?: Record<string, any>; // Data from previous nodes
}

export interface ApiNodeExecutionResult {
  success: boolean;
  statusCode?: number;
  responseData?: any;
  responseHeaders?: Record<string, string>;
  error?: string;
  duration: number; // milliseconds
  attempts: number;
  output?: Record<string, any>; // Mapped response data
}

export interface ApiNodeExecution {
  id: number;
  nodeId: number;
  executionId: string;
  requestPayload: any;
  responseStatus?: number;
  responsePayload?: any;
  error?: string;
  attempts: number;
  durationMs: number;
  createdAt: Date;
}
