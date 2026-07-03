// Core orchestration execution engine
// Handles node execution, flow control, and context management

import type {
  OrchestrationExecution,
  OrchestrationNode,
  OrchestrationConnection,
  NodeExecutionStatus,
  NodeConfig,
  WorkflowNodeConfig,
  AIExtractionNodeConfig,
  ConditionNodeConfig,
  AIDecisionNodeConfig,
  HumanApprovalNodeConfig,
  NotificationNodeConfig,
  VariableNodeConfig,
} from "@/shared/orchestrationTypes";

import { executeWorkflowNode } from "./nodes/workflow-node";
import { executeAIExtractionNode } from "./nodes/ai-extraction-node";
import { executeAIDecisionNode } from "./nodes/ai-decision-node";
import { executeConditionNode } from "./nodes/condition-node";
import { executeHumanApprovalNode, resumeAfterApproval } from "./nodes/human-approval-node";
import { executeNotificationNode } from "./nodes/notification-node";
import { executeVariableNode } from "./nodes/variable-node";
import { evaluateExpression } from "./expression-evaluator";
import {
  updateExecution,
  createNodeExecution,
  updateNodeExecution,
  getApprovals,
} from "./db";

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
        return { success: true, status: "paused" };
      }

      if (result.status === "failed") {
        return { success: false, status: "failed", error: result.error };
      }

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
  }> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // Check if this is an end node
    if (node.nodeType === "end") {
      await this.recordNodeExecution(nodeId, "completed", {}, {});
      return { success: true, status: "completed" };
    }

    // Record node execution start
    const nodeExecutionId = await this.recordNodeExecution(
      nodeId,
      "running",
      this.context,
      null
    );

    try {
      // Execute the node based on its type
      const result = await this.executeNodeByType(node);

      if (result.paused) {
        // Human approval or async operation
        await this.updateNodeExecution(nodeExecutionId, "running", null, null);
        await this.updateExecutionStatus("paused", nodeId);
        return { success: true, status: "paused" };
      }

      if (!result.success) {
        await this.updateNodeExecution(
          nodeExecutionId,
          "failed",
          null,
          result.output ?? null,
          result.error
        );
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
    error?: string;
  }> {
    const config = node.config as NodeConfig;

    switch (node.nodeType) {
      case "trigger":
        // Trigger node is the entry point - just pass through the trigger data
        return {
          success: true,
          output: {
            trigger: {
              input: this.execution.triggerData || {},
              timestamp: this.execution.startedAt,
            },
          },
        };

      case "workflow":
        return await executeWorkflowNode(config as WorkflowNodeConfig, this.context);

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
}
