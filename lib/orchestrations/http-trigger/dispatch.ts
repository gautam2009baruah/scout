import type { HttpApiTriggerConfig } from "@/shared/orchestrationTypes";
import { createExecution, getConnections, getNodes } from "@/lib/orchestrations/db";
import { OrchestrationEngine } from "@/lib/orchestrations/engine";
import { updateTriggerLastTriggered } from "@/lib/orchestrations/triggers";
import { writeHttpTriggerAuditLog } from "./audit";

export async function dispatchHttpTrigger(input: {
  triggerId: string;
  orchestrationId: string;
  orchestrationVersion: number;
  config: HttpApiTriggerConfig;
  correlationId: string;
  authType: string;
  principal: string | null;
  requestContext: {
    url: string;
    method: string;
    headers: Record<string, string>;
    query: Record<string, string | string[]>;
    pathParameters: Record<string, string>;
    body: unknown;
    bodyRaw: string;
    contentType: string | null;
    payloadSize: number;
    clientIp: string | null;
  };
}) {
  const execution = await createExecution({
    orchestrationId: input.orchestrationId,
    orchestrationVersion: input.orchestrationVersion,
    context: {
      trigger: {
        type: "http_api",
        triggerId: input.triggerId,
        startedBy: input.principal,
        startedAt: new Date().toISOString(),
        input: {
          request: {
            method: input.requestContext.method,
            headers: input.requestContext.headers,
            query: input.requestContext.query,
            pathParameters: input.requestContext.pathParameters,
            body: input.requestContext.body,
            bodyRaw: input.requestContext.bodyRaw,
            contentType: input.requestContext.contentType,
            payloadSize: input.requestContext.payloadSize,
            url: input.requestContext.url,
          },
          auth: {
            type: input.authType,
            principal: input.principal,
          },
          caller: {
            ip: input.requestContext.clientIp,
          },
          correlationId: input.correlationId,
        },
        metadata: {
          endpoint: `/apitrigger/${input.config.shortName}/`,
          authType: input.authType,
        },
      },
      httpRequest: {
        method: input.requestContext.method,
        headers: input.requestContext.headers,
        query: input.requestContext.query,
        pathParameters: input.requestContext.pathParameters,
        body: input.requestContext.body,
        bodyRaw: input.requestContext.bodyRaw,
        contentType: input.requestContext.contentType,
        payloadSize: input.requestContext.payloadSize,
        correlationId: input.correlationId,
        callerIdentity: input.principal,
        callerIp: input.requestContext.clientIp,
      },
    },
    triggerData: {
      request: {
        method: input.requestContext.method,
        headers: input.requestContext.headers,
        query: input.requestContext.query,
        pathParameters: input.requestContext.pathParameters,
        body: input.requestContext.body,
        bodyRaw: input.requestContext.bodyRaw,
        contentType: input.requestContext.contentType,
        payloadSize: input.requestContext.payloadSize,
        correlationId: input.correlationId,
        callerIdentity: input.principal,
        callerIp: input.requestContext.clientIp,
      },
      auth: {
        type: input.authType,
        principal: input.principal,
      },
    },
    triggeredBy: input.principal || "http-api-trigger",
  });

  const nodes = await getNodes(input.orchestrationId);
  const connections = await getConnections(input.orchestrationId);

  void executeInBackground({
    triggerId: input.triggerId,
    orchestrationId: input.orchestrationId,
    execution,
    nodes,
    connections,
    correlationId: input.correlationId,
    principal: input.principal,
  });

  return execution;
}

async function executeInBackground(input: {
  triggerId: string;
  orchestrationId: string;
  execution: Awaited<ReturnType<typeof createExecution>>;
  nodes: Awaited<ReturnType<typeof getNodes>>;
  connections: Awaited<ReturnType<typeof getConnections>>;
  correlationId: string;
  principal: string | null;
}) {
  try {
    const engine = new OrchestrationEngine(input.execution, input.nodes, input.connections);
    const result = await engine.execute();

    if (!result.success) {
      await writeHttpTriggerAuditLog({
        triggerId: input.triggerId,
        orchestrationId: input.orchestrationId,
        executionId: input.execution.id,
        status: "failed",
        payload: { correlationId: input.correlationId },
        errorMessage: result.error,
        triggeredBy: input.principal || undefined,
      });

      await updateTriggerLastTriggered(input.triggerId, result.error);
      return;
    }

    await updateTriggerLastTriggered(input.triggerId);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await writeHttpTriggerAuditLog({
      triggerId: input.triggerId,
      orchestrationId: input.orchestrationId,
      executionId: input.execution.id,
      status: "failed",
      payload: { correlationId: input.correlationId },
      errorMessage,
      triggeredBy: input.principal || undefined,
    });

    await updateTriggerLastTriggered(input.triggerId, errorMessage);
  }
}
