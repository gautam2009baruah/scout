import { createTriggerLog } from "@/lib/orchestrations/triggers";
import { SENSITIVE_HEADER_NAMES } from "./constants";

export function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase();
    if (SENSITIVE_HEADER_NAMES.has(normalized)) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function writeHttpTriggerAuditLog(input: {
  triggerId: string;
  orchestrationId: string;
  executionId?: string;
  status: "received" | "validated" | "started" | "failed";
  payload: Record<string, unknown>;
  errorMessage?: string;
  triggeredBy?: string;
}) {
  await createTriggerLog({
    triggerId: input.triggerId,
    orchestrationId: input.orchestrationId,
    executionId: input.executionId,
    status: input.status,
    payload: input.payload,
    errorMessage: input.errorMessage,
    triggeredBy: input.triggeredBy,
  });
}
