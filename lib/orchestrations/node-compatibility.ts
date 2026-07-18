/**
 * Node Compatibility Validation
 * Determines which nodes are compatible with different trigger types
 */

import type { OrchestrationTriggerType, NodeType } from "@/shared/orchestrationTypes";

/**
 * Node compatibility rules:
 * - Automated triggers (schedule, email) cannot use interactive nodes
 * - Interactive triggers (manual, chatbot) can use all nodes
 */

// Nodes that require human interaction
const INTERACTIVE_NODES: NodeType[] = [
  "data_capture",   // Requires user to fill in data on a page
  "human_approval", // Requires human to approve/reject
  "workflow",       // Requires human to interact with guided workflow
];

// Trigger types that are automated (no human in the loop)
const AUTOMATED_TRIGGERS: OrchestrationTriggerType[] = [
  "schedule",
  "email",
  "http_api",
];

// Trigger types that are interactive (human-initiated)
const INTERACTIVE_TRIGGERS: OrchestrationTriggerType[] = [
  "manual",
  "chatbot",
];

/**
 * Check if a node type is compatible with a trigger type
 */
export function isNodeCompatibleWithTrigger(
  nodeType: NodeType,
  triggerType: OrchestrationTriggerType | undefined
): boolean {
  // If no trigger type specified yet, allow all nodes
  if (!triggerType) {
    return true;
  }

  // Trigger and end nodes are always compatible
  if (nodeType === "trigger" || nodeType === "end") {
    return true;
  }

  // Interactive nodes are only compatible with interactive triggers
  if (INTERACTIVE_NODES.includes(nodeType)) {
    return INTERACTIVE_TRIGGERS.includes(triggerType);
  }

  // All other nodes are always compatible
  return true;
}

/**
 * Get incompatibility reason for a node-trigger combination
 */
export function getIncompatibilityReason(
  nodeType: NodeType,
  triggerType: OrchestrationTriggerType
): string | null {
  if (isNodeCompatibleWithTrigger(nodeType, triggerType)) {
    return null;
  }

  const nodeLabels: Record<NodeType, string> = {
    trigger: "Trigger",
    workflow: "Workflow",
    data_capture: "Data Capture",
    ai_extraction: "AI Extraction",
    ai_decision: "AI Decision",
    condition: "Condition",
    human_approval: "Human Approval",
    notification: "Notification",
    variable: "Variable",
    api_call: "API Call",
    database: "Database",
    end: "End",
  };

  const triggerLabels: Record<OrchestrationTriggerType, string> = {
    manual: "Manual",
    chatbot: "Chatbot",
    schedule: "Schedule",
    email: "Email",
    http_api: "HTTP/API",
  };

  const nodeLabel = nodeLabels[nodeType];
  const triggerLabel = triggerLabels[triggerType];

  if (nodeType === "data_capture") {
    return `${nodeLabel} requires human interaction to capture data from a page. ${triggerLabel} triggers run automatically without a user present.`;
  }

  if (nodeType === "human_approval") {
    return `${nodeLabel} requires a human to approve or reject. ${triggerLabel} triggers run automatically without user interaction.`;
  }

  if (nodeType === "workflow") {
    return `${nodeLabel} requires a user to interact with guided steps. ${triggerLabel} triggers run automatically in the background.`;
  }

  return `${nodeLabel} is not compatible with ${triggerLabel} triggers.`;
}

/**
 * Get alternative suggestions for incompatible nodes
 */
export function getAlternativeSuggestions(
  nodeType: NodeType,
  triggerType: OrchestrationTriggerType
): string[] {
  if (isNodeCompatibleWithTrigger(nodeType, triggerType)) {
    return [];
  }

  const suggestions: string[] = [];

  if (nodeType === "data_capture") {
    suggestions.push("Use AI Extraction to extract data from documents or structured text");
    suggestions.push("Use Variable nodes to set values programmatically");
    suggestions.push("Pass data through manual inputs or chatbot-collected variables");
  }

  if (nodeType === "human_approval") {
    suggestions.push("Use AI Decision to make automated decisions based on criteria");
    suggestions.push("Use Condition nodes to implement rule-based logic");
    suggestions.push("Send a Notification and use Manual trigger for approval workflows");
  }

  if (nodeType === "workflow") {
    suggestions.push("Break down workflow steps into individual automation nodes");
    suggestions.push("Use AI Extraction for data extraction tasks");
    suggestions.push("Use API calls or notifications to trigger manual workflows separately");
  }

  return suggestions;
}

/**
 * Validate entire orchestration for node compatibility
 * Returns list of incompatible nodes with details
 */
export interface IncompatibleNode {
  nodeId: string;
  nodeType: NodeType;
  nodeLabel: string;
  reason: string;
  suggestions: string[];
}

export function validateOrchestrationCompatibility(
  nodes: Array<{ id: string; nodeType: NodeType; label: string }>,
  triggerType: OrchestrationTriggerType | undefined
): IncompatibleNode[] {
  if (!triggerType) {
    return [];
  }

  const incompatibleNodes: IncompatibleNode[] = [];

  for (const node of nodes) {
    if (!isNodeCompatibleWithTrigger(node.nodeType, triggerType)) {
      const reason = getIncompatibilityReason(node.nodeType, triggerType);
      const suggestions = getAlternativeSuggestions(node.nodeType, triggerType);

      incompatibleNodes.push({
        nodeId: node.id,
        nodeType: node.nodeType,
        nodeLabel: node.label,
        reason: reason || "Node is not compatible with this trigger type",
        suggestions,
      });
    }
  }

  return incompatibleNodes;
}
