// Core orchestration execution engine
// Handles node execution, flow control, and context management

import type {
  OrchestrationExecution,
  OrchestrationNode,
  OrchestrationConnection,
  NodeExecutionStatus,
  NodeConfig,
  WorkflowNodeConfig,
  DataCaptureNodeConfig,
  AIExtractionNodeConfig,
  ConditionNodeConfig,
  AIDecisionNodeConfig,
  HumanApprovalNodeConfig,
  NotificationNodeConfig,
  VariableNodeConfig,
  DataFormatterNodeConfig,
  ApiCallNodeConfig,
  DatabaseNodeConfig,
  EndNodeConfig,
  TriggerNodeConfig,
  OrchestrationTriggerType,
} from "@/shared/orchestrationTypes";

import { executeWorkflowNode } from "./nodes/workflow-node";
import { executeDataCaptureNode } from "./nodes/data-capture-node";
import { executeAIExtractionNode } from "./nodes/ai-extraction-node";
import { executeAIDecisionNode } from "./nodes/ai-decision-node";
import { executeConditionNode } from "./nodes/condition-node";
import { executeHumanApprovalNode, resumeAfterApproval } from "./nodes/human-approval-node";
import { executeNotificationNode } from "./nodes/notification-node";
import { executeVariableNode } from "./nodes/variable-node";
import { executeDataFormatterNode } from "./nodes/data-formatter-node";
import { executeApiCallNode } from "./nodes/api-call-node";
import { executeDatabaseNode } from "./nodes/database-node";
import { evaluateExpression, resolveVariablePath, setVariablePath } from "./expression-evaluator";
import { getLLMProvider } from "@/lib/llm/providers";
import { getPool } from "@/lib/db/pool";
import {
  updateExecution,
  createNodeExecution,
  updateNodeExecution,
  getApprovals,
  createClarificationRequest,
  resolveClarificationRequest,
  getOrchestrationById,
} from "./db";
import {
  isNodeCompatibleWithTrigger,
  getIncompatibilityReason,
  getAlternativeSuggestions,
} from "./node-compatibility";

export class OrchestrationEngine {
  private execution: OrchestrationExecution;
  private nodes: Map<string, OrchestrationNode>;
  private connections: OrchestrationConnection[];
  private context: Record<string, unknown>;

  constructor(
    execution: OrchestrationExecution,
    nodes: OrchestrationNode[],
    connections: OrchestrationConnection[]
  ) {
    this.execution = execution;
    this.nodes = new Map(nodes.map((node) => [node.id, node]));
    this.connections = connections;
    this.context = execution.context;
  }

  /**
   * Start or resume orchestration execution
   */
  async execute(): Promise<{
    success: boolean;
    status: "completed" | "paused" | "failed";
    error?: string;
    clarification?: {
      message: string;
      expiresAt: string;
      fieldDefinitions: Array<{
        key: string;
        type: string;
        description?: string;
      }>;
    };
  }> {
    try {
      // Find the starting node (trigger node or current node for resumption)
      const startNodeId = this.execution.currentNodeId || this.findTriggerNode();

      if (!startNodeId) {
        throw new Error("No starting node found");
      }

      // Execute from the starting node
      const result = await this.executeNode(startNodeId);

      if (result.status === "paused") {
        return {
          success: true,
          status: "paused",
          clarification: result.clarification,
        };
      }

      if (result.status === "failed") {
        return { success: false, status: "failed", error: result.error };
      }

      await this.updateExecutionStatus("completed");

      return { success: true, status: "completed" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.recordExecutionError(errorMessage);
      return { success: false, status: "failed", error: errorMessage };
    }
  }

  /**
   * Execute a single node and follow its connections
   */
  private async executeNode(
    nodeId: string,
    sourceHandle?: string
  ): Promise<{
    success: boolean;
    status: "completed" | "paused" | "failed";
    error?: string;
    clarification?: {
      message: string;
      expiresAt: string;
      fieldDefinitions: Array<{
        key: string;
        type: string;
        description?: string;
      }>;
    };
  }> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Validate node compatibility with trigger type (Phase 4: Node Compatibility Validation)
    const triggerType = this.getTriggerType();
    if (!isNodeCompatibleWithTrigger(node.nodeType, triggerType)) {
      const reason = getIncompatibilityReason(node.nodeType, triggerType!);
      const suggestions = getAlternativeSuggestions(node.nodeType, triggerType!);
      
      const errorMessage = [
        `❌ INCOMPATIBLE NODE: ${node.label || node.nodeType}`,
        ``,
        `Reason: ${reason}`,
        ``,
        suggestions.length > 0 ? `💡 Alternative Approaches:` : '',
        ...suggestions.map((s, i) => `   ${i + 1}. ${s}`),
      ].filter(Boolean).join('\n');

      console.error('\n' + '='.repeat(80));
      console.error(errorMessage);
      console.error('='.repeat(80) + '\n');

      await this.recordNodeExecution(nodeId, "failed", this.context, { error: errorMessage });
      throw new Error(errorMessage);
    }

    // Check if this is an end node
    if (node.nodeType === "end") {
      const endOutput = this.buildEndNodeOutput(node);
      Object.assign(this.context, endOutput);
      this.appendChatbotStatusEvent({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.nodeType,
        status: "completed",
        message: "Workflow completed successfully.",
      });
      await this.recordNodeExecution(nodeId, "completed", this.context, endOutput);
      return { success: true, status: "completed" };
    }

    // Record node execution start
    const nodeExecutionId = await this.recordNodeExecution(
      nodeId,
      "running",
      this.context,
      null
    );
    this.appendChatbotStatusEvent({
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: node.nodeType,
      status: "running",
      message: `Started ${this.getReadableNodeName(node.nodeType)} node.`,
    });

    try {
      // Execute the node based on its type
      const result = await this.executeNodeByType(node);

      if (result.paused) {
        // Human approval or async operation
        if (result.output) {
          Object.assign(this.context, result.output);
        }

        const triggerData = this.execution.triggerData as Record<string, unknown> | null;
        const conversationId = typeof triggerData?.conversationId === "string" ? triggerData.conversationId : null;
        const companyId = typeof triggerData?.companyId === "string" ? triggerData.companyId : null;
        const targetAppId = typeof triggerData?.targetAppId === "string" ? triggerData.targetAppId : null;
        if (result.clarification) {
          const orchestrationCompanyId = companyId || (await getOrchestrationById(this.execution.orchestrationId))?.companyId;
          if (!orchestrationCompanyId) {
            throw new Error("Unable to resolve company id for clarification request");
          }
          const outputVariable = (node.config as AIExtractionNodeConfig).outputVariable || "extracted";
          const partialOutput = result.output ? ((result.output[outputVariable] as Record<string, unknown>) || {}) : {};
          await createClarificationRequest({
            executionId: this.execution.id,
            nodeExecutionId,
            nodeId: node.id,
            conversationId,
            companyId: orchestrationCompanyId,
            targetAppId,
            outputVariable,
            partialOutput,
            missingFields: result.clarification.fieldDefinitions,
            prompt: result.clarification.message,
            expiresAt: result.clarification.expiresAt,
          });
        }

        await this.updateNodeExecution(
          nodeExecutionId,
          "paused",
          null,
          result.output ?? null
        );
        await this.updateExecutionStatus("paused", nodeId);
        this.appendChatbotStatusEvent({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.nodeType,
          status: "paused",
          message: result.clarification?.message || `${this.getReadableNodeName(node.nodeType)} is waiting for more input.`,
        });
        return {
          success: true,
          status: "paused",
          clarification: result.clarification,
        };
      }

      if (!result.success) {
        await this.updateNodeExecution(
          nodeExecutionId,
          "failed",
          null,
          result.output ?? null,
          result.error
        );
        this.appendChatbotStatusEvent({
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.nodeType,
          status: "failed",
          message: `${this.getReadableNodeName(node.nodeType)} failed${result.error ? `: ${result.error}` : "."}`,
        });
        return { success: false, status: "failed", error: result.error };
      }

      // Update context with node output
      if (result.output) {
        Object.assign(this.context, result.output);
      }

      // Record successful execution
      await this.updateNodeExecution(
        nodeExecutionId,
        "completed",
        this.context,
        result.output ?? null
      );

      // Find next nodes to execute
      const nextNodes = this.findNextNodes(nodeId, result.outputHandle);

      this.captureNodeResponse(node, result.output ?? null, "completed");

      const nextNodeLabel = nextNodes.length > 0
        ? this.nodes.get(nextNodes[0])?.label || this.getReadableNodeName(this.nodes.get(nextNodes[0])?.nodeType || "")
        : "End";
      this.appendChatbotStatusEvent({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.nodeType,
        status: "completed",
        message: nextNodes.length > 0
          ? `${this.getReadableNodeName(node.nodeType)} completed. Calling ${nextNodeLabel} next.`
          : `${this.getReadableNodeName(node.nodeType)} completed.`,
      });

      if (nextNodes.length === 0) {
        // No more nodes, orchestration complete
        return { success: true, status: "completed" };
      }

      // Execute next nodes (sequential execution for now)
      for (const nextNodeId of nextNodes) {
        const nextResult = await this.executeNode(nextNodeId);
        if (nextResult.status !== "completed") {
          return nextResult;
        }
      }

      return { success: true, status: "completed" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.updateNodeExecution(
        nodeExecutionId,
        "failed",
        null,
        null,
        errorMessage
      );
      this.appendChatbotStatusEvent({
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.nodeType,
        status: "failed",
        message: `${this.getReadableNodeName(node.nodeType)} failed: ${errorMessage}`,
      });
      return { success: false, status: "failed", error: errorMessage };
    }
  }

  /**
   * Execute node based on its type
   */
  private async executeNodeByType(node: OrchestrationNode): Promise<{
    success: boolean;
    output?: Record<string, unknown>;
    outputHandle?: string;
    paused?: boolean;
    clarification?: {
      message: string;
      expiresAt: string;
      fieldDefinitions: Array<{
        key: string;
        type: string;
        description?: string;
      }>;
    };
    error?: string;
  }> {
    const config = node.config as NodeConfig;

    switch (node.nodeType) {
      case "trigger":
        // Trigger node is the entry point
        // Provide trigger data in multiple formats for flexibility:
        // 1. Root level: {{workflowId}}
        // 2. trigger.input: {{trigger.input.workflowId}} (backward compatible)
        // 3. trigger metadata: {{trigger.timestamp}}, {{trigger.startedBy}}
        const triggerData = this.execution.triggerData || {};
        
        console.log("\n" + "▓".repeat(80));
        console.log("⚡ TRIGGER NODE OUTPUT");
        console.log("▓".repeat(80));
        console.log("Trigger data received:", JSON.stringify(triggerData, null, 2));
        console.log("Will be available as:");
        console.log("  - Root level: {{fieldName}}");
        console.log("  - Nested: {{trigger.input.fieldName}}");
        console.log("▓".repeat(80) + "\n");
        
        // Extract matched phrase and intent for workflow node routing
        const matchedPhrase = (triggerData as any).matchedPhrase || (triggerData as any).userMessage;
        const matchedIntent = (triggerData as any).intent || (triggerData as any).matchedIntent;
        
        return {
          success: true,
          output: {
            ...triggerData, // Spread to root for easy access
            matchedPhrase, // For workflow node phrase matching
            matchedIntent, // For workflow node intent matching
            trigger: {
              input: triggerData, // Also available under trigger.input
              timestamp: this.execution.startedAt,
              startedBy: this.execution.triggeredBy,
              startedAt: this.execution.startedAt,
              matchedPhrase, // Also available under trigger.matchedPhrase
              matchedIntent, // Also available under trigger.matchedIntent
            },
            // Pass user info for workflow execution
            _system: {
              triggeredBy: this.execution.triggeredBy,
              executionId: this.execution.id,
            },
          },
        };

      case "workflow":
        return await executeWorkflowNode(config as WorkflowNodeConfig, this.context);

      case "data_capture":
        return await executeDataCaptureNode(config as DataCaptureNodeConfig, this.context);

      case "ai_extraction":
        return await executeAIExtractionNode(config as AIExtractionNodeConfig, this.context);

      case "ai_decision":
        return await executeAIDecisionNode(config as AIDecisionNodeConfig, this.context);

      case "condition":
        return await executeConditionNode(config as ConditionNodeConfig, this.context);

      case "human_approval":
        return await executeHumanApprovalNode(
          config as HumanApprovalNodeConfig,
          this.context,
          this.execution.id,
          node.id
        );

      case "notification":
        return await executeNotificationNode(config as NotificationNodeConfig, this.context);

      case "variable":
        return await executeVariableNode(config as VariableNodeConfig, this.context);

      case "data_formatter":
        return await executeDataFormatterNode(config as DataFormatterNodeConfig, this.context);

      case "api_call":
        return await executeApiCallNode(config as ApiCallNodeConfig, this.context);

      case "database": {
        const orchestration = await getOrchestrationById(this.execution.orchestrationId);
        return await executeDatabaseNode(config as DatabaseNodeConfig, this.context, {
          companyId: orchestration?.companyId,
          targetAppId: orchestration?.targetAppId,
          executionId: this.execution.id,
          nodeId: node.id,
        });
      }

      default:
        throw new Error(`Unknown node type: ${node.nodeType}`);
    }
  }

  /**
   * Find the trigger node (starting point)
   */
  private findTriggerNode(): string | null {
    for (const [nodeId, node] of Array.from(this.nodes.entries())) {
      if (node.nodeType === "trigger") {
        return nodeId;
      }
    }
    return null;
  }

  /**
   * Get the trigger type from the trigger node
   */
  private getTriggerType(): OrchestrationTriggerType | undefined {
    for (const node of Array.from(this.nodes.values())) {
      if (node.nodeType === "trigger") {
        const triggerConfig = node.config as TriggerNodeConfig;
        return triggerConfig.triggerType;
      }
    }
    return undefined;
  }

  /**
   * Find next nodes based on connections and conditions
   */
  private findNextNodes(nodeId: string, outputHandle?: string): string[] {
    const connections = this.connections.filter(
      (conn) =>
        conn.sourceNodeId === nodeId &&
        (!outputHandle || conn.sourceHandle === outputHandle)
    );

    return connections
      .filter((conn) => this.evaluateConnectionCondition(conn))
      .map((conn) => conn.targetNodeId);
  }

  /**
   * Evaluate connection condition if present
   */
  private evaluateConnectionCondition(connection: OrchestrationConnection): boolean {
    if (!connection.condition) {
      return true;
    }

    try {
      return evaluateExpression(connection.condition, this.context);
    } catch {
      return false;
    }
  }

  /**
   * Record node execution (implementation calls DB)
   */
  private async recordNodeExecution(
    nodeId: string,
    status: NodeExecutionStatus,
    input: Record<string, unknown> | null,
    output: Record<string, unknown> | null
  ): Promise<string> {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node ${nodeId} not found`);

    const nodeExecution = await createNodeExecution({
      executionId: this.execution.id,
      nodeId: node.id,
      nodeType: node.nodeType,
      nodeLabel: node.label,
      status,
      input,
      output,
    });

    return nodeExecution.id;
  }

  /**
   * Update node execution status
   */
  private async updateNodeExecution(
    nodeExecutionId: string,
    status: NodeExecutionStatus,
    input: Record<string, unknown> | null,
    output: Record<string, unknown> | null,
    error?: string
  ): Promise<void> {
    await updateNodeExecution(nodeExecutionId, {
      status,
      output,
      errorMessage: error,
    });
  }

  /**
   * Update execution status
   */
  private async updateExecutionStatus(
    status: "running" | "paused" | "completed" | "failed" | "cancelled",
    currentNodeId?: string
  ): Promise<void> {
    await updateExecution(this.execution.id, {
      status,
      currentNodeId: currentNodeId || null,
      context: this.context,
    });
    this.execution.status = status;
    if (currentNodeId) {
      this.execution.currentNodeId = currentNodeId;
    }
  }

  /**
   * Record execution error
   */
  private async recordExecutionError(error: string): Promise<void> {
    await updateExecution(this.execution.id, {
      status: "failed",
      errorMessage: error,
      context: this.context,
    });
    this.execution.status = "failed";
    this.execution.errorMessage = error;
  }

  /**
   * Get current execution context
   */
  getContext(): Record<string, unknown> {
    return this.context;
  }

  /**
   * Update execution context
   */
  updateContext(updates: Record<string, unknown>): void {
    Object.assign(this.context, updates);
  }

  private getReadableNodeName(nodeType: string): string {
    const labels: Record<string, string> = {
      trigger: "Trigger",
      workflow: "Workflow",
      data_capture: "Data Capture",
      ai_extraction: "AI Extraction",
      ai_decision: "AI Decision",
      condition: "Condition",
      human_approval: "Human Approval",
      notification: "Notification",
      variable: "Variable",
      data_formatter: "Data Formatter",
      api_call: "API Call",
      database: "Database",
      end: "End",
    };
    return labels[nodeType] || nodeType;
  }

  private appendChatbotStatusEvent(event: {
    nodeId: string;
    nodeLabel: string;
    nodeType: string;
    status: "running" | "completed" | "paused" | "failed";
    message: string;
  }) {
    const bucket = this.context._chatbot as Record<string, unknown> | undefined;
    const statusUpdates = Array.isArray(bucket?.statusUpdates)
      ? (bucket?.statusUpdates as Array<Record<string, unknown>>)
      : [];

    statusUpdates.push({
      timestamp: new Date().toISOString(),
      ...event,
    });

    this.context._chatbot = {
      ...(bucket || {}),
      statusUpdates,
    };
  }

  private captureNodeResponse(
    node: OrchestrationNode,
    output: Record<string, unknown> | null,
    status: "completed" | "failed" | "paused"
  ) {
    const existing = this.context._nodeResponses as Record<string, unknown> | undefined;
    const byNodeId = existing && typeof existing === "object" ? { ...existing } : {};
    byNodeId[node.id] = {
      nodeId: node.id,
      nodeLabel: node.label,
      nodeType: node.nodeType,
      status,
      output,
      updatedAt: new Date().toISOString(),
    };
    this.context._nodeResponses = byNodeId;
  }

  private renderTemplate(template: string, context: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) => {
      const value = resolveVariablePath(String(rawPath || "").trim(), context);
      if (value === null || value === undefined) {
        return "";
      }
      if (typeof value === "string") {
        return value;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      return JSON.stringify(value);
    });
  }

  private buildEndNodeOutput(node: OrchestrationNode): Record<string, unknown> {
    const config = node.config as EndNodeConfig;
    const responseVariablePath = String(config.responseVariablePath || "finalResponse").trim() || "finalResponse";
    const includeNodeResponses = config.includeNodeResponses !== false;
    const outputVariables = Array.isArray(config.outputVariables)
      ? config.outputVariables.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const selectedOutputs: Record<string, unknown> = {};
    for (const variablePath of outputVariables) {
      selectedOutputs[variablePath] = resolveVariablePath(variablePath, this.context);
    }

    const finalResponse = {
      executionId: this.execution.id,
      orchestrationId: this.execution.orchestrationId,
      completedAt: new Date().toISOString(),
      selectedOutputs,
      nodeResponses: includeNodeResponses ? (this.context._nodeResponses || {}) : undefined,
    };

    const output: Record<string, unknown> = {};
    setVariablePath(responseVariablePath, finalResponse, output);

    const finalAnswer = config.displayMessage && String(config.message || "").trim()
      ? this.renderTemplate(String(config.message || ""), this.context)
      : "Workflow completed successfully.";
    const displayMode = config.displayMode || "text";
    const displayDataPath = String(config.displayDataPath || "").trim();
    const displayData = displayDataPath
      ? resolveVariablePath(displayDataPath, this.context)
      : undefined;
    const displayColumnPaths = Array.isArray(config.displayColumnPaths)
      ? config.displayColumnPaths.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const structuredDisplay = displayMode === "table"
      ? {
          type: "table" as const,
          dataPath: displayDataPath,
          data: Array.isArray(displayData)
            ? displayData
            : displayData && typeof displayData === "object"
              ? [displayData]
              : [],
          columns: displayColumnPaths,
        }
      : displayMode === "json"
        ? {
            type: "json" as const,
            dataPath: displayDataPath,
            data: displayData ?? null,
          }
        : undefined;

    output._chatbot = {
      ...((this.context._chatbot as Record<string, unknown> | undefined) || {}),
      finalAnswer,
      finalResponsePath: responseVariablePath,
      display: structuredDisplay,
    };

    this.captureNodeResponse(node, output, "completed");
    return output;
  }

  /**
   * Resume execution after approval
   * Called when an approval node has been responded to
   */
  async resumeAfterApproval(approvalId: string): Promise<{
    success: boolean;
    status: "completed" | "paused" | "failed";
    error?: string;
  }> {
    try {
      // Get the approval record
      const approvals = await getApprovals({
        executionId: this.execution.id,
      });
      const approval = approvals.find((a) => a.id === approvalId);

      if (!approval) {
        throw new Error(`Approval ${approvalId} not found`);
      }

      if (approval.status === "pending") {
        throw new Error("Approval is still pending");
      }

      // Get the approval response
      const approvalResponse = {
        status: approval.status,
        respondedAt: approval.respondedAt,
        respondedByEmail: approval.respondedByEmail,
        notes: approval.notes,
        responseData: approval.responseData,
      };

      // Process the approval response
      const result = await resumeAfterApproval(approvalResponse);

      if (!result.success) {
        throw new Error("Failed to process approval response");
      }

      // Update context with approval output
      if (result.output) {
        Object.assign(this.context, result.output);
      }

      // Find the current node (approval node)
      const currentNodeId = this.execution.currentNodeId;
      if (!currentNodeId) {
        throw new Error("No current node found for resumption");
      }

      // Find next nodes based on approval result (approved/rejected handle)
      const nextNodes = this.findNextNodes(currentNodeId, result.outputHandle);

      if (nextNodes.length === 0) {
        // No more nodes, mark as completed
        await this.updateExecutionStatus("completed");
        return { success: true, status: "completed" };
      }

      // Update execution to running
      await this.updateExecutionStatus("running");

      // Execute next nodes
      for (const nextNodeId of nextNodes) {
        const nextResult = await this.executeNode(nextNodeId);
        if (nextResult.status !== "completed") {
          return nextResult;
        }
      }

      // All done
      await this.updateExecutionStatus("completed");
      return { success: true, status: "completed" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.recordExecutionError(errorMessage);
      return { success: false, status: "failed", error: errorMessage };
    }
  }

  async resumeAfterClarification(input: {
    clarificationId: string;
    responseText: string;
  }): Promise<{
    success: boolean;
    status: "completed" | "paused" | "failed";
    error?: string;
    clarification?: {
      message: string;
      expiresAt: string;
      fieldDefinitions: Array<{
        key: string;
        type: string;
        description?: string;
      }>;
    };
  }> {
    try {
      const clarification = await getClarificationById(input.clarificationId);
      if (!clarification) {
        throw new Error(`Clarification ${input.clarificationId} not found`);
      }

      if (clarification.executionId !== this.execution.id) {
        throw new Error("Clarification does not belong to this execution");
      }

      if (clarification.status !== "active") {
        throw new Error(`Clarification is ${clarification.status}, not active`);
      }

      if (new Date(clarification.expiresAt).getTime() <= Date.now()) {
        await expireClarificationRequest(clarification.id);
        throw new Error("Clarification request expired");
      }

      const resolvedValues = await resolveClarificationValues(clarification, input.responseText);
      const unresolvedFields = clarification.missingFields.filter((field) => !hasMeaningfulValue(resolvedValues[field.key]));
      if (unresolvedFields.length > 0) {
        throw new Error(
          `Clarification response is incomplete. Missing: ${unresolvedFields.map((field) => field.key).join(", ")}`
        );
      }

      const resolvedData = {
        ...(clarification.partialOutput || {}),
        ...resolvedValues,
      };

      // Preserve the user's latest clarification separately from the original
      // workflow request so downstream nodes can use both intent and parameters.
      this.context.latestUserMessage = input.responseText.trim();
      this.context[clarification.outputVariable] = resolvedData;
      Object.assign(this.context, {
        [clarification.outputVariable]: resolvedData,
      });

      await resolveClarificationRequest(clarification.id, {
        responseText: input.responseText,
        responseData: resolvedData,
      });

      await this.updateExecutionStatus("running", clarification.nodeId);
      await this.updateNodeExecution(
        clarification.nodeExecutionId,
        "completed",
        null,
        {
          [clarification.outputVariable]: resolvedData,
        }
      );

      const clarificationNode = this.nodes.get(clarification.nodeId);
      if (clarificationNode?.nodeType === "database") {
        const chatbotContext = (
          this.context._chatbot && typeof this.context._chatbot === "object"
            ? this.context._chatbot
            : {}
        ) as Record<string, unknown>;
        const existingClarifications = Array.isArray(chatbotContext.databaseClarifications)
          ? chatbotContext.databaseClarifications.filter((value): value is string => typeof value === "string")
          : [];
        chatbotContext.latestUserMessage = input.responseText.trim();
        chatbotContext.databaseClarifications = [
          ...existingClarifications,
          input.responseText.trim(),
        ];
        this.context._chatbot = chatbotContext;

        // A Database node clarification resolves ambiguity about the pending
        // query; the node must run again against the augmented conversation.
        // Other clarification-capable nodes already produced their final output
        // and therefore continue to their downstream node as before.
        return await this.executeNode(clarification.nodeId);
      }

      const nextNodes = this.findNextNodes(clarification.nodeId);
      if (nextNodes.length === 0) {
        await this.updateExecutionStatus("completed");
        return { success: true, status: "completed" };
      }

      for (const nextNodeId of nextNodes) {
        const nextResult = await this.executeNode(nextNodeId);
        if (nextResult.status !== "completed") {
          return nextResult;
        }
      }

      await this.updateExecutionStatus("completed");
      return { success: true, status: "completed" };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await this.recordExecutionError(errorMessage);
      return { success: false, status: "failed", error: errorMessage };
    }
  }
}

function coerceClarificationValue(field: { key: string; type: string } | undefined, responseText: string) {
  const trimmed = responseText.trim();
  if (!field) {
    return trimmed;
  }

  if (field.type === "number") {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : trimmed;
  }

  if (field.type === "boolean") {
    return /^(true|yes|y|1)$/i.test(trimmed);
  }

  return trimmed;
}

async function resolveClarificationValues(
  clarification: {
    missingFields: Array<{ key: string; type: string; description?: string }>;
  },
  responseText: string
): Promise<Record<string, unknown>> {
  try {
    const provider = await getLLMProvider();
    const systemPrompt = [
      "You map a user's follow-up reply to a set of missing structured fields.",
      "Return only valid JSON with exactly the requested keys.",
      "Use null for any value you cannot confidently infer.",
    ].join(" ");
    const userPrompt = [
      "Missing fields:",
      clarification.missingFields
        .map((field) => `- ${field.key} (${field.type})${field.description ? `: ${field.description}` : ""}`)
        .join("\n"),
      "",
      "User reply:",
      responseText,
      "",
      "Return JSON only.",
    ].join("\n");

    const raw = await provider.generate_answer(systemPrompt, userPrompt, responseText);
    const parsed = parseJsonObject(raw);
    if (!parsed) {
      throw new Error("Clarification response could not be parsed as JSON");
    }

    const resolved: Record<string, unknown> = {};
    for (const field of clarification.missingFields) {
      const value = parsed[field.key];
      resolved[field.key] = value === undefined ? null : coerceClarificationValue(field, String(value ?? ""));
    }

    return resolved;
  } catch {
    const field = clarification.missingFields[0];
    return field ? { [field.key]: coerceClarificationValue(field, responseText) } : {};
  }
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = (raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
  if (!cleaned) {
    return null;
  }

  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  return true;
}

async function getClarificationById(clarificationId: string) {
  const result = await getPool().query<{
    id: string;
    execution_id: string;
    node_execution_id: string;
    node_id: string;
    conversation_id: string | null;
    company_id: string;
    target_app_id: string | null;
    output_variable: string;
    partial_output_json: Record<string, unknown>;
    missing_fields_json: Array<{ key: string; type: string; description?: string }>;
    prompt: string;
    expires_at: Date;
    status: "active" | "resolved" | "expired";
    created_at: Date;
    updated_at: Date;
    resolved_at: Date | null;
    response_text: string | null;
    response_json: Record<string, unknown> | null;
  }>(
    `SELECT * FROM orchestration_clarifications WHERE id = $1 LIMIT 1`,
    [clarificationId]
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    executionId: row.execution_id,
    nodeExecutionId: row.node_execution_id,
    nodeId: row.node_id,
    conversationId: row.conversation_id,
    companyId: row.company_id,
    targetAppId: row.target_app_id,
    outputVariable: row.output_variable,
    partialOutput: row.partial_output_json ?? {},
    missingFields: row.missing_fields_json ?? [],
    prompt: row.prompt,
    expiresAt: row.expires_at.toISOString(),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    resolvedAt: row.resolved_at?.toISOString() || null,
    responseText: row.response_text,
    responseData: row.response_json ?? null,
  };
}

async function expireClarificationRequest(clarificationId: string) {
  await getPool().query(
    `UPDATE orchestration_clarifications SET status = 'expired', updated_at = now() WHERE id = $1`,
    [clarificationId]
  );
}
