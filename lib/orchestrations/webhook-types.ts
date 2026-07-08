/**
 * Webhook Trigger Types
 * Type definitions for webhook trigger system
 */

export type WebhookTriggerConfig = {
  type: "webhook";
  webhookToken: string;
  secretKey?: string;
  allowedIps?: string[];
  requireSignature?: boolean;
  expectedMethod?: "POST" | "GET" | "PUT" | "PATCH";
  expectedContentType?: string;
  payloadFilters?: Record<string, any>;
  dataMapping?: Record<string, string>; // JSONPath expressions
  enabled: boolean;
};

export type WebhookTrigger = {
  id: string;
  orchestrationId: string;
  triggerId: string;
  webhookToken: string;
  webhookUrl: string;
  secretKey?: string;
  allowedIps?: string[];
  requireSignature: boolean;
  expectedMethod: string;
  expectedContentType: string;
  payloadFilters?: Record<string, any>;
  dataMapping?: Record<string, string>;
  isActive: boolean;
  lastTriggeredAt?: string;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  createdAt: string;
  updatedAt: string;
};

export type WebhookDelivery = {
  id: string;
  webhookTriggerId: string;
  orchestrationId: string;
  executionId?: string;
  requestMethod: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  requestIp: string;
  requestUserAgent?: string;
  statusCode: number;
  responseBody: string;
  processedAt: string;
  processingDurationMs: number;
  signatureValid?: boolean;
  ipAllowed?: boolean;
  filtersMatched?: boolean;
  success: boolean;
  errorMessage?: string;
  extractedData?: Record<string, any>;
  createdAt: string;
};

export type WebhookRequest = {
  method: string;
  headers: Record<string, string>;
  body: any;
  ip: string;
  userAgent?: string;
};

export type WebhookProcessingResult = {
  success: boolean;
  executionId?: string;
  statusCode: number;
  message: string;
  error?: string;
  extractedData?: Record<string, any>;
  validations: {
    signatureValid?: boolean;
    ipAllowed?: boolean;
    filtersMatched?: boolean;
  };
};
