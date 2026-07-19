/**
 * API endpoint for single orchestration execution details
 * GET: Get execution with node execution logs
 */

import { NextRequest, NextResponse } from "next/server";
import { getExecutionById, getNodeExecutions } from "@/lib/orchestrations/db";
import { getCurrentAdminSession } from "@/lib/admin/session";

function removeInternalSchemaIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeInternalSchemaIds);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "schemaId")
      .map(([key, nestedValue]) => [key, removeInternalSchemaIds(nestedValue)])
  );
}

function compactDatabaseExecutorResponse(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.rows) || typeof response.databaseType !== "string") {
    return null;
  }

  return {
    rows: response.rows,
    rowCount: response.rowCount,
    durationMs: response.durationMs,
    databaseName: response.databaseName,
    databaseType: response.databaseType,
    httpStatusCode: response.httpStatusCode,
  };
}

function compactApiCallOutput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const output = value as Record<string, unknown>;
  const apiResult = output.apiResult;
  if (!apiResult || typeof apiResult !== "object" || Array.isArray(apiResult)) {
    return value;
  }

  const result = apiResult as Record<string, unknown>;
  const parsedJson = compactDatabaseExecutorResponse(result.parsedJson);
  if (!parsedJson) {
    return value;
  }

  const attempts = typeof output.attempts === "number"
    ? output.attempts
    : (typeof result.attempts === "number" ? result.attempts : 1);

  return {
    attempts,
    apiResult: {
      attempts: typeof result.attempts === "number" ? result.attempts : attempts,
      parsedJson,
    },
  };
}

function compactNestedMonitoringValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compactNestedMonitoringValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const compactApiOutput = compactApiCallOutput(value);
  if (compactApiOutput !== value) {
    return compactApiOutput;
  }

  const internalKeys = new Set([
    "_system",
    "apiKeyId",
    "companyId",
    "company_id",
    "credentialId",
    "credential_id",
    "emailCredentialId",
    "executionId",
    "execution_id",
    "nodeId",
    "node_id",
    "nodeResponses",
    "notificationIds",
    "orchestrationId",
    "orchestration_id",
    "recipientUserIds",
    "schemaId",
    "schema_id",
    "senderCredentialId",
    "targetAppId",
    "target_app_id",
    "triggerId",
    "trigger_id",
    "userId",
    "user_id",
  ]);

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !internalKeys.has(key))
      .map(([key, nestedValue]) => [key, compactNestedMonitoringValue(nestedValue)])
  );
}

function compactTriggerNodeOutput(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const output = value as Record<string, unknown>;
  const trigger = output.trigger && typeof output.trigger === "object" && !Array.isArray(output.trigger)
    ? output.trigger as Record<string, unknown>
    : {};
  const triggerInput = trigger.input && typeof trigger.input === "object" && !Array.isArray(trigger.input)
    ? trigger.input as Record<string, unknown>
    : output;

  return {
    trigger: {
      input: {
        confidence: triggerInput.confidence,
        triggerType: triggerInput.triggerType,
        userMessage: triggerInput.userMessage,
        orchestrationName: triggerInput.orchestrationName,
      },
      startedAt: trigger.startedAt,
      startedBy: trigger.startedBy,
    },
  };
}

function sanitizeNodeExecutionForMonitoring<T extends {
  nodeType: string;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
}>(nodeExecution: T): T {
  if (nodeExecution.nodeType === "trigger") {
    return {
      ...nodeExecution,
      input: null,
      output: compactTriggerNodeOutput(nodeExecution.output),
    };
  }

  if (nodeExecution.nodeType === "database") {
    return {
      ...nodeExecution,
      input: removeInternalSchemaIds(nodeExecution.input) as Record<string, unknown> | null,
      output: removeInternalSchemaIds(nodeExecution.output) as Record<string, unknown> | null,
    };
  }

  if (nodeExecution.nodeType === "api_call") {
    return {
      ...nodeExecution,
      output: compactApiCallOutput(nodeExecution.output) as Record<string, unknown> | null,
    };
  }

  if (nodeExecution.nodeType === "notification") {
    return {
      ...nodeExecution,
      input: null,
      output: compactNestedMonitoringValue(nodeExecution.output) as Record<string, unknown> | null,
    };
  }

  if (nodeExecution.nodeType === "end") {
    return {
      ...nodeExecution,
      input: null,
      output: compactNestedMonitoringValue(nodeExecution.output) as Record<string, unknown> | null,
    };
  }

  return nodeExecution;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const execution = await getExecutionById(id);
    if (!execution) {
      return NextResponse.json({ message: "Execution not found" }, { status: 404 });
    }

    const nodeExecutions = (await getNodeExecutions(id)).map(sanitizeNodeExecutionForMonitoring);

    return NextResponse.json({ 
      execution,
      nodeExecutions
    });
  } catch (error) {
    console.error("Error fetching execution details:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to fetch execution details" },
      { status: 500 }
    );
  }
}
