/**
 * Node Properties Panel
 * Renders appropriate UI controls for each node type configuration
 */

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Trash2, Plus, Minus, Save, ChevronDown, ChevronRight } from "lucide-react";
import type { Node, Edge } from "reactflow";
import type { NodeType } from "@/shared/orchestrationTypes";
import { TRIGGER_TYPES, TRIGGER_TYPE_LABELS, UPCOMING_TRIGGER_TYPES } from "@/shared/orchestrationTypes";
import { createPortal } from "react-dom";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import { ApiCallConfig } from "./api-call-config";
import { DatabaseNodeConfigPanel as DatabaseConfig } from "./database-node-config";
import {
  convertTimeInTimeZoneToUtcTime,
  convertUtcTimeToTimeZoneDisplay,
  detectDefaultCuratedTimeZone,
  formatUtcIsoForTimeZoneInput,
  getCuratedTimeZoneOptions,
  parseTimeZoneInputToUtcIso,
} from "@/lib/orchestrations/timezone-utils";

// Declare global showScoutNotification function
declare global {
  interface Window {
    showScoutNotification?: (options: { message: string; type: 'info' | 'warning' | 'error' | 'success'; duration?: number }) => void;
  }
}

const NODE_CONFIGS = [
  { type: "trigger", label: "Trigger", icon: "⚡" },
  { type: "workflow", label: "Workflow", icon: "🔄" },
  { type: "data_capture", label: "Data Capture", icon: "📋" },
  { type: "ai_extraction", label: "AI Extraction", icon: "🤖" },
  { type: "ai_task", label: "AI Task", icon: "🧠" },
  { type: "knowledge_search", label: "Knowledge Search", icon: "🔍" },
  { type: "condition", label: "Condition", icon: "❓" },
  { type: "switch", label: "Switch / Router", icon: "🔀" },
  { type: "human_approval", label: "Human Approval", icon: "✋" },
  { type: "notification", label: "Notification", icon: "📧" },
  { type: "api_call", label: "API Call", icon: "🌐" },
  { type: "database", label: "Database", icon: "🗄️" },
  { type: "variable", label: "Variable", icon: "📈" },
  { type: "data_formatter", label: "Data Formatter", icon: "{}" },
  { type: "file_parser", label: "File Parser", icon: "📄" },
  { type: "for_each", label: "For Each", icon: "🔁" },
  { type: "ai_planner", label: "AI Planner", icon: "🧭" },
  { type: "end", label: "End", icon: "🏁" },
];

interface NodePropertiesPanelProps {
  node: Node;
  nodes?: Node[]; // All nodes in the flow for context-aware suggestions
  edges?: Edge[]; // All edges for checking node connections
  orchestrationId?: string; // Orchestration ID for saving to database
  companyId?: string; // Company ID for filtering email credentials
  targetAppId?: string | null; // Target App ID for filtering email credentials
  onClose: () => void;
  onUpdate: (updates: Partial<Node>) => void;
  onDelete: () => void;
  onDatabaseSave?: () => void; // Called after successful database save
}

export function NodePropertiesPanel({ node, nodes = [], edges = [], orchestrationId, companyId, targetAppId, onClose, onUpdate, onDelete, onDatabaseSave }: NodePropertiesPanelProps) {
  const nodeType = node.data.nodeType as NodeType;
  const defaultNodeLabel = NODE_CONFIGS.find((item) => item.type === nodeType)?.label || "";
  const editableNodeLabel = node.data.label === defaultNodeLabel ? "" : (node.data.label || "");
  
  // Local state for editing (not saved until Save button clicked)
  const [localLabel, setLocalLabel] = useState(editableNodeLabel);
  const [localDisplayDescription, setLocalDisplayDescription] = useState(node.data.displayDescription || "");
  const [localConfig, setLocalConfig] = useState(node.data.config || {});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  
  // Reset local state when node changes (different node selected)
  useEffect(() => {
    const nextNodeType = node.data.nodeType as NodeType;
    const nextDefaultLabel = NODE_CONFIGS.find((item) => item.type === nextNodeType)?.label || "";
    setLocalLabel(node.data.label === nextDefaultLabel ? "" : (node.data.label || ""));
    setLocalDisplayDescription(node.data.displayDescription || "");
    setLocalConfig(node.data.config || {});
    setValidationError(null);
  }, [node]);

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    return (
      localLabel !== node.data.label ||
      localDisplayDescription !== (node.data.displayDescription || "") ||
      JSON.stringify(localConfig) !== JSON.stringify(node.data.config || {})
    );
  };

  // Update local config (not saved until Save clicked). Uses the functional
  // updater form so multiple effects/handlers calling this within the same
  // render cycle (e.g. several default-seeding effects firing on mount)
  // compose instead of each overwriting the others based on a stale snapshot.
  const updateLocalConfig = (updates: Record<string, any>) => {
    setLocalConfig((prev: Record<string, any>) => ({ ...prev, ...updates }));
    setValidationError(null); // Clear validation error when user makes changes
  };

  // The orchestration's trigger type (from the trigger node). Some node options
  // (e.g. the End node's "Display message") only apply to interactive triggers.
  const orchestrationTriggerType: string | null = (() => {
    const triggerNode = nodes.find((n: any) => n.data?.nodeType === "trigger");
    return triggerNode?.data?.config?.triggerType || null;
  })();
  const supportsEndMessage =
    orchestrationTriggerType === "manual" || orchestrationTriggerType === "chatbot";

  // Validate fields before saving
  const validateFields = (): { valid: boolean; error: string | null } => {
    // Check node label is not empty
    if (!localLabel.trim()) {
      return { valid: false, error: "Node label is required" };
    }

    // Node-specific validations
    if (nodeType === "end" && supportsEndMessage && localConfig.displayMessage && !localConfig.message?.trim()) {
      return { valid: false, error: "Message is required when 'Display message' is checked" };
    }

    if (nodeType === "workflow" && !String(localConfig.workflowId || "").trim()) {
      return { valid: false, error: "Workflow selection is required" };
    }

    if (nodeType === "trigger") {
      if (!String(localConfig.triggerType || "").trim()) {
        return { valid: false, error: "Trigger type is required" };
      }
      if (localConfig.triggerType === "email" && !String(localConfig.emailCredentialId || "").trim()) {
        return { valid: false, error: "Email inbox is required" };
      }
      if (localConfig.triggerType === "manual") {
        const inputFields = Array.isArray(localConfig.inputFields) ? localConfig.inputFields : [];
        for (let index = 0; index < inputFields.length; index += 1) {
          if (!String(inputFields[index]?.name || "").trim()) {
            return { valid: false, error: `Input field ${index + 1}: Field name is required` };
          }
          if (!String(inputFields[index]?.label || "").trim()) {
            return { valid: false, error: `Input field ${index + 1}: Label is required` };
          }
        }
      }
    }

    if (nodeType === "data_capture" && !String(localConfig.outputVariable || "").trim()) {
      return { valid: false, error: "Data Capture output variable name is required" };
    }

    if (nodeType === "switch") {
      const routes = Array.isArray(localConfig.routes) ? localConfig.routes : [];
      if (!String(localConfig.variable || "").trim()) {
        return { valid: false, error: "Switch variable is required" };
      }
      if (routes.length === 0) {
        return { valid: false, error: "At least one switch route is required" };
      }
      const routeNames = new Set<string>();
      for (let index = 0; index < routes.length; index += 1) {
        const route = routes[index];
        const name = String(route?.name || "").trim();
        if (!name) {
          return { valid: false, error: `Route ${index + 1}: Name is required` };
        }
        if (routeNames.has(name.toLowerCase())) {
          return { valid: false, error: `Route names must be unique: "${name}"` };
        }
        routeNames.add(name.toLowerCase());
        if (!String(route?.operator || "").trim()) {
          return { valid: false, error: `Route ${index + 1}: Operator is required` };
        }
        if (!["exists", "not_exists", "empty", "not_empty"].includes(route.operator) && !String(route?.value ?? "").trim()) {
          return { valid: false, error: `Route ${index + 1}: Comparison value is required` };
        }
      }
    }

    if (nodeType === "ai_extraction") {
      if (!String(localConfig.input || "").trim()) {
        return { valid: false, error: "AI Extraction input data is required" };
      }
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "AI Extraction output variable is required" };
      }
      if (localConfig.extractionMode !== "instruction") {
        const fields = Array.isArray(localConfig.fields) ? localConfig.fields : [];
        if (fields.length === 0 || fields.every((field: any) => !String(field?.key || "").trim())) {
          return { valid: false, error: "AI Extraction requires at least one field to extract" };
        }
      }
    }

    if (nodeType === "human_approval") {
      if (!String(localConfig.title || "").trim()) {
        return { valid: false, error: "Approval title is required" };
      }
      if (!String(localConfig.approverEmail || "").trim()) {
        return { valid: false, error: "Approver email is required" };
      }
    }

    if (nodeType === "variable") {
      const variables = Array.isArray(localConfig.variables) ? localConfig.variables : [];
      if (variables.length === 0) {
        return { valid: false, error: "At least one variable is required" };
      }
      for (let index = 0; index < variables.length; index += 1) {
        if (!String(variables[index]?.name || "").trim()) {
          return { valid: false, error: `Variable ${index + 1}: Name is required` };
        }
        if (!String(variables[index]?.value || "").trim()) {
          return { valid: false, error: `Variable ${index + 1}: Value is required` };
        }
      }
    }

    // Condition node validations
    if (nodeType === "condition") {
      const conditions = localConfig.conditions || [];
      
      if (conditions.length === 0) {
        return { valid: false, error: "At least one condition is required" };
      }

      for (let i = 0; i < conditions.length; i++) {
        const condition = conditions[i];
        
        if (!condition.variable || !condition.variable.trim()) {
          return { valid: false, error: `Condition ${i + 1}: Variable is required` };
        }

        // Check if value is required for this operator
        const noValueOperators = ["exists", "not_exists", "empty", "not_empty"];
        if (!noValueOperators.includes(condition.operator)) {
          if (!condition.value || !condition.value.trim()) {
            return { valid: false, error: `Condition ${i + 1}: Value is required for ${condition.operator} operator` };
          }
        }
      }
    }

    if (nodeType === "trigger" && localConfig.triggerType === "http_api") {
      const shortName = String(localConfig.shortName || "").trim();
      if (!shortName) {
        return { valid: false, error: "HTTP/API short name is required" };
      }

      if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(shortName)) {
        return {
          valid: false,
          error: "HTTP/API short name must be URL-safe (lowercase letters, numbers, hyphen)",
        };
      }

    }

    if (nodeType === "notification") {
      const channels = localConfig.channels || {};
      const enabledChannels = ["email", "internal", "teams", "slack", "sms", "whatsapp"].filter(
        (channel) => channels?.[channel]?.enabled === true
      );

      if (enabledChannels.length === 0) {
        return { valid: false, error: "Enable at least one notification channel" };
      }

      if (channels.email?.enabled) {
        if (!String(channels.email.senderCredentialId || "").trim()) {
          return { valid: false, error: "Email: Sender provider is required" };
        }
        if (!String(channels.email.to || "").trim()) {
          return { valid: false, error: "Email: To recipients are required" };
        }
        if (!String(channels.email.subject || "").trim()) {
          return { valid: false, error: "Email: Subject is required" };
        }
        if (!String(channels.email.body || "").trim()) {
          return { valid: false, error: "Email: Message body is required" };
        }
      }

      if (channels.internal?.enabled) {
        const hasRecipients =
          String(channels.internal.users || "").trim() ||
          String(channels.internal.roles || "").trim() ||
          String(channels.internal.teams || "").trim() ||
          String(channels.internal.groups || "").trim();

        if (!hasRecipients) {
          return { valid: false, error: "Internal Notification: At least one recipient target is required" };
        }
        if (!String(channels.internal.title || "").trim()) {
          return { valid: false, error: "Internal Notification: Title is required" };
        }
        if (!String(channels.internal.message || "").trim()) {
          return { valid: false, error: "Internal Notification: Message is required" };
        }
      }

      if (channels.teams?.enabled) {
        if (!String(channels.teams.message || "").trim()) {
          return { valid: false, error: "Microsoft Teams: Message is required" };
        }
        if (!String(channels.teams.webhookUrl || channels.teams.connection || "").trim()) {
          return { valid: false, error: "Microsoft Teams: Webhook URL or connection is required" };
        }
      }

      if (channels.slack?.enabled) {
        if (!String(channels.slack.message || "").trim()) {
          return { valid: false, error: "Slack: Message is required" };
        }
        if (!String(channels.slack.webhookUrl || channels.slack.connection || "").trim()) {
          return { valid: false, error: "Slack: Webhook URL or connection is required" };
        }
      }

      if (channels.sms?.enabled) {
        if (!String(channels.sms.recipients || "").trim()) {
          return { valid: false, error: "SMS: Recipient phone numbers are required" };
        }
        if (!String(channels.sms.message || "").trim()) {
          return { valid: false, error: "SMS: Message is required" };
        }
      }

      if (channels.whatsapp?.enabled) {
        if (!String(channels.whatsapp.recipients || "").trim()) {
          return { valid: false, error: "WhatsApp: Recipient phone numbers are required" };
        }
        if ((channels.whatsapp.messageType || "session_message") === "approved_template") {
          if (!String(channels.whatsapp.templateName || "").trim()) {
            return { valid: false, error: "WhatsApp: Template name is required for approved template mode" };
          }
        } else if (!String(channels.whatsapp.body || "").trim()) {
          return { valid: false, error: "WhatsApp: Message body is required for session message mode" };
        }
      }
    }

    if (nodeType === "api_call") {
      const apiUrl = String(localConfig.apiUrl || "").trim();
      const outputVariableName = String(localConfig.outputVariableName || "").trim();

      if (!apiUrl) {
        return { valid: false, error: "API URL is required" };
      }

      if (!/^https?:\/\//i.test(apiUrl)) {
        return { valid: false, error: "API URL must start with http:// or https://" };
      }

      if (!outputVariableName) {
        return { valid: false, error: "Output variable name is required" };
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(outputVariableName)) {
        return { valid: false, error: "Output variable name must be a valid identifier" };
      }

      const authType = localConfig.auth?.type;
      if (authType === "api_key") {
        if (!String(localConfig.auth?.apiKey?.name || "").trim()) {
          return { valid: false, error: "API key authentication requires key name" };
        }
        if (!String(localConfig.auth?.apiKey?.value || "").trim()) {
          return { valid: false, error: "API key authentication requires key value" };
        }
      }

      if (authType === "bearer" && !String(localConfig.auth?.bearerToken || "").trim()) {
        return { valid: false, error: "Bearer authentication requires token" };
      }

      if (authType === "basic" && !String(localConfig.auth?.basic?.username || "").trim()) {
        return { valid: false, error: "Basic authentication requires username" };
      }

      if (authType === "oauth2") {
        const hasAccessToken = String(localConfig.auth?.oauth2?.accessToken || "").trim();
        const hasTokenFlow =
          String(localConfig.auth?.oauth2?.tokenUrl || "").trim() &&
          String(localConfig.auth?.oauth2?.clientId || "").trim() &&
          String(localConfig.auth?.oauth2?.clientSecret || "").trim();

        if (!hasAccessToken && !hasTokenFlow) {
          return {
            valid: false,
            error: "OAuth2 requires either access token or token URL + client credentials",
          };
        }
      }

      if (localConfig.auth?.mtls?.enabled) {
        if (!String(localConfig.auth?.mtls?.certPath || "").trim()) {
          return { valid: false, error: "mTLS requires certificate path" };
        }
        if (!String(localConfig.auth?.mtls?.keyPath || "").trim()) {
          return { valid: false, error: "mTLS requires key path" };
        }
      }

      if (
        localConfig.bodyFormat === "binary" &&
        !String(localConfig.binaryBodyBase64 || localConfig.requestBodyTemplate || "").trim()
      ) {
        return { valid: false, error: "Binary body format requires base64 payload" };
      }
    }

    if (nodeType === "data_formatter") {
      if (!String(localConfig.inputVariablePath || "").trim()) {
        return { valid: false, error: "Data Formatter input variable path is required" };
      }
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "Data Formatter output variable is required" };
      }
      if (
        localConfig.format === "custom_template"
        && !String(localConfig.customTemplate || "").trim()
      ) {
        return { valid: false, error: "Custom template is required for custom-template format" };
      }
    }

    if (nodeType === "file_parser") {
      if (!String(localConfig.sourceVariablePath || "").trim()) {
        return { valid: false, error: "File Parser source variable path is required" };
      }
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "File Parser output variable is required" };
      }
    }

    if (nodeType === "for_each") {
      if (!String(localConfig.sourceVariablePath || "").trim()) {
        return { valid: false, error: "For Each source variable path is required" };
      }
      if (!String(localConfig.itemVariableName || "").trim()) {
        return { valid: false, error: "For Each item variable name is required" };
      }
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "For Each output variable is required" };
      }
      if (!String(localConfig.bodyNodeType || "").trim()) {
        return { valid: false, error: "For Each requires an action to run per item" };
      }
    }

    if (nodeType === "ai_task") {
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "AI Task output variable is required" };
      }
      const instructionMode = localConfig.instructionMode || "static";
      if ((instructionMode === "static" || instructionMode === "hybrid") && !String(localConfig.instruction || "").trim()) {
        return { valid: false, error: "AI Task instruction is required for static or hybrid mode" };
      }
      if (localConfig.outputFormat === "json" && (!Array.isArray(localConfig.outputFields) || localConfig.outputFields.length === 0 || localConfig.outputFields.every((f: any) => !String(f?.key || "").trim()))) {
        return { valid: false, error: "AI Task JSON output requires at least one output field" };
      }
    }

    if (nodeType === "knowledge_search") {
      if (!String(localConfig.query || "").trim()) {
        return { valid: false, error: "Knowledge Search query is required" };
      }
      if (!String(localConfig.outputVariable || "").trim()) {
        return { valid: false, error: "Knowledge Search output variable is required" };
      }
    }

    if (nodeType === "database") {
      const schemaId = String(localConfig.schemaId || "").trim();
      const outputVariable = String(localConfig.outputVariable || "").trim();

      if (!schemaId) {
        return { valid: false, error: "Database schema selection is required" };
      }

      if (!outputVariable) {
        return { valid: false, error: "Output variable is required" };
      }

      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(outputVariable)) {
        return { valid: false, error: "Output variable must be a valid path (letters, numbers, underscore, dot)" };
      }

      const maxRows = Number(localConfig.maxRows ?? 25);
      if (!Number.isFinite(maxRows) || maxRows < 1 || maxRows > 500) {
        return { valid: false, error: "Max rows must be between 1 and 500" };
      }
    }

    // Add more validation rules here as needed for other node types
    
    return { valid: true, error: null };
  };

  // Save changes
  const handleSave = async () => {
    const validation = validateFields();
    if (!validation.valid) {
      setValidationError(validation.error);
      return;
    }

    // Apply changes to in-memory state first
    onUpdate({
      data: {
        ...node.data,
        label: localLabel,
        displayDescription: localDisplayDescription,
        config: localConfig,
      },
    });

    // Save to database if orchestrationId is available and node exists in DB
    // Check if node has a database ID (UUID format) vs temporary client ID (node-timestamp)
    const hasDbId = orchestrationId && node.id && !node.id.startsWith('node-');
    
    if (hasDbId) {
      try {
        const response = await fetch('/api/admin/orchestrations/nodes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: node.id,
            label: localLabel,
            positionX: node.position.x,
            positionY: node.position.y,
            config: localConfig,
            displayDescription: localDisplayDescription,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || 'Failed to save node to database');
        }

        // Show success notification
        if (typeof window !== 'undefined' && window.showScoutNotification) {
          window.showScoutNotification({
            message: 'Node configuration saved to database',
            type: 'success',
            duration: 3000,
          });
        }

        // Notify parent that database was updated (for unpublished changes badge)
        onDatabaseSave?.();
      } catch (error) {
        console.error('Error saving node to database:', error);
        if (typeof window !== 'undefined' && window.showScoutNotification) {
          window.showScoutNotification({
            message: error instanceof Error ? error.message : 'Failed to save to database. Changes saved locally only.',
            type: 'error',
            duration: 5000,
          });
        }
        // Don't close panel on error so user can try again
        return;
      }
    } else {
      // No database ID (new node not yet saved) - just show info for in-memory save
      if (typeof window !== 'undefined' && window.showScoutNotification) {
        window.showScoutNotification({
          message: 'Node configuration saved. Click "Save Draft" to persist to database.',
          type: 'info',
          duration: 4000,
        });
      }
    }

    // Close panel after successful save
    onClose();
  };

  // Handle close with unsaved changes confirmation
  const handleClose = () => {
    if (hasUnsavedChanges()) {
      setConfirmDialog({
        message: "You have unsaved changes. Do you want to discard them?",
        onConfirm: () => {
          setConfirmDialog(null);
          onClose();
        },
      });
      return;
    }
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !confirmDialog) {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal((
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="node-properties-title"
          className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        >
          {/* Header */}
          <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg">
                  {NODE_CONFIGS.find((n) => n.type === nodeType)?.icon}
                </span>
                <span className="h-6 w-px flex-shrink-0 bg-slate-200" aria-hidden="true" />
                <h3 id="node-properties-title" className="min-w-0 truncate text-base font-semibold text-slate-900">
                  Node Properties
                  <span className="font-normal text-slate-500">
                    {" "}– Configure {NODE_CONFIGS.find((n) => n.type === nodeType)?.label}
                    {localLabel ? ` (${localLabel})` : ""}
                  </span>
                </h3>
              </div>
                <button
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
                  onClick={handleClose}
                  type="button"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
          </div>

          {/* Body only scrolls when the viewport or a complex node requires it. */}
          <div className="admin-sidebar-scroll min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <div className="space-y-4">
        <section className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 p-4 md:grid-cols-[2fr_3fr]">
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Node Label <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            placeholder="Enter a descriptive label"
          />
          <p className="mt-1 text-xs text-slate-500">Display name for this node</p>
        </div>

        {/* Common: Display Description for Execution Plan */}
        <div className="min-w-0">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Step Description <span className="text-slate-500 text-xs font-normal">(for execution plan)</span>
          </label>
          <input
            type="text"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            value={localDisplayDescription}
            onChange={(e) => setLocalDisplayDescription(e.target.value)}
            placeholder="e.g., Extract rate code from email, Fill rate form, Send confirmation"
          />
          <p className="mt-1 text-xs text-slate-500">
            Human-readable description shown to users when orchestration is triggered
          </p>
        </div>
        </section>

        {/* Node-specific configuration */}
        <section className={`node-properties-form rounded-lg border border-slate-200 p-4
          [&>div]:grid [&>div]:grid-cols-1 [&>div]:gap-3 [&>div]:space-y-0
          ${nodeType === "trigger" || nodeType === "workflow" || nodeType === "data_capture" || nodeType === "ai_extraction" || nodeType === "ai_task" || nodeType === "knowledge_search" || nodeType === "condition" || nodeType === "switch" || nodeType === "notification" || nodeType === "api_call" || nodeType === "database" || nodeType === "variable" || nodeType === "data_formatter" || nodeType === "file_parser" || nodeType === "for_each" || nodeType === "ai_planner" || nodeType === "end" ? "lg:[&>div]:grid-cols-[2fr_3fr]" : "lg:[&>div]:grid-cols-2"}
          ${nodeType === "workflow" || nodeType === "data_capture" || nodeType === "ai_extraction" || nodeType === "ai_task" || nodeType === "knowledge_search" || nodeType === "condition" || nodeType === "switch" || nodeType === "notification" || nodeType === "api_call" || nodeType === "database" || nodeType === "variable" || nodeType === "data_formatter" || nodeType === "file_parser" || nodeType === "for_each" || nodeType === "ai_planner" || nodeType === "end" ? "lg:[&>div>div:nth-child(2)]:border-l lg:[&>div>div:nth-child(2)]:border-slate-200 lg:[&>div>div:nth-child(2)]:pl-4" : ""}
          [&>div>div]:min-w-0
          [&_input]:max-w-sm [&_select]:max-w-xs [&_textarea]:max-w-lg`}>
        {nodeType === "trigger" && <TriggerConfig config={localConfig} updateConfig={updateLocalConfig} companyId={companyId} targetAppId={targetAppId} orchestrationId={orchestrationId} />}
        {nodeType === "workflow" && <WorkflowConfig config={localConfig} updateConfig={updateLocalConfig} nodes={nodes} edges={edges} currentNode={node} />}
        {nodeType === "data_capture" && <DataCaptureConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_extraction" && <AIExtractionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_task" && <AITaskConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "knowledge_search" && <KnowledgeSearchConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "condition" && <ConditionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "switch" && <SwitchConfig config={localConfig} updateConfig={updateLocalConfig} edges={edges} currentNode={node} />}
        {nodeType === "human_approval" && <HumanApprovalConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "notification" && (
          <NotificationConfig
            config={localConfig}
            updateConfig={updateLocalConfig}
            companyId={companyId}
            targetAppId={targetAppId}
          />
        )}
        {nodeType === "api_call" && <ApiCallConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "database" && <DatabaseConfig config={localConfig} updateConfig={updateLocalConfig} targetAppId={targetAppId} />}
        {nodeType === "variable" && <VariableConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "data_formatter" && <DataFormatterConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "file_parser" && <FileParserConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "for_each" && (
          <ForEachConfig
            config={localConfig}
            updateConfig={updateLocalConfig}
            companyId={companyId}
            targetAppId={targetAppId}
          />
        )}
        {nodeType === "ai_planner" && <AiPlannerConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "end" && <EndConfig config={localConfig} updateConfig={updateLocalConfig} supportsMessage={supportsEndMessage} />}
        </section>

        {/* Validation Error */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{validationError}</p>
          </div>
        )}

            </div>
          </div>

          <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-3">
            <button
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              onClick={handleClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              onClick={handleSave}
              type="button"
            >
              <Save className="h-4 w-4" />
              Save Changes
            </button>
          </div>
      </div>
      </div>

    {/* Confirmation Dialog */}
    {confirmDialog && (
      <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-xl border border-slate-200 p-6 max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
          <p className="text-sm text-slate-900 mb-6">{confirmDialog.message}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setConfirmDialog(null)}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              type="button"
            >
              Cancel
            </button>
            <button
              onClick={confirmDialog.onConfirm}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors"
              type="button"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    )}
  </>
  ), document.body);
}

// ============================================================================
// Node-specific configuration components
// ============================================================================

function TriggerConfig({ config, updateConfig, companyId, targetAppId, orchestrationId }: any) {
  const [triggerType, setTriggerType] = useState(config.triggerType || "");
  const [inputFields, setInputFields] = useState<any[]>(config.inputFields || []);
  const [examplePhrases, setExamplePhrases] = useState<string[]>(config.examplePhrases || []);
  const [requiredVariables, setRequiredVariables] = useState<any[]>(config.requiredVariables || []);
  const [shortNameValidation, setShortNameValidation] = useState<{ valid: boolean; message: string } | null>(null);
  const scheduleTimezone = config.timezone || detectDefaultCuratedTimeZone();
  const timezoneOptions = useMemo(() => getCuratedTimeZoneOptions(), []);
  const httpMethodOptions = useMemo(
    () => ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].map((value) => ({ label: value, value })),
    []
  );
  const httpContentTypeOptions = useMemo(
    () => [
      { label: "application/json", value: "application/json" },
      { label: "application/x-www-form-urlencoded", value: "application/x-www-form-urlencoded" },
      { label: "multipart/form-data", value: "multipart/form-data" },
      { label: "text/plain", value: "text/plain" },
      { label: "application/xml", value: "application/xml" },
      { label: "text/xml", value: "text/xml" },
    ],
    []
  );
  
  // Email credentials for email trigger
  type EmailCredential = { id: string; name: string; email_address: string; provider: string; is_active: boolean; target_app_id: string | null };
  const [emailCredentials, setEmailCredentials] = useState<EmailCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [emailInboxOpen, setEmailInboxOpen] = useState(false);
  const emailInboxRef = useRef<HTMLDivElement>(null);
  const [generatedCredential, setGeneratedCredential] = useState<{
    title: string;
    value: string;
    copied: boolean;
  } | null>(null);

  useEffect(() => {
    if (!emailInboxOpen) return;

    const closeEmailInbox = (event: MouseEvent) => {
      if (!emailInboxRef.current?.contains(event.target as globalThis.Node)) {
        setEmailInboxOpen(false);
      }
    };

    document.addEventListener("mousedown", closeEmailInbox);
    return () => document.removeEventListener("mousedown", closeEmailInbox);
  }, [emailInboxOpen]);

  const createRandomSecret = useCallback((length = 40) => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
    const arr = new Uint32Array(length);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (let i = 0; i < length; i += 1) {
        arr[i] = Math.floor(Math.random() * 100000);
      }
    }

    return Array.from(arr, (n) => chars[n % chars.length]).join("");
  }, []);

  const showGeneratedCredential = useCallback((title: string, value: string) => {
    setGeneratedCredential({ title, value, copied: false });
  }, []);

  const copyGeneratedCredential = useCallback(async () => {
    if (!generatedCredential) return;
    try {
      await navigator.clipboard.writeText(generatedCredential.value);
      setGeneratedCredential({ ...generatedCredential, copied: true });
    } catch {
      setGeneratedCredential({ ...generatedCredential, copied: false });
    }
  }, [generatedCredential]);
  
  const handleTriggerTypeChange = (newType: string) => {
    setTriggerType(newType);
    updateConfig({ triggerType: newType });
  };

  const upsertApiKeyCredentials = useCallback((nextCredentials: Array<Record<string, unknown>>) => {
    updateConfig({
      auth: {
        ...(config.auth || {}),
        type: "api_key",
        headerName: config.auth?.headerName || "x-api-key",
        credentials: nextCredentials,
      },
    });
  }, [config.auth, updateConfig]);

  const upsertBasicCredentials = useCallback((nextCredentials: Array<Record<string, unknown>>) => {
    updateConfig({
      auth: {
        ...(config.auth || {}),
        type: "basic",
        credentials: nextCredentials,
      },
    });
  }, [config.auth, updateConfig]);

  const upsertHmacCredentials = useCallback((nextCredentials: Array<Record<string, unknown>>) => {
    updateConfig({
      auth: {
        ...(config.auth || {}),
        type: "hmac",
        hmac: {
          ...(config.auth?.hmac || {}),
          keyIdHeader: config.auth?.hmac?.keyIdHeader || "x-hmac-key-id",
          signatureHeader: config.auth?.hmac?.signatureHeader || "x-hmac-signature",
          timestampHeader: config.auth?.hmac?.timestampHeader || "x-signature-timestamp",
          nonceHeader: config.auth?.hmac?.nonceHeader || "x-signature-nonce",
          algorithm: "sha256",
          credentials: nextCredentials,
        },
      },
    });
  }, [config.auth, updateConfig]);

  useEffect(() => {
    if (triggerType === "manual") {
      updateConfig({ inputFields });
    }
  }, [inputFields]);

  useEffect(() => {
    if (triggerType === "chatbot") {
      updateConfig({ examplePhrases, requiredVariables });
    }
  }, [examplePhrases, requiredVariables]);

  // Seed default config values for the active trigger type on mount (and
  // whenever the trigger type changes) so they persist even if the user
  // never touches these fields before saving. Fields with security/nested
  // shape (http_api auth, rate limit, replay protection) are intentionally
  // left to their own dedicated setup flow rather than defaulted here.
  useEffect(() => {
    if (triggerType === "schedule") {
      updateConfig({
        scheduleType: config.scheduleType || "daily",
        timezone: config.timezone || detectDefaultCuratedTimeZone(),
        enabled: config.enabled !== false,
      });
    } else if (triggerType === "chatbot") {
      updateConfig({
        minConfidence: config.minConfidence ?? 0.6,
        enabled: config.enabled !== false,
      });
    } else if (triggerType === "email") {
      updateConfig({
        pollingIntervalMinutes: config.pollingIntervalMinutes || 5,
        unreadOnly: config.unreadOnly !== false,
        markAsProcessed: config.markAsProcessed !== false,
        enabled: config.enabled !== false,
      });
    } else if (triggerType === "http_api") {
      updateConfig({
        maxPayloadBytes: Number(config.maxPayloadBytes || 1048576),
        requireBody: config.requireBody === true,
        enforceHttps: config.enforceHttps !== false,
        status: config.status || "active",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType]);

  useEffect(() => {
    if (triggerType !== "schedule") return;

    const updates: Record<string, unknown> = {};

    if (!config.timezone) {
      updates.timezone = detectDefaultCuratedTimeZone();
    }

    if (
      (config.scheduleType === "daily" || config.scheduleType === "weekly" || config.scheduleType === "monthly") &&
      !config.specificTimeUtc &&
      config.specificTime
    ) {
      updates.specificTimeUtc = convertTimeInTimeZoneToUtcTime(config.specificTime, scheduleTimezone);
    }

    if (Object.keys(updates).length > 0) {
      updateConfig(updates);
    }
  }, [
    triggerType,
    config.timezone,
    config.scheduleType,
    config.specificTime,
    config.specificTimeUtc,
    scheduleTimezone,
    updateConfig,
  ]);

  useEffect(() => {
    if (triggerType !== "http_api") return;

    const defaults: Record<string, unknown> = {
      shortName: config.shortName || "",
      allowedMethods: Array.isArray(config.allowedMethods) && config.allowedMethods.length > 0
        ? config.allowedMethods
        : ["POST"],
      allowedContentTypes: Array.isArray(config.allowedContentTypes) && config.allowedContentTypes.length > 0
        ? config.allowedContentTypes
        : ["application/json"],
      maxPayloadBytes: Number(config.maxPayloadBytes || 1048576),
      requireBody: config.requireBody === true,
      headers: Array.isArray(config.headers) ? config.headers : [],
      queryParameters: Array.isArray(config.queryParameters) ? config.queryParameters : [],
      pathParameters: Array.isArray(config.pathParameters) ? config.pathParameters : [],
      auth: config.auth || { type: "none" },
      ipAllowlist: Array.isArray(config.ipAllowlist) ? config.ipAllowlist : [],
      rateLimit: config.rateLimit || { enabled: true, maxRequests: 60, windowSeconds: 60, throttleDelayMs: 0 },
      replayProtection: config.replayProtection || {
        enabled: true,
        timestampHeader: "x-signature-timestamp",
        nonceHeader: "x-signature-nonce",
        maxAgeSeconds: 300,
      },
      enforceHttps: config.enforceHttps !== false,
      status: config.status || "active",
    };

    updateConfig(defaults);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType]);

  useEffect(() => {
    if (triggerType !== "http_api") return;

    const shortName = String(config.shortName || "").trim().toLowerCase();
    if (!shortName) {
      setShortNameValidation(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ shortName });
        if (orchestrationId) {
          params.append("orchestrationId", orchestrationId);
        }

        const response = await fetch(`/api/admin/orchestrations/triggers/http/validate?${params.toString()}`);
        const data = await response.json();
        if (data.valid) {
          setShortNameValidation({ valid: true, message: "Endpoint name is available" });
        } else {
          const reason = Array.isArray(data.errors) && data.errors.length > 0
            ? String(data.errors[0])
            : "Invalid endpoint short name";
          setShortNameValidation({ valid: false, message: reason });
        }
      } catch {
        setShortNameValidation({ valid: false, message: "Unable to validate endpoint name" });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [triggerType, config.shortName, orchestrationId]);

  // Fetch email credentials when companyId and targetAppId are available and trigger type is email
  useEffect(() => {
    if (triggerType === 'email' && companyId) {
      setLoadingCredentials(true);
      
      // Build query parameters
      const params = new URLSearchParams();
      params.append('companyId', companyId);
      
      fetch(`/api/orchestrations/email-credentials?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            // Filter credentials by target app if targetAppId is specified
            let credentials = data.credentials.filter((c: EmailCredential) => c.is_active);

            if (targetAppId) {
              credentials = credentials.filter((c: EmailCredential) => c.target_app_id === targetAppId);
            }

            setEmailCredentials(credentials);
          } else {
            console.error('[Node Properties] Failed to load email credentials:', data.error);
            setEmailCredentials([]);
          }
        })
        .catch(error => {
          console.error('[Node Properties] Error fetching email credentials:', error);
          setEmailCredentials([]);
        })
        .finally(() => {
          setLoadingCredentials(false);
        });
    } else {
      setEmailCredentials([]);
    }
  }, [companyId, targetAppId, triggerType]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Trigger Type <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={triggerType}
          onChange={(e) => handleTriggerTypeChange(e.target.value)}
        >
          <option value="" disabled>Select a trigger type</option>
          {TRIGGER_TYPES.map((type) => {
            const isUpcoming = UPCOMING_TRIGGER_TYPES.includes(type);
            return (
              <option
                key={type}
                value={type}
                disabled={isUpcoming}
                style={{ textDecoration: isUpcoming ? 'line-through' : 'none', color: isUpcoming ? '#94a3b8' : 'inherit' }}
              >
                {TRIGGER_TYPE_LABELS[type]}{isUpcoming ? ' (Coming Soon)' : ''}
              </option>
            );
          })}
        </select>
        <p className="mt-1 text-xs text-slate-500">How this orchestration is triggered</p>
      </div>

      {/* Manual Trigger Configuration */}
      {triggerType === "manual" && (
        <div className="border-l-4 border-green-500 bg-green-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Manual Trigger Settings</h4>
          
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
            <p className="font-semibold text-blue-900">💡 How Manual Trigger Works:</p>
            <div className="space-y-1 text-blue-800">
              <p><strong>Field Name:</strong> Variable name (e.g., "session_name") - use lowercase with underscores</p>
              <p><strong>Label:</strong> Display text shown in dialog (e.g., "Training Session Title")</p>
              <p className="pt-2 border-t border-blue-200"><strong>When you run:</strong> A dialog will ask you to enter the actual values for these fields.</p>
              <p><strong>In workflow mapping:</strong> Use trigger.input.field_name to access the value</p>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Input Fields</label>
            <div className="space-y-2">
              {inputFields.map((field, index) => (
                <div key={index} className="bg-white border border-slate-200 rounded p-3 space-y-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="w-24 text-xs font-medium text-slate-600">Field Name:</label>
                      <input
                        type="text"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                        placeholder="e.g. session_name"
                        value={field.name || ""}
                        onChange={(e) => {
                          const updated = [...inputFields];
                          updated[index].name = e.target.value;
                          setInputFields(updated);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-24 text-xs font-medium text-slate-600">Label:</label>
                      <input
                        type="text"
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                        placeholder="e.g. Training Session Title"
                        value={field.label || ""}
                        onChange={(e) => {
                          const updated = [...inputFields];
                          updated[index].label = e.target.value;
                          setInputFields(updated);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="w-24 text-xs font-medium text-slate-600">Type:</label>
                      <select
                        className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                        value={field.type || "text"}
                        onChange={(e) => {
                          const updated = [...inputFields];
                          updated[index].type = e.target.value;
                          setInputFields(updated);
                        }}
                      >
                        <option value="text">Text</option>
                        <option value="textarea">Text Area</option>
                        <option value="number">Number</option>
                        <option value="email">Email</option>
                        <option value="date">Date</option>
                        <option value="select">Select</option>
                        <option value="boolean">Boolean</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="p-1 text-red-600 hover:bg-red-50 rounded text-sm flex items-center gap-1"
                      onClick={() => setInputFields(inputFields.filter((_, i) => i !== index))}
                    >
                      <Minus className="h-4 w-4" />
                      Remove
                    </button>
                  </div>
                  {field.type === "select" && (
                    <div className="pl-4">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Options (one per line):</label>
                      <textarea
                        className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                        rows={3}
                        placeholder="Option 1&#10;Option 2&#10;Option 3"
                        value={field.options?.join("\n") || ""}
                        onChange={(e) => {
                          const updated = [...inputFields];
                          updated[index].options = e.target.value.split("\n").filter(o => o.trim());
                          setInputFields(updated);
                        }}
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2 pl-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={field.required || false}
                        onChange={(e) => {
                          const updated = [...inputFields];
                          updated[index].required = e.target.checked;
                          setInputFields(updated);
                        }}
                      />
                      <span className="text-xs text-slate-600">Required</span>
                    </label>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
                onClick={() => setInputFields([...inputFields, { name: "", label: "", type: "text", required: false }])}
              >
                <Plus className="h-4 w-4" />
                Add Input Field
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Trigger Configuration */}
      {triggerType === "schedule" && (
        <div className="border-l-4 border-purple-500 bg-purple-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Schedule Settings</h4>

          <details className="text-xs bg-white border border-purple-200 rounded p-2">
            <summary className="cursor-pointer font-semibold text-purple-900 hover:text-purple-700">
              💡 Schedule Timezone Help
            </summary>
            <div className="mt-2 space-y-2 text-slate-700">
              <p>
                Pick a timezone from the curated list. The form displays local schedule time in that timezone,
                while the saved value is stored in UTC for consistent processing.
              </p>
              <p>
                Example: selecting <strong>Asia/Kolkata</strong> and entering <strong>09:00</strong> stores
                <strong>03:30 UTC</strong>. When reopened, it is shown back as 09:00 for Asia/Kolkata.
              </p>
              <p>
                One-time schedules are also stored in UTC and converted back to the selected timezone in this form.
              </p>
            </div>
          </details>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Schedule Type</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.scheduleType || "daily"}
              onChange={(e) => updateConfig({ scheduleType: e.target.value })}
            >
              <option value="one-time">One-time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="cron">Cron Expression</option>
            </select>
          </div>

          {config.scheduleType === "one-time" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date & Time</label>
              <input
                type="datetime-local"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.oneTimeDate ? formatUtcIsoForTimeZoneInput(config.oneTimeDate, scheduleTimezone) : ""}
                onChange={(e) => {
                  const date = e.target.value ? parseTimeZoneInputToUtcIso(e.target.value, scheduleTimezone) : "";
                  updateConfig({ oneTimeDate: date });
                }}
              />
              <p className="text-xs text-slate-500 mt-1">Select a future date and time</p>
            </div>
          )}

          {config.scheduleType === "cron" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Cron Expression</label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="0 0 * * *"
                value={config.cronExpression || ""}
                onChange={(e) => updateConfig({ cronExpression: e.target.value })}
              />
              <p className="text-xs text-slate-500 mt-1">Format: minute hour day month weekday</p>
              
              {/* Cron Cheat Sheet */}
              <details className="text-xs mt-2 bg-white border border-purple-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-purple-900 hover:text-purple-700">
                  📖 Cron Expression Cheat Sheet
                </summary>
                <div className="mt-2 space-y-3">
                  <div>
                    <div className="font-semibold text-slate-700 mb-1">Field Format:</div>
                    <div className="font-mono text-xs bg-slate-50 p-2 rounded">
                      ┌───────────── minute (0-59)<br/>
                      │ ┌─────────── hour (0-23)<br/>
                      │ │ ┌───────── day of month (1-31)<br/>
                      │ │ │ ┌─────── month (1-12)<br/>
                      │ │ │ │ ┌───── day of week (0-6, Sunday=0)<br/>
                      │ │ │ │ │<br/>
                      * * * * *
                    </div>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-slate-700 mb-1">Special Characters:</div>
                    <div className="space-y-1 text-slate-600">
                      <div><span className="font-mono">*</span> = Any value</div>
                      <div><span className="font-mono">,</span> = List (e.g., 1,15 = 1st and 15th)</div>
                      <div><span className="font-mono">-</span> = Range (e.g., 1-5 = 1 through 5)</div>
                      <div><span className="font-mono">/</span> = Step (e.g., */15 = every 15 units)</div>
                    </div>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-700 mb-1">Common Examples:</div>
                    <div className="space-y-1 text-slate-600">
                      <div><span className="font-mono">0 9 * * *</span> = Every day at 9:00 AM</div>
                      <div><span className="font-mono">0 9 * * 1-5</span> = Weekdays at 9:00 AM</div>
                      <div><span className="font-mono">0 9 * * 1</span> = Every Monday at 9:00 AM</div>
                      <div><span className="font-mono">0 9 1 * *</span> = 1st of every month at 9:00 AM</div>
                      <div><span className="font-mono">*/15 * * * *</span> = Every 15 minutes</div>
                      <div><span className="font-mono">0 */2 * * *</span> = Every 2 hours</div>
                      <div><span className="font-mono">30 8 * * 1,5</span> = Monday & Friday at 8:30 AM</div>
                      <div><span className="font-mono">0 0 1,15 * *</span> = 1st & 15th at midnight</div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded p-2">
                    <div className="font-semibold text-yellow-900 mb-1">⚠️ Troubleshooting:</div>
                    <ul className="list-disc list-inside text-yellow-800 space-y-1">
                      <li>Check timezone setting if schedule seems off</li>
                      <li>Use online tools like crontab.guru to validate</li>
                      <li>Schedule worker must be running</li>
                      <li>Enable trigger and save orchestration</li>
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          )}

          {(config.scheduleType === "daily" || config.scheduleType === "weekly" || config.scheduleType === "monthly") && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={convertUtcTimeToTimeZoneDisplay(config.specificTimeUtc || config.specificTime || "00:00", scheduleTimezone)}
                onChange={(e) => {
                  updateConfig({ specificTimeUtc: convertTimeInTimeZoneToUtcTime(e.target.value, scheduleTimezone) });
                }}
              />
              <p className="text-xs text-slate-500 mt-1">Saved internally as UTC</p>
            </div>
          )}

          {config.scheduleType === "weekly" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Day of Week</label>
              <select
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.dayOfWeek || 0}
                onChange={(e) => updateConfig({ dayOfWeek: parseInt(e.target.value) })}
              >
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </div>
          )}

          {config.scheduleType === "monthly" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Day of Month</label>
              <input
                type="number"
                min="1"
                max="31"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.dayOfMonth || 1}
                onChange={(e) => updateConfig({ dayOfMonth: parseInt(e.target.value) })}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Timezone</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={scheduleTimezone}
              onChange={(e) => updateConfig({ timezone: e.target.value })}
            >
              {timezoneOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Curated IANA timezones (stored as timezone IDs)</p>
          </div>

          {/* Schedule Preview */}
          {config.scheduleType && (
            <div className="bg-purple-100 border border-purple-300 rounded p-3">
              <div className="text-xs font-semibold text-purple-900 mb-1">📅 Schedule Preview:</div>
              <div className="text-sm text-purple-800 font-medium">
                {(() => {
                  const timezone = config.timezone || "UTC";
                  switch (config.scheduleType) {
                    case "daily":
                      return `Every day at ${convertUtcTimeToTimeZoneDisplay(config.specificTimeUtc || config.specificTime || "00:00", timezone)} ${timezone}`;
                    case "weekly":
                      const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                      return `Every ${days[config.dayOfWeek || 0]} at ${convertUtcTimeToTimeZoneDisplay(config.specificTimeUtc || config.specificTime || "00:00", timezone)} ${timezone}`;
                    case "monthly":
                      const day = config.dayOfMonth || 1;
                      const suffix = day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : "th";
                      return `${day}${suffix} of every month at ${convertUtcTimeToTimeZoneDisplay(config.specificTimeUtc || config.specificTime || "00:00", timezone)} ${timezone}`;
                    case "one-time":
                      if (config.oneTimeDate) {
                        const date = new Date(config.oneTimeDate);
                        return `Once on ${date.toLocaleString(undefined, { timeZone: timezone })} ${timezone}`;
                      }
                      return "One-time (date not set)";
                    case "cron":
                      return config.cronExpression || "Cron expression not set";
                    default:
                      return "Schedule not configured";
                  }
                })()}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="scheduleEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="scheduleEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>

          <p className="text-xs text-purple-700">
            ℹ️ Schedule triggers will be executed by the scheduler worker process
          </p>
        </div>
      )}

      {/* Chatbot Trigger Configuration */}
      {triggerType === "chatbot" && (
        <div className="border-l-4 border-orange-500 bg-orange-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Chatbot Settings</h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Example Phrases</label>
            <div className="space-y-2">
              {examplePhrases.map((phrase, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                    placeholder="e.g., Process the quarterly report"
                    value={phrase}
                    onChange={(e) => {
                      const updated = [...examplePhrases];
                      updated[index] = e.target.value;
                      setExamplePhrases(updated);
                    }}
                  />
                  <button
                    type="button"
                    className="p-1 text-red-600 hover:bg-red-50 rounded"
                    onClick={() => setExamplePhrases(examplePhrases.filter((_, i) => i !== index))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600"
                onClick={() => setExamplePhrases([...examplePhrases, ""])}
              >
                <Plus className="h-4 w-4" />
                Add Example Phrase
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Auto-match Strictness</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.minConfidence ?? 0.6}
              onChange={(e) => updateConfig({ minConfidence: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum confidence required to auto-select this orchestration from a chat message. Lower values are more permissive.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="chatbotEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="chatbotEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>
        </div>
      )}

      {/* Email Trigger Configuration */}
      {triggerType === "email" && (
        <div className="border-l-4 border-pink-500 bg-pink-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Email Trigger Settings</h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email Inbox *
            </label>
            {loadingCredentials ? (
              <div className="w-full rounded border border-slate-300 px-3 py-2 text-sm text-slate-500 bg-slate-50">
                Loading email credentials...
              </div>
            ) : emailCredentials.length === 0 ? (
              <div className="w-full rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                No active email credentials found for this {targetAppId ? 'target app' : 'company'}. 
                <a href="/control-panel/orchestration-designer/email-credentials" target="_blank" className="underline ml-1">
                  Configure email credentials
                </a>
              </div>
            ) : (
              <div ref={emailInboxRef} className="relative min-w-0 w-full">
                <button
                  type="button"
                  className="flex w-full min-w-0 items-center justify-between gap-2 rounded border border-slate-300 bg-white px-3 py-2 text-left text-sm"
                  onClick={() => setEmailInboxOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={emailInboxOpen}
                >
                  <span className="min-w-0 whitespace-normal break-words">
                    {(() => {
                      const selected = emailCredentials.find((cred) => cred.id === config.emailCredentialId);
                      return selected
                        ? `${selected.name} (${selected.email_address}) - ${selected.provider.toUpperCase()}`
                        : "Select email inbox";
                    })()}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                </button>
                {emailInboxOpen && (
                  <div
                    role="listbox"
                    className="absolute z-20 mt-1 max-h-60 w-full min-w-0 overflow-y-auto rounded border border-slate-300 bg-white py-1 shadow-lg"
                  >
                    {emailCredentials.map((cred) => (
                      <button
                        key={cred.id}
                        type="button"
                        role="option"
                        aria-selected={config.emailCredentialId === cred.id}
                        className={`block w-full min-w-0 whitespace-normal break-words px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                          config.emailCredentialId === cred.id ? "bg-slate-100 font-medium" : ""
                        }`}
                        onClick={() => {
                          updateConfig({ emailCredentialId: cred.id });
                          setEmailInboxOpen(false);
                        }}
                      >
                        {cred.name} ({cred.email_address}) - {cred.provider.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Email credentials are pre-configured in Email Credentials Manager
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subject Contains (optional)</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="Invoice, Report"
              value={config.subjectContains || ""}
              onChange={(e) => updateConfig({ subjectContains: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Filter emails by keywords in subject (comma-separated)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sender Filter (optional)</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="sender@domain.com or *@domain.com"
              value={config.senderFilter || ""}
              onChange={(e) => updateConfig({ senderFilter: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Filter emails by sender address (supports wildcards)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Polling Interval (minutes)</label>
            <input
              type="number"
              min="1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.pollingIntervalMinutes || 5}
              onChange={(e) => updateConfig({ pollingIntervalMinutes: parseInt(e.target.value) || 5 })}
            />
            <p className="mt-1 text-xs text-slate-500">
              How often to check for new emails (minimum 1 minute)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="unreadOnly"
              checked={config.unreadOnly !== false}
              onChange={(e) => updateConfig({ unreadOnly: e.target.checked })}
            />
            <label htmlFor="unreadOnly" className="text-sm text-slate-700">Process unread emails only</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="markAsProcessed"
              checked={config.markAsProcessed !== false}
              onChange={(e) => updateConfig({ markAsProcessed: e.target.checked })}
            />
            <label htmlFor="markAsProcessed" className="text-sm text-slate-700">Mark as processed after execution</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="emailEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="emailEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>
        </div>
      )}

      {/* HTTP/API Trigger Configuration */}
      {triggerType === "http_api" && (
        <div className="border-l-4 border-cyan-500 bg-cyan-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">HTTP/API Trigger Settings</h4>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Public Endpoint Short Name *</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="e.g. invoice-webhook"
              value={config.shortName || ""}
              onChange={(e) => updateConfig({ shortName: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
            />
            <p className="mt-1 text-xs text-slate-500">
              Use lowercase letters, numbers, and hyphens only. Internal IDs are never exposed.
            </p>
            {shortNameValidation && (
              <p className={`mt-1 text-xs ${shortNameValidation.valid ? "text-emerald-700" : "text-red-600"}`}>
                {shortNameValidation.message}
              </p>
            )}
            <div className="mt-2 rounded border border-cyan-200 bg-white px-3 py-2 text-xs text-cyan-900 font-mono break-all">
              {(typeof window !== "undefined" ? window.location.origin : "https://<domain>")}/apitrigger/{config.shortName || "<short-name>"}/
            </div>
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">What happens after endpoint creation?</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>Endpoint names are checked for duplicate conflicts and reserved words before publish. This endpoint is hosted by the Scout server deployment. You share this URL with consumers.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Allowed HTTP Methods</label>
            <MultiSelectDropdown
              label=""
              emptyLabel="Select allowed methods"
              options={httpMethodOptions}
              selectedValues={Array.isArray(config.allowedMethods) ? config.allowedMethods : ["POST"]}
              onChange={(values) => updateConfig({ allowedMethods: values.length > 0 ? values : ["POST"] })}
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Method selection help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>Requests using methods outside this list are rejected. If "Require Request Body" is enabled, it applies only to methods that typically carry body payloads (POST/PUT/PATCH/DELETE).</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max Payload (bytes)</label>
            <input
              type="number"
              min="1024"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.maxPayloadBytes || 1048576}
              onChange={(e) => updateConfig({ maxPayloadBytes: parseInt(e.target.value, 10) || 1048576 })}
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Max payload help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>Requests larger than this size are rejected with an invalid input response. Example: 1048576 bytes is roughly 1 MB.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rate Limit (req/window)</label>
            <input
              type="number"
              min="1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.rateLimit?.maxRequests || 60}
              onChange={(e) => updateConfig({
                rateLimit: {
                  ...(config.rateLimit || {}),
                  enabled: config.rateLimit?.enabled !== false,
                  maxRequests: parseInt(e.target.value, 10) || 60,
                  windowSeconds: config.rateLimit?.windowSeconds || 60,
                },
              })}
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Rate limit help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>Defines how many requests are allowed within one rate window. Example: 60 requests with a 60-second window means at most 60 requests per minute.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Content Types</label>
            <MultiSelectDropdown
              label=""
              emptyLabel="Select allowed content types"
              options={httpContentTypeOptions}
              selectedValues={Array.isArray(config.allowedContentTypes) ? config.allowedContentTypes : ["application/json"]}
              onChange={(values) => updateConfig({
                allowedContentTypes: values.length > 0 ? values : ["application/json"],
              })}
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Allowed content types help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>Only these Content-Type values are accepted. Others are rejected. Use standard MIME values such as application/json or multipart/form-data.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Header Names (comma separated)</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={Array.isArray(config.headers) ? config.headers.map((h: any) => h.name).join(", ") : ""}
              onChange={(e) => updateConfig({
                headers: e.target.value
                  .split(",")
                  .map((name) => name.trim())
                  .filter(Boolean)
                  .map((name) => ({ name, required: false })),
              })}
              placeholder="x-tenant-id, x-event-type"
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Allowed headers help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>These headers are expected/accepted for consumer integrations. Headers are optional unless your auth mode requires specific headers.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Allowed Query Parameters (comma separated)</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={Array.isArray(config.queryParameters) ? config.queryParameters.map((q: any) => q.name).join(", ") : ""}
              onChange={(e) => updateConfig({
                queryParameters: e.target.value
                  .split(",")
                  .map((name) => name.trim())
                  .filter(Boolean)
                  .map((name) => ({ name, required: false })),
              })}
              placeholder="source, version"
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Allowed query parameters help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>These query parameters are accepted by this endpoint format. They are optional unless your downstream orchestration logic expects them. Example: source=erp&version=v2</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Path Parameters (ordered, comma separated)</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={Array.isArray(config.pathParameters) ? config.pathParameters.map((p: any) => p.name).join(", ") : ""}
              onChange={(e) => updateConfig({
                pathParameters: e.target.value
                  .split(",")
                  .map((name) => name.trim())
                  .filter(Boolean)
                  .map((name) => ({ name, required: false })),
              })}
              placeholder="accountId, orderId"
            />
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Path parameter help</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p>These names map to extra path segments after /apitrigger/shortName/. Example: /apitrigger/invoice/acme/123 maps accountId=acme, orderId=123.</p>
              </div>
            </details>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Authentication Mode</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.auth?.type || "none"}
              onChange={(e) => updateConfig({
                auth: { ...(config.auth || {}), type: e.target.value },
                ...(e.target.value === "none" ? {
                  replayProtection: {
                    ...(config.replayProtection || {}),
                    enabled: false,
                    timestampHeader: config.replayProtection?.timestampHeader || "x-signature-timestamp",
                    nonceHeader: config.replayProtection?.nonceHeader || "x-signature-nonce",
                    maxAgeSeconds: config.replayProtection?.maxAgeSeconds || 300,
                  },
                } : {}),
              })}
            >
              <option value="none">None</option>
              <option value="api_key">API Key</option>
              <option value="basic">Basic Auth</option>
              <option value="oauth2_jwt">OAuth 2.0 / JWT</option>
              <option value="hmac">HMAC Signature</option>
              <option value="m_tls">Mutual TLS</option>
            </select>
            {config.auth?.type === "none" && (
              <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: None</summary>
                <div className="mt-2 space-y-2 text-slate-700">
                  <p>No authentication check is performed. Use this only for trusted/internal callers.</p>
                  <pre className="rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
                </div>
              </details>
            )}
          </div>

          {config.auth?.type === "api_key" && (
            <div className="space-y-2 rounded border border-cyan-200 bg-white p-3">
              <details className="text-xs bg-cyan-50 border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: API Key</summary>
                <p className="mt-2 text-slate-700">Provide the key in the configured header. Example: x-api-key: &lt;key&gt;</p>
                <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  -H "${config.auth?.headerName || "x-api-key"}: <key>" \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
              </details>
              <label className="block text-xs font-semibold text-slate-600">API Key Header</label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                value={config.auth?.headerName || "x-api-key"}
                onChange={(e) => updateConfig({ auth: { ...(config.auth || {}), type: "api_key", headerName: e.target.value } })}
              />
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">API Keys</label>
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-semibold rounded border border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                  onClick={() => {
                    const secret = createRandomSecret();
                    const id = `key_${Date.now().toString(36)}`;
                    const current = Array.isArray(config.auth?.credentials) ? config.auth.credentials : [];
                    upsertApiKeyCredentials([
                      ...current,
                      { id, label: id, secretHash: secret, isActive: true, createdAt: new Date().toISOString() },
                    ]);
                    showGeneratedCredential(`API key generated for ${id}`, secret);
                  }}
                >
                  Generate API Key
                </button>
              </div>
              <div className="space-y-2">
                {(Array.isArray(config.auth?.credentials) ? config.auth.credentials : []).map((credential: any, index: number) => (
                  <div key={`${credential.id || "api"}-${index}`} className="rounded border border-slate-200 p-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      <span>Key ID</span>
                      <span>Label</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        className="rounded border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-700"
                        placeholder="Key id"
                        value={credential.id || ""}
                        readOnly
                      />
                      <input
                        type="text"
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        placeholder="Label"
                        value={credential.label || ""}
                        onChange={(e) => {
                          const current = Array.isArray(config.auth?.credentials) ? [...config.auth.credentials] : [];
                          current[index] = { ...credential, label: e.target.value };
                          upsertApiKeyCredentials(current);
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{credential.secretHash ? "Secret configured (not shown again). Rotate to issue a new one." : "No secret configured"}</span>
                      <label className="inline-flex items-center gap-1 text-slate-700">
                        <input
                          type="checkbox"
                          checked={credential.isActive !== false}
                          onChange={(e) => {
                            const current = Array.isArray(config.auth?.credentials) ? [...config.auth.credentials] : [];
                            current[index] = { ...credential, isActive: e.target.checked };
                            upsertApiKeyCredentials(current);
                          }}
                        />
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          const secret = createRandomSecret();
                          const current = Array.isArray(config.auth?.credentials) ? [...config.auth.credentials] : [];
                          current[index] = { ...credential, secretHash: secret, isActive: true };
                          upsertApiKeyCredentials(current);
                          showGeneratedCredential(`API key rotated for ${credential.id || "credential"}`, secret);
                        }}
                      >
                        Rotate Secret
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          const current = (Array.isArray(config.auth?.credentials) ? config.auth.credentials : []).filter((_: unknown, i: number) => i !== index);
                          upsertApiKeyCredentials(current);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Multiple active credentials enable key rotation without changing URL.</p>
            </div>
          )}

          {config.auth?.type === "basic" && (
            <div className="space-y-2 rounded border border-cyan-200 bg-white p-3">
              <details className="text-xs bg-cyan-50 border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: Basic</summary>
                <p className="mt-2 text-slate-700">Send standard Basic auth credentials. Example: Authorization: Basic &lt;base64(username:password)&gt;</p>
                <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  -u "username:password" \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
              </details>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">Basic Users</label>
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-semibold rounded border border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                  onClick={() => {
                    const password = createRandomSecret();
                    const username = `user_${Date.now().toString(36)}`;
                    const current = Array.isArray(config.auth?.credentials) ? config.auth.credentials : [];
                    upsertBasicCredentials([
                      ...current,
                      { id: `basic-${Date.now()}`, username, passwordHash: password, isActive: true, createdAt: new Date().toISOString() },
                    ]);
                    showGeneratedCredential(`Password generated for ${username}`, password);
                  }}
                >
                  Generate User Password
                </button>
              </div>
              <div className="space-y-2">
                {(Array.isArray(config.auth?.credentials) ? config.auth.credentials : []).map((credential: any, index: number) => (
                  <div key={`${credential.id || "basic"}-${index}`} className="rounded border border-slate-200 p-2 space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Username</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-700"
                      placeholder="Username"
                      value={credential.username || ""}
                      readOnly
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{credential.passwordHash ? "Password configured (not shown again). Rotate to issue a new one." : "No password configured"}</span>
                      <label className="inline-flex items-center gap-1 text-slate-700">
                        <input
                          type="checkbox"
                          checked={credential.isActive !== false}
                          onChange={(e) => {
                            const current = Array.isArray(config.auth?.credentials) ? [...config.auth.credentials] : [];
                            current[index] = { ...credential, isActive: e.target.checked };
                            upsertBasicCredentials(current);
                          }}
                        />
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          const password = createRandomSecret();
                          const current = Array.isArray(config.auth?.credentials) ? [...config.auth.credentials] : [];
                          current[index] = { ...credential, passwordHash: password, isActive: true };
                          upsertBasicCredentials(current);
                          showGeneratedCredential(`Password rotated for ${credential.username || "user"}`, password);
                        }}
                      >
                        Rotate Password
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          const current = (Array.isArray(config.auth?.credentials) ? config.auth.credentials : []).filter((_: unknown, i: number) => i !== index);
                          upsertBasicCredentials(current);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.auth?.type === "oauth2_jwt" && (
            <div className="space-y-2 rounded border border-cyan-200 bg-white p-3">
              <details className="text-xs bg-cyan-50 border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: OAuth 2.0 / JWT</summary>
                <p className="mt-2 text-slate-700">Provide bearer token in Authorization header. Issuer, audience, and secret are validated.</p>
                <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  -H "authorization: Bearer <jwt>" \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
              </details>
              <label className="block text-xs font-semibold text-slate-600">JWT Issuer</label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                value={config.auth?.jwt?.issuer || ""}
                onChange={(e) => updateConfig({
                  auth: {
                    ...(config.auth || {}),
                    type: "oauth2_jwt",
                    jwt: { ...(config.auth?.jwt || {}), headerName: config.auth?.jwt?.headerName || "authorization", issuer: e.target.value },
                  },
                })}
              />
              <label className="block text-xs font-semibold text-slate-600">JWT Audience</label>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                value={config.auth?.jwt?.audience || ""}
                onChange={(e) => updateConfig({
                  auth: {
                    ...(config.auth || {}),
                    type: "oauth2_jwt",
                    jwt: { ...(config.auth?.jwt || {}), headerName: config.auth?.jwt?.headerName || "authorization", audience: e.target.value },
                  },
                })}
              />
              <label className="block text-xs font-semibold text-slate-600">Shared Secret</label>
              <input
                type="password"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                value={config.auth?.jwt?.sharedSecretHash || ""}
                onChange={(e) => updateConfig({
                  auth: {
                    ...(config.auth || {}),
                    type: "oauth2_jwt",
                    jwt: { ...(config.auth?.jwt || {}), headerName: config.auth?.jwt?.headerName || "authorization", sharedSecretHash: e.target.value },
                  },
                })}
              />
            </div>
          )}

          {config.auth?.type === "hmac" && (
            <div className="space-y-2 rounded border border-cyan-200 bg-white p-3">
              <details className="text-xs bg-cyan-50 border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: HMAC</summary>
                <p className="mt-2 text-slate-700">Sign METHOD + PATH + QUERY + TIMESTAMP + NONCE + BODY and send signature headers.</p>
                <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  -H "x-hmac-key-id: <key-id>" \\
  -H "x-signature-timestamp: <epoch-seconds>" \\
  -H "x-signature-nonce: <nonce>" \\
  -H "x-hmac-signature: <hex-signature>" \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
              </details>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-600">HMAC Keys</label>
                <button
                  type="button"
                  className="px-2 py-1 text-xs font-semibold rounded border border-cyan-300 text-cyan-800 hover:bg-cyan-50"
                  onClick={() => {
                    const secret = createRandomSecret();
                    const keyId = `hmac_${Date.now().toString(36)}`;
                    const current = Array.isArray(config.auth?.hmac?.credentials) ? config.auth.hmac.credentials : [];
                    upsertHmacCredentials([
                      ...current,
                      { keyId, secretHash: secret, secretEnc: secret, isActive: true, createdAt: new Date().toISOString() },
                    ]);
                    showGeneratedCredential(`HMAC secret generated for ${keyId}`, secret);
                  }}
                >
                  Generate HMAC Key
                </button>
              </div>
              <div className="space-y-2">
                {(Array.isArray(config.auth?.hmac?.credentials) ? config.auth.hmac.credentials : []).map((credential: any, index: number) => (
                  <div key={`${credential.keyId || "hmac"}-${index}`} className="rounded border border-slate-200 p-2 space-y-2">
                    <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Key ID</label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-200 bg-slate-100 px-2 py-1 text-sm text-slate-700"
                      placeholder="Key ID"
                      value={credential.keyId || ""}
                      readOnly
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{credential.secretHash ? "Secret configured (not shown again). Rotate to issue a new one." : "No secret configured"}</span>
                      <label className="inline-flex items-center gap-1 text-slate-700">
                        <input
                          type="checkbox"
                          checked={credential.isActive !== false}
                          onChange={(e) => {
                            const current = Array.isArray(config.auth?.hmac?.credentials) ? [...config.auth.hmac.credentials] : [];
                            current[index] = { ...credential, isActive: e.target.checked };
                            upsertHmacCredentials(current);
                          }}
                        />
                        Active
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          const secret = createRandomSecret();
                          const current = Array.isArray(config.auth?.hmac?.credentials) ? [...config.auth.hmac.credentials] : [];
                          current[index] = { ...credential, secretHash: secret, secretEnc: secret, isActive: true };
                          upsertHmacCredentials(current);
                          showGeneratedCredential(`HMAC secret rotated for ${credential.keyId || "key"}`, secret);
                        }}
                      >
                        Rotate Secret
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs font-semibold rounded border border-rose-300 text-rose-700 hover:bg-rose-50"
                        onClick={() => {
                          const current = (Array.isArray(config.auth?.hmac?.credentials) ? config.auth.hmac.credentials : []).filter((_: unknown, i: number) => i !== index);
                          upsertHmacCredentials(current);
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {config.auth?.type === "m_tls" && (
            <div className="space-y-2 rounded border border-cyan-200 bg-white p-3">
              <details className="text-xs bg-cyan-50 border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Auth help: Mutual TLS</summary>
                <p className="mt-2 text-slate-700">Use when your gateway forwards validated client certificate identity to this endpoint.</p>
                <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`curl -X POST "${typeof window !== "undefined" ? window.location.origin : "https://<domain>"}/apitrigger/${config.shortName || "<short-name>"}/" \\
  --cert client.crt --key client.key \\
  -H "content-type: application/json" \\
  -d '{"event":"ping"}'`}</code></pre>
              </details>
              <label className="block text-xs font-semibold text-slate-600">Allowed Certificate Subjects (one per line)</label>
              <textarea
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                rows={3}
                value={Array.isArray(config.auth?.mutualTls?.subjectAllowlist) ? config.auth.mutualTls.subjectAllowlist.join("\n") : ""}
                onChange={(e) => updateConfig({
                  auth: {
                    ...(config.auth || {}),
                    type: "m_tls",
                    mutualTls: {
                      required: true,
                      subjectAllowlist: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean),
                    },
                  },
                })}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IP Allowlist (one IP per line)</label>
            <textarea
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              value={Array.isArray(config.ipAllowlist) ? config.ipAllowlist.join("\n") : ""}
              onChange={(e) => updateConfig({ ipAllowlist: e.target.value.split("\n").map((v) => v.trim()).filter(Boolean) })}
              placeholder="203.0.113.10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Rate Window (seconds)</label>
              <input
                type="number"
                min="1"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.rateLimit?.windowSeconds || 60}
                onChange={(e) => updateConfig({
                  rateLimit: {
                    ...(config.rateLimit || {}),
                    enabled: config.rateLimit?.enabled !== false,
                    maxRequests: config.rateLimit?.maxRequests || 60,
                    windowSeconds: parseInt(e.target.value, 10) || 60,
                  },
                })}
              />
              <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Rate window help</summary>
                <div className="mt-2 space-y-1 text-slate-700">
                  <p>Time bucket for rate counting.</p>
                  <p>Example: maxRequests=60 and window=60 means 60 requests per minute per caller key.</p>
                </div>
              </details>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Replay Max Age (seconds)</label>
              <input
                type="number"
                min="30"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.replayProtection?.maxAgeSeconds || 300}
                onChange={(e) => updateConfig({
                  replayProtection: {
                    ...(config.replayProtection || {}),
                    enabled: config.replayProtection?.enabled !== false,
                    timestampHeader: config.replayProtection?.timestampHeader || "x-signature-timestamp",
                    nonceHeader: config.replayProtection?.nonceHeader || "x-signature-nonce",
                    maxAgeSeconds: parseInt(e.target.value, 10) || 300,
                  },
                })}
              />
              <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
                <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">Replay max age help</summary>
                <div className="mt-2 space-y-1 text-slate-700">
                  <p>Maximum allowed age for signed request timestamps.</p>
                  <p>Requests older than this window are rejected to reduce replay attacks.</p>
                </div>
              </details>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.enforceHttps !== false}
                onChange={(e) => updateConfig({ enforceHttps: e.target.checked })}
              />
              Enforce HTTPS
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={config.requireBody === true}
                onChange={(e) => updateConfig({ requireBody: e.target.checked })}
              />
              Require Request Body
            </label>
          </div>
          <details className="text-xs bg-white border border-cyan-200 rounded p-2">
            <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">HTTPS and request body help</summary>
            <div className="mt-2 space-y-1 text-slate-700">
              <p>Enforce HTTPS rejects non-TLS requests (especially important in production).</p>
              <p>Require Request Body applies only for methods that typically send payload (POST/PUT/PATCH/DELETE).</p>
              <p>GET and HEAD usually do not carry a body and are not blocked by this setting.</p>
            </div>
          </details>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Trigger State</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.status || "active"}
              onChange={(e) => updateConfig({ status: e.target.value })}
            >
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="revoked">Revoked</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Suspended endpoints return a non-success status and do not start orchestrations.
            </p>
            <details className="mt-2 text-xs bg-white border border-cyan-200 rounded p-2">
              <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">State meaning</summary>
              <div className="mt-2 space-y-1 text-slate-700">
                <p><strong>Active:</strong> accepts valid requests and starts orchestration.</p>
                <p><strong>Suspended:</strong> temporarily blocked; endpoint stays configured.</p>
                <p><strong>Revoked:</strong> explicitly invalidated for security/operations; stronger than inactive and should be re-authorized before reuse.</p>
              </div>
            </details>
          </div>

          <details className="text-xs bg-white border border-cyan-200 rounded p-2">
            <summary className="cursor-pointer font-semibold text-cyan-900 hover:text-cyan-700">How this node passes data to next nodes</summary>
            <div className="mt-2 space-y-1 text-slate-700">
              <p>The full HTTP request context is attached to trigger input for downstream nodes.</p>
              <p>Common fields: trigger.input.request.method, trigger.input.request.headers, trigger.input.request.query, trigger.input.request.pathParameters, trigger.input.request.body, trigger.input.correlationId.</p>
            </div>
            <pre className="mt-2 rounded bg-slate-900 text-slate-100 p-2 overflow-x-auto"><code>{`{
  "trigger": {
    "input": {
      "request": {
        "method": "POST",
        "headers": { "content-type": "application/json" },
        "query": { "source": "erp", "version": "v2" },
        "pathParameters": { "accountId": "acme" },
        "body": { "invoiceId": "INV-123", "amount": 1200 }
      },
      "correlationId": "<generated-id>"
    }
  }
}`}</code></pre>
          </details>
        </div>
      )}

      {generatedCredential && (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
            <h5 className="text-sm font-semibold text-slate-900">{generatedCredential.title}</h5>
            <p className="mt-1 text-xs text-slate-600">Copy and share this secret now over a secure channel. It will not be shown again in this screen.</p>
            <textarea
              readOnly
              className="mt-3 h-24 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-800"
              value={generatedCredential.value}
            />
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={copyGeneratedCredential}
              >
                {generatedCredential.copied ? "Copied" : "Copy Secret"}
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-semibold rounded bg-slate-900 text-white hover:bg-slate-800"
                onClick={() => setGeneratedCredential(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function WorkflowConfig({ config, updateConfig, nodes = [], edges = [], currentNode }: any) {
  const [inputMappings, setInputMappings] = useState<Array<{ key: string; value: string }>>(
    Object.entries(config.inputMapping || {}).map(([key, value]) => ({ key, value: value as string }))
  );
  const [outputMappings, setOutputMappings] = useState<Array<{ 
    fieldName: string; 
    selector: string; 
    dataType: 'text' | 'number' | 'date';
    required: boolean;
  }>>(
    // Migrate old format (object) to new format (array), or use empty array
    Array.isArray(config.outputMapping) ? config.outputMapping : []
  );
  const [availableWorkflows, setAvailableWorkflows] = useState<Array<{ 
    id: string; 
    title: string; 
    status: string;
    sessionTitle: string;
  }>>([]);
  const [loadingWorkflows, setLoadingWorkflows] = useState(true);
  const [workflowSteps, setWorkflowSteps] = useState<Array<{ 
    description: string; 
    parameterName: string; 
    parameterLabel: string;
    type: string;
    stepOrder: number;
  }>>([]);
  const [fetchingWorkflowId, setFetchingWorkflowId] = useState<string | null>(null);
  const workflowCacheRef = useRef<Map<string, any>>(new Map());

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      waitForCompletion: config.waitForCompletion !== false,
      continueOnFailure: config.continueOnFailure === true,
      autoFillFromDataCapture: config.autoFillFromDataCapture === true,
      autoAdvancement: config.autoAdvancement === true,
      timeout: Number(config.timeout || 300000),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Get trigger type from trigger node
  const triggerType = (() => {
    const triggerNode = nodes.find((n: any) => n.data?.nodeType === "trigger");
    return triggerNode?.data?.config?.triggerType || null;
  })();

  // Check if there are any data capture nodes connected BEFORE the current node
  const hasDataCaptureNode = (() => {
    if (!currentNode) return false;
    
    // Find all data capture nodes
    const dataCaptureNodes = nodes.filter((n: any) => n.data?.nodeType === "data_capture");
    if (dataCaptureNodes.length === 0) return false;

    // Helper: Check if there's a path from sourceNode to targetNode
    const hasPathBetween = (sourceId: string, targetId: string, visited = new Set<string>()): boolean => {
      if (sourceId === targetId) return true;
      if (visited.has(sourceId)) return false;
      visited.add(sourceId);

      // Find all edges that start from sourceId
      const outgoingEdges = edges.filter((e: any) => e.source === sourceId);
      
      // Check if any outgoing edge leads to target (directly or through other nodes)
      return outgoingEdges.some((edge: any) => hasPathBetween(edge.target, targetId, visited));
    };

    // Check if ANY data capture node has a path to the current node
    return dataCaptureNodes.some((dcNode: any) => hasPathBetween(dcNode.id, currentNode.id));
  })();

  // Extract available trigger phrases from trigger node
  const availableTriggerPhrases = (() => {
    const triggerNode = nodes.find((n: any) => n.data?.nodeType === "trigger");
    if (!triggerNode) return [];

    const triggerConfig = triggerNode.data?.config || {};
    
    // Get phrases from chatbot trigger configuration
    if (triggerConfig.triggerType === "chatbot" && triggerConfig.examplePhrases) {
      return triggerConfig.examplePhrases.map((phrase: string) => ({
        label: phrase,
        value: phrase
      }));
    }

    return [];
  })();

  // Extract available fields from trigger node
  const availableFields = (() => {
    const triggerNode = nodes.find((n: any) => n.data?.nodeType === "trigger");
    if (!triggerNode) return [];

    const triggerConfig = triggerNode.data?.config || {};
    const fields: Array<{ value: string; label: string; description: string }> = [];

    // Add trigger metadata fields
    fields.push(
      { value: "{{trigger.startedBy}}", label: "Triggered By", description: "User who started the orchestration" },
      { value: "{{trigger.startedAt}}", label: "Started At", description: "Timestamp when orchestration started" }
    );

    // Add input fields from manual trigger
    if (triggerConfig.inputFields && Array.isArray(triggerConfig.inputFields)) {
      triggerConfig.inputFields.forEach((field: any) => {
        fields.push({
          value: `{{trigger.input.${field.name}}}`,
          label: field.label || field.name,
          description: `Input field: ${field.type}${field.required ? " (required)" : ""}`
        });
      });
    }

    return fields;
  })();

  // Fetch available workflows with their training sessions
  useEffect(() => {
    async function fetchWorkflows() {
      try {
        // Fetch both guides and training sessions in parallel
        const [guidesResponse, sessionsResponse] = await Promise.all([
          fetch("/api/admin/guided-workflows"),
          fetch("/api/admin/guided-workflow-recording-sessions")
        ]);
        
        if (guidesResponse.ok && sessionsResponse.ok) {
          const guidesData = await guidesResponse.json();
          const sessionsData = await sessionsResponse.json();
          
          const guides = (guidesData.guides || []).filter((guide: any) => guide.status === "published");
          const sessions = sessionsData.sessions || [];
          
          // Create a map of session ID to session title
          const sessionMap = new Map(
            sessions.map((session: any) => [session.id, session.title || "Untitled Session"])
          );
          
          // Create a map of guide ID to topic info (from sessions)
          const guideToTopicMap = new Map();
          sessions.forEach((session: any) => {
            (session.topics || []).forEach((topic: any) => {
              if (topic.guideId) {
                guideToTopicMap.set(topic.guideId, {
                  sessionId: session.id,
                  sessionTitle: session.title || "Untitled Session"
                });
              }
            });
          });
          
          // Map guides to include session title
          const workflows = guides.map((guide: any) => {
            const topicInfo = guideToTopicMap.get(guide.id);
            return {
              id: guide.id,
              title: guide.title,
              status: guide.status,
              sessionTitle: topicInfo?.sessionTitle || ""
            };
          });
          
          // Sort by session title, then by topic title
          workflows.sort((a: typeof workflows[0], b: typeof workflows[0]) => {
            if (a.sessionTitle && !b.sessionTitle) return -1;
            if (!a.sessionTitle && b.sessionTitle) return 1;
            if (a.sessionTitle !== b.sessionTitle) {
              return a.sessionTitle.localeCompare(b.sessionTitle);
            }
            return a.title.localeCompare(b.title);
          });
          
          setAvailableWorkflows(workflows);
        }
      } catch (error) {
        console.error("Failed to fetch workflows:", error);
      } finally {
        setLoadingWorkflows(false);
      }
    }
    fetchWorkflows();
  }, []);

  useEffect(() => {
    const inputMapping = inputMappings.reduce((acc, mapping) => {
      if (mapping.key && mapping.value) acc[mapping.key] = mapping.value;
      return acc;
    }, {} as Record<string, string>);
    updateConfig({ inputMapping });
  }, [inputMappings]);

  useEffect(() => {
    // Save outputMapping array directly (new structure)
    updateConfig({ outputMapping: outputMappings });
  }, [outputMappings]);

  // Fetch workflow details when workflow is selected (with caching)
  useEffect(() => {
    async function fetchWorkflowDetails() {
      if (!config.workflowId) return;
      
      // Check cache first
      const cached = workflowCacheRef.current.get(config.workflowId);
      if (cached) {
        setWorkflowSteps(cached);
        return;
      }
      
      // Prevent duplicate requests for same workflow
      if (fetchingWorkflowId === config.workflowId) {
        return;
      }
      
      setFetchingWorkflowId(config.workflowId);
      
      try {
        const response = await fetch(`/api/admin/guided-workflows/${config.workflowId}`);
        if (response.ok) {
          const data = await response.json();
          const guide = data.guide;
          
          // Extract parameters from recorded actions
          const steps: Array<{ 
            description: string; 
            parameterName: string; 
            parameterLabel: string;
            type: string;
            stepOrder: number;
          }> = [];
          
          if (guide.recordedActions && Array.isArray(guide.recordedActions)) {
            guide.recordedActions.forEach((action: any, index: number) => {
              if (action.type === "input" || action.type === "change") {
                // Extract parameter name from maskedValue or field properties
                const paramName = action.elementIdentity?.name || 
                                 action.name || 
                                 action.elementIdentity?.id ||
                                 `field_${index}`;
                
                const label = action.elementIdentity?.labelText || 
                             action.elementIdentity?.placeholder ||
                             action.elementIdentity?.ariaLabel ||
                             action.labelText ||
                             paramName;
                
                const description = action.stepDescription || 
                                   `Enter value in ${label}`;
                
                const fieldType = action.elementIdentity?.inputType || action.inputType || "text";
                
                steps.push({
                  description,
                  parameterName: paramName,
                  parameterLabel: label,
                  type: fieldType,
                  stepOrder: action.stepOrder || index
                });
              }
            });
          }
          
          // Cache the result
          workflowCacheRef.current.set(config.workflowId, steps);
          setWorkflowSteps(steps);
          
          // Auto-suggest mappings if steps match trigger fields
          if (steps.length > 0 && inputMappings.length === 0 && availableFields.length > 0) {
            const suggestedMappings = steps.map(step => {
              // Try to find matching trigger field
              const matchingField = availableFields.find(field => {
                const fieldLower = field.label.toLowerCase();
                const paramLower = step.parameterLabel.toLowerCase();
                return fieldLower.includes(paramLower) || paramLower.includes(fieldLower);
              });
              
              return {
                key: step.parameterName,
                value: matchingField?.value || ""
              };
            });
            
            if (suggestedMappings.some(m => m.value)) {
              setInputMappings(suggestedMappings);
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch workflow details:", error);
      } finally {
        setFetchingWorkflowId(null);
      }
    }
    
    fetchWorkflowDetails();
  }, [config.workflowId]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Workflow <span className="text-red-500">*</span>
        </label>
        
        <select
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={config.workflowId || ""}
              onChange={(e) => updateConfig({ workflowId: e.target.value })}
              disabled={loadingWorkflows}
            >
              <option value="">
                {loadingWorkflows ? "Loading workflows..." : "Select a workflow..."}
              </option>
              {(() => {
                // Group workflows by session
                const grouped: { [sessionTitle: string]: typeof availableWorkflows } = {};
                const ungrouped: typeof availableWorkflows = [];
                
                availableWorkflows.forEach((workflow) => {
                  if (workflow.sessionTitle) {
                    if (!grouped[workflow.sessionTitle]) {
                      grouped[workflow.sessionTitle] = [];
                    }
                    grouped[workflow.sessionTitle].push(workflow);
                  } else {
                    ungrouped.push(workflow);
                  }
                });
                
                const options = [];
                
                // Render grouped workflows
                Object.keys(grouped).sort().forEach((sessionTitle) => {
                  // Session header (disabled option)
                  options.push(
                    <option key={`session-${sessionTitle}`} disabled style={{ fontWeight: 'bold', color: '#475569' }}>
                      {sessionTitle}
                    </option>
                  );
                  
                  // Topics under this session
                  grouped[sessionTitle].forEach((workflow) => {
                    options.push(
                      <option key={workflow.id} value={workflow.id} style={{ paddingLeft: '1.5rem' }}>
                        {"    → " + workflow.title}
                      </option>
                    );
                  });
                });
                
                // Render ungrouped workflows
                if (ungrouped.length > 0) {
                  if (options.length > 0) {
                    options.push(
                      <option key="separator" disabled>
                        ────────────────
                      </option>
                    );
                  }
                  ungrouped.forEach((workflow) => {
                    options.push(
                      <option key={workflow.id} value={workflow.id}>
                        {workflow.title}
                      </option>
                    );
                  });
                }
                
                return options;
              })()}
        </select>
        <p className="mt-1 text-xs text-slate-500">
          {availableWorkflows.length} published workflow{availableWorkflows.length !== 1 ? "s" : ""} available
        </p>
      </div>

      {/* Trigger Phrases Multi-Select (only show for chatbot triggers) */}
      {triggerType === "chatbot" && availableTriggerPhrases.length > 0 && (
        <div className="order-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Execute When User Says
          </label>
          <MultiSelectDropdown
            label="Trigger Phrases"
            options={availableTriggerPhrases}
            selectedValues={config.triggerPhrases || []}
            onChange={(values) => updateConfig({ triggerPhrases: values })}
            emptyLabel="Select phrases that trigger this workflow..."
          />
          <p className="mt-1 text-xs text-slate-500">
            Select which chatbot phrases should execute this workflow. Leave empty to execute for any phrase.
          </p>
          {config.triggerPhrases && config.triggerPhrases.length > 0 && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
              ✅ This workflow will execute when user says: <strong>{config.triggerPhrases.join(", ")}</strong>
            </div>
          )}
        </div>
      )}

      {/* Target URL (only show for manual triggers) */}
      {triggerType === "manual" && (
        <div className="order-2">
          <label className="block text-sm font-semibold text-slate-700 mb-1">Target URL</label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={config.targetUrl || ""}
            onChange={(e) => updateConfig({ targetUrl: e.target.value })}
            placeholder="https://example.com or {{variableName}}"
          />
          <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs">
            <p className="font-semibold text-blue-900 mb-1">🤖 Automated Browser Execution</p>
            <p className="text-blue-800">
              When Target URL is provided, the workflow will run in an <strong>automated browser</strong>:
            </p>
            <ul className="list-disc list-inside mt-1 text-blue-700 space-y-1">
              <li>Browser opens and navigates to this URL</li>
              <li>If login page detected, <strong>waits for you to login</strong></li>
              <li>After login, resumes navigation to target URL</li>
              <li>Executes all workflow steps automatically</li>
              <li>Returns results back to orchestration</li>
            </ul>
          </div>
        </div>
      )}

      {/* Input Mapping Section (only show for manual triggers) */}
      {triggerType === "manual" && (
        <div className="order-2 border-t pt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          📥 Input Mapping
        </label>
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-700">
          <p className="font-semibold mb-2 text-blue-900">💡 How Input Mapping Works:</p>
          <div className="space-y-1.5">
            <p><strong>Left side:</strong> Describe the field to find (e.g., "training session title", "employee name")</p>
            <p><strong>Right side:</strong> Select the trigger field that contains the value</p>
            <p className="text-blue-800 mt-2 pt-2 border-t border-blue-200">
              <strong>Example:</strong> "fill training name textbox" → trigger.input.title<br/>
              This finds a textbox with label "training name" and fills it with the title from your trigger.
            </p>
          </div>
        </div>
        
        {workflowSteps.length > 0 ? (
          <div className="space-y-3">
            {workflowSteps.map((step, index) => {
              const mapping = inputMappings.find(m => m.key === step.parameterName) || 
                            inputMappings[index] || 
                            { key: step.parameterName, value: "" };
              const mappingIndex = inputMappings.findIndex(m => m.key === step.parameterName) ?? index;
              
              return (
                <div key={step.parameterName} className="p-3 bg-white border border-slate-200 rounded-lg">
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0">
                      {step.stepOrder + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-900">{step.description}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Field: <span className="font-mono bg-slate-100 px-1 rounded">{step.parameterLabel}</span>
                        {step.type && <span className="ml-2">• Type: {step.type}</span>}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 pl-8">
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Get value from:
                    </label>
                    {availableFields.length > 0 ? (
                      <div className="space-y-1">
                        <select
                          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          value={mapping.value || ""}
                          onChange={(e) => {
                            const updated = [...inputMappings];
                            if (mappingIndex >= 0 && mappingIndex < updated.length) {
                              updated[mappingIndex] = { key: step.parameterName, value: e.target.value };
                            } else {
                              updated.push({ key: step.parameterName, value: e.target.value });
                            }
                            setInputMappings(updated);
                          }}
                        >
                          <option value="">Select a field...</option>
                          <optgroup label="📥 Trigger Fields">
                            {availableFields.map((field) => (
                              <option key={field.value} value={field.value}>
                                {field.label}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="✍️ Custom">
                            <option value="__custom__">Type manually...</option>
                          </optgroup>
                        </select>
                        {mapping.value === "__custom__" || (!availableFields.some(f => f.value === mapping.value) && mapping.value) ? (
                          <input
                            type="text"
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 font-mono bg-slate-50"
                            placeholder="Type value or {{expression}}"
                            value={mapping.value === "__custom__" ? "" : mapping.value}
                            onChange={(e) => {
                              const updated = [...inputMappings];
                              if (mappingIndex >= 0 && mappingIndex < updated.length) {
                                updated[mappingIndex] = { key: step.parameterName, value: e.target.value };
                              } else {
                                updated.push({ key: step.parameterName, value: e.target.value });
                              }
                              setInputMappings(updated);
                            }}
                          />
                        ) : null}
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="{{trigger.input.fieldName}} or static value"
                        value={mapping.value}
                        onChange={(e) => {
                          const updated = [...inputMappings];
                          if (mappingIndex >= 0 && mappingIndex < updated.length) {
                            updated[mappingIndex] = { key: step.parameterName, value: e.target.value };
                          } else {
                            updated.push({ key: step.parameterName, value: e.target.value });
                          }
                          setInputMappings(updated);
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <>
            {/* Fallback to manual mapping if workflow details not loaded */}
            <div className="space-y-2">
              {inputMappings.map((mapping, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto_2fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. training title, employee name"
                    value={mapping.key}
                    onChange={(e) => {
                      const updated = [...inputMappings];
                      updated[index].key = e.target.value;
                      setInputMappings(updated);
                    }}
                  />
                  <span className="flex items-center text-slate-400 text-lg">←</span>
                  <div className="relative">
                    {availableFields.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        <select
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                          value={mapping.value || ""}
                          onChange={(e) => {
                            const updated = [...inputMappings];
                            updated[index].value = e.target.value;
                            setInputMappings(updated);
                          }}
                        >
                          <option value="">Select a field...</option>
                          <optgroup label="📥 Trigger Fields">
                            {availableFields.map((field) => (
                              <option key={field.value} value={field.value}>
                                {field.label}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                        <input
                          type="text"
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 font-mono bg-slate-50"
                          placeholder="Or type: {{expression}}"
                          value={mapping.value}
                          onChange={(e) => {
                            const updated = [...inputMappings];
                            updated[index].value = e.target.value;
                            setInputMappings(updated);
                          }}
                        />
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                        placeholder="{{trigger.input.fieldName}}"
                        value={mapping.value}
                        onChange={(e) => {
                          const updated = [...inputMappings];
                          updated[index].value = e.target.value;
                          setInputMappings(updated);
                        }}
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    onClick={() => setInputMappings(inputMappings.filter((_, i) => i !== index))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
                onClick={() => setInputMappings([...inputMappings, { key: "", value: "" }])}
              >
                <Plus className="h-4 w-4" />
                Add Input Mapping
              </button>
            </div>
          </>
        )}
        
        {availableFields.length > 0 && workflowSteps.length === 0 ? (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800">
            <strong>✅ {availableFields.length} field{availableFields.length !== 1 ? "s" : ""} available from trigger!</strong>
            <p className="mt-1">Select a workflow to see smart mapping suggestions.</p>
          </div>
        ) : !availableFields.length && workflowSteps.length === 0 ? (
          <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
            <strong>⚠️ No trigger node found</strong>
            <p className="mt-1">Connect a trigger node first to enable smart field mapping.</p>
          </div>
        ) : null}
      </div>
      )}

      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm md:pt-6">
      {/* Output Mapping Section */}
      <details className="group order-4 border-t pt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700 hover:text-slate-900">
          📤 Workflow Results
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3">
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-slate-700">
          <p className="font-semibold mb-2 text-blue-900">💡 Capture system-generated values from the final page</p>
          <p className="mb-2">After workflow completes, capture values like invoice IDs, confirmation codes, or calculated totals.</p>
          <div className="space-y-1">
            <p><strong>Example:</strong> After creating an invoice, capture the invoice number from the confirmation page.</p>
            <p className="text-blue-800 mt-2 pt-2 border-t border-blue-200">
              <strong>Field Name:</strong> invoiceNumber<br/>
              <strong>CSS Selector:</strong> #invoice-id or .confirmation-code<br/>
              <strong>Required:</strong> ☑ (prompts user if not found)
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          {outputMappings.map((mapping, index) => (
            <div key={index} className="p-3 bg-white border border-slate-200 rounded-lg">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Field Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    placeholder="invoiceNumber"
                    value={mapping.fieldName}
                    onChange={(e) => {
                      const updated = [...outputMappings];
                      updated[index].fieldName = e.target.value;
                      setOutputMappings(updated);
                    }}
                  />
                  {mapping.fieldName && (
                    <p className="mt-1 text-[10px] text-blue-700 bg-blue-50 px-2 py-1 rounded">
                      Access as: <code className="font-mono bg-blue-100 px-1 rounded">{`{{workflow.${currentNode?.data?.label || 'WorkflowName'}.${mapping.fieldName}}}`}</code>
                    </p>
                  )}
                  {!mapping.fieldName && (
                    <p className="mt-1 text-[10px] text-slate-500">Variable name for next nodes</p>
                  )}
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Data Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                    value={mapping.dataType}
                    onChange={(e) => {
                      const updated = [...outputMappings];
                      updated[index].dataType = e.target.value as 'text' | 'number' | 'date';
                      setOutputMappings(updated);
                    }}
                  >
                    <option value="text">Text</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  CSS Selector <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="#invoice-id or .confirmation-code"
                  value={mapping.selector}
                  onChange={(e) => {
                    const updated = [...outputMappings];
                    updated[index].selector = e.target.value;
                    setOutputMappings(updated);
                  }}
                />
                <p className="mt-1 text-[10px] text-slate-500">How to find the element on the page</p>
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`required-${index}`}
                    className="rounded border-slate-300"
                    checked={mapping.required}
                    onChange={(e) => {
                      const updated = [...outputMappings];
                      updated[index].required = e.target.checked;
                      setOutputMappings(updated);
                    }}
                  />
                  <label htmlFor={`required-${index}`} className="text-sm text-slate-700">
                    Required (prompt if not found)
                  </label>
                </div>
                
                <button
                  type="button"
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => setOutputMappings(outputMappings.filter((_, i) => i !== index))}
                  title="Remove field"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
            onClick={() => setOutputMappings([...outputMappings, { 
              fieldName: "", 
              selector: "", 
              dataType: "text",
              required: false
            }])}
          >
            <Plus className="h-4 w-4" />
            Add Result Field
          </button>
        </div>
        
        {outputMappings.length === 0 && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600">
            <strong>ℹ️ Optional:</strong> Only add result fields if you need to capture values from the final page after workflow completes.
          </div>
        )}
        </div>
      </details>

      <div className="order-1">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="waitForCompletion"
            className="rounded border-slate-300"
            checked={config.waitForCompletion !== false}
            onChange={(e) => updateConfig({ waitForCompletion: e.target.checked })}
          />
          <label htmlFor="waitForCompletion" className="text-sm text-slate-700">
            Wait for workflow completion
          </label>
        </div>
        <p className="mt-1 ml-6 text-xs text-slate-500">
          Pause orchestration until workflow finishes. Uncheck to continue immediately (fire-and-forget).
        </p>
      </div>

      <div className="order-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="continueOnFailure"
            className="rounded border-slate-300"
            checked={config.continueOnFailure === true}
            onChange={(e) => updateConfig({ continueOnFailure: e.target.checked })}
          />
          <label htmlFor="continueOnFailure" className="text-sm text-slate-700">
            Continue on failure
          </label>
        </div>
        <p className="mt-1 ml-6 text-xs text-slate-500">
          Keep orchestration running even if workflow fails. Uncheck to stop orchestration on error.
        </p>
      </div>

      {/* Auto-fill from Data Capture - only show if data capture node exists */}
      {hasDataCaptureNode && (
        <div className="order-6 space-y-3">
          <div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoFillFromDataCapture"
                className="rounded border-slate-300"
                checked={config.autoFillFromDataCapture === true}
                onChange={(e) => updateConfig({ autoFillFromDataCapture: e.target.checked })}
              />
              <label htmlFor="autoFillFromDataCapture" className="text-sm text-slate-700">
                Auto-fill from Data Capture node
              </label>
              <div className="ml-auto">
                <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                  🤖 Smart field matching
                </span>
              </div>
            </div>
            <p className="mt-1 ml-6 text-xs text-slate-500">
              Automatically fill workflow fields with values captured from previous Data Capture node using intelligent matching.
            </p>
          </div>

          {/* Auto-advancement - only show when auto-fill is enabled */}
          {config.autoFillFromDataCapture && (
            <div className="ml-6 pl-4 border-l-2 border-slate-200">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="autoAdvancement"
                  className="rounded border-slate-300"
                  checked={config.autoAdvancement === true}
                  onChange={(e) => updateConfig({ autoAdvancement: e.target.checked })}
                />
                <label htmlFor="autoAdvancement" className="text-sm text-slate-700">
                  Auto advancement
                </label>
                <div className="ml-auto">
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                    ⚡ Auto-progress
                  </span>
                </div>
              </div>
              <p className="mt-1 ml-6 text-xs text-slate-500">
                Automatically advance to next step after filling each field (2 second pause). User gets time to see what was filled.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="order-3">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Timeout (ms)</label>
        <input
          type="number"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.timeout || 300000}
          onChange={(e) => updateConfig({ timeout: parseInt(e.target.value) || 300000 })}
        />
        <p className="mt-1 text-xs text-slate-500">Default: 300000 (5 minutes)</p>
      </div>
      </div>
    </div>
  );
}

function DataCaptureConfig({ config, updateConfig }: any) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      mode: config.mode || "hybrid",
      showReviewScreen: config.showReviewScreen !== false,
      allowEdit: config.allowEdit !== false,
      autoReviewTimeout: config.autoReviewTimeout || 0,
      outputVariable: config.outputVariable || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Capture Mode <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.mode || "hybrid"}
          onChange={(e) => updateConfig({ mode: e.target.value })}
        >
          <option value="dom">DOM Only (Fast, HTML forms)</option>
          <option value="ai">AI Only (Slow, complex UIs)</option>
          <option value="hybrid">Hybrid (Recommended)</option>
          <option value="comprehensive">Comprehensive (All methods)</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Hybrid tries DOM first, then AI fallback. Comprehensive tries all methods.
        </p>
      </div>

      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm md:pt-6">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="showReviewScreen"
            checked={config.showReviewScreen !== false}
            onChange={(e) => updateConfig({ showReviewScreen: e.target.checked })}
            className="h-4 w-4"
          />
          <label htmlFor="showReviewScreen" className="text-sm font-medium text-slate-700">
            Show review screen to user
          </label>
        </div>

        {config.showReviewScreen !== false && (
          <>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="allowEdit"
                checked={config.allowEdit !== false}
                onChange={(e) => updateConfig({ allowEdit: e.target.checked })}
                className="h-4 w-4"
              />
              <label htmlFor="allowEdit" className="text-sm font-medium text-slate-700">
                Allow user to edit captured values
              </label>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Auto-continue timeout (seconds)
              </label>
              <input
                type="number"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                value={config.autoReviewTimeout || 0}
                onChange={(e) => updateConfig({ autoReviewTimeout: parseInt(e.target.value) || 0 })}
                placeholder="0 = requires user click"
              />
              <p className="mt-1 text-xs text-slate-500">
                0 = requires user to click Continue. 5 = auto-continues after 5 seconds.
              </p>
            </div>
          </>
        )}

        <div className="border-t border-blue-200 pt-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
          >
            <span>{showAdvanced ? "▼" : "▶"}</span>
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="mt-4 space-y-4 pl-6">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Output Variable Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                  value={config.outputVariable || ""}
                  onChange={(e) => updateConfig({ outputVariable: e.target.value })}
                  placeholder="capturedData"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Variable name to store captured data. Useful when you have multiple data capture nodes and need to keep their data separate (e.g., userInfo, orderDetails).
                </p>
                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                  <p className="font-semibold text-blue-900 mb-1">💡 How to use in Condition/Variable nodes:</p>
                  <code className="text-blue-800">
                    {`{{${config.outputVariable || "capturedData"}.fieldName.value}}`}
                  </code>
                  <p className="mt-1 text-blue-700">
                    Example: <code className="bg-blue-100 px-1 rounded">{`{{${config.outputVariable || "capturedData"}.email.value}}`}</code> or <code className="bg-blue-100 px-1 rounded">{`{{${config.outputVariable || "capturedData"}.customerName.value}}`}</code>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AIExtractionConfig({ config, updateConfig }: any) {
  const [schemaFields, setSchemaFields] = useState<Array<{ key: string; type: string; description: string; required: boolean }>>(
    Object.entries(config.schema || {}).map(([key, def]) => {
      if (def && typeof def === "object") {
        return {
          key,
          type: (def as any).type || "string",
          description: (def as any).description || "",
          required: (def as any).required === true,
        };
      }
      return { key, type: (def as string) || "string", description: "", required: false };
    })
  );

  // Active LLM provider (from AI Configuration), shown for reference
  const [activeProvider, setActiveProvider] = useState<{ provider: string; model: string } | null>(null);

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      extractionMode: config.extractionMode || "predefined",
      input: config.input || "",
      prompt: config.prompt || "",
      clarificationTimeoutMinutes: config.clarificationTimeoutMinutes ?? 15,
      outputVariable: config.outputVariable || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/orchestrations/ai-provider")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) {
          setActiveProvider({ provider: data.provider, model: data.model });
        }
      })
      .catch(() => {
        /* non-fatal: just don't show the provider */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const schema = schemaFields.reduce((acc, field) => {
      if (field.key) {
        acc[field.key] = { type: field.type, description: field.description, required: field.required };
      }
      return acc;
    }, {} as Record<string, { type: string; description: string; required: boolean }>);
    updateConfig({ schema, fields: schemaFields });
  }, [schemaFields]);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
      {/* Active provider */}
      <div className="order-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
        <div>
          Active AI provider:{" "}
          {activeProvider ? (
            <span className="font-semibold">
              {activeProvider.provider}
              {activeProvider.model ? ` (${activeProvider.model})` : ""}
            </span>
          ) : (
            <span className="italic">loading…</span>
          )}
        </div>
        <div className="mt-1">
          Change it on the <span className="font-semibold">AI Configuration</span> page.
        </div>
      </div>

      {/* How to use */}
      <div className="order-3">
        <CollapsibleHelp title="How to use this node">
          <p>
            AI Extraction reads some input text, uses the active AI provider to pull
            out the fields you describe, and stores the result in an output variable
            you can reference in later nodes.
          </p>
          <ol className="list-decimal pl-4 space-y-1 mt-2">
            <li>Provide the source value in <strong>Input Data</strong> using variables from the trigger or earlier nodes.</li>
            <li>Choose predefined fields, a runtime instruction, or both.</li>
            <li>Reference results downstream as <code className="bg-slate-100 px-1 rounded">{`{{output.field}}`}</code>.</li>
          </ol>
        </CollapsibleHelp>
      </div>

      <div className="order-1">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Extraction Mode
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.extractionMode || "predefined"}
          onChange={(e) => updateConfig({ extractionMode: e.target.value })}
        >
          <option value="predefined">Predefined fields</option>
          <option value="instruction">Runtime instruction</option>
          <option value="hybrid">Predefined + runtime instruction</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Runtime mode lets the chatbot user decide which fields to extract for each uploaded file.
        </p>
      </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="order-1">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Input Data <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
          value={config.input || ""}
          onChange={(e) => updateConfig({ input: e.target.value })}
          placeholder="{{trigger.input.userMessage}} or {{bodyText}}"
        />
        <CollapsibleHelp title="Examples by node type">
          <ul className="space-y-2">
            <li>
              <div className="font-semibold text-slate-700">After a Manual trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{trigger.input.message}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After a Chatbot trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{trigger.input.userMessage}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After an Email trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{subject}} {{bodyText}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After a Schedule trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`Scheduled run for {{trigger.triggerType}} at {{trigger.timestamp}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After an HTTP/API trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{request.body}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After a Workflow node</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{workflow.getOrder.output}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After another AI Extraction</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{extracted.rawText}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">Mixing literal text + variables</div>
              <code className="block bg-slate-100 px-1 rounded">{`Order: {{trigger.orderId}} from {{from}}`}</code>
            </li>
          </ul>
        </CollapsibleHelp>
      </div>

      {config.extractionMode !== "instruction" && (
      <div className="order-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Fields to Extract <span className="text-red-500">*</span>
        </label>
        <CollapsibleHelp title="How fields work">
          <p>
            Give each field a name (used downstream) and describe what to look for.
            The AI matches synonyms/variants automatically — e.g. a field described
            as &ldquo;invoice number&rdquo; also finds Invoice #, Invoice ID, Invoice No.
          </p>
        </CollapsibleHelp>
        <div className="space-y-3 mt-2">
          {schemaFields.map((field, index) => (
            <div key={index} className="rounded-lg border border-slate-200 p-3 space-y-2">
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Field name (e.g. invoiceNumber)"
                  value={field.key}
                  onChange={(e) => {
                    const updated = [...schemaFields];
                    updated[index].key = e.target.value;
                    setSchemaFields(updated);
                  }}
                />
                <select
                  className="w-40 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                  value={field.type}
                  onChange={(e) => {
                    const updated = [...schemaFields];
                    updated[index].type = e.target.value;
                    setSchemaFields(updated);
                  }}
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="array">Array</option>
                  <option value="object">Object</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(e) => {
                    const updated = [...schemaFields];
                    updated[index].required = e.target.checked;
                    setSchemaFields(updated);
                  }}
                  className="rounded border-slate-300"
                />
                Mandatory field
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Describe what to extract (e.g. the invoice number, may appear as Invoice #, Invoice ID)"
                value={field.description}
                onChange={(e) => {
                  const updated = [...schemaFields];
                  updated[index].description = e.target.value;
                  setSchemaFields(updated);
                }}
              />
              <button
                type="button"
                className="inline-flex w-fit items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                onClick={() => setSchemaFields(schemaFields.filter((_, i) => i !== index))}
              >
                <Minus className="h-4 w-4" />
                Remove field
              </button>
            </div>
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
            onClick={() =>
              setSchemaFields([...schemaFields, { key: "", type: "string", description: "", required: false }])
            }
          >
            <Plus className="h-4 w-4" />
            Add Field
          </button>
        </div>
      </div>
      )}

      <div className="order-2">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Additional Instructions (optional)
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.prompt || ""}
          onChange={(e) => updateConfig({ prompt: e.target.value })}
          placeholder="Any extra guidance for the extraction (optional)"
        />
      </div>

      {config.extractionMode !== "instruction" && (
      <div className="order-3">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Clarification Expiry Timeout (minutes)
        </label>
        <input
          type="number"
          min={1}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.clarificationTimeoutMinutes ?? 15}
          onChange={(e) => updateConfig({ clarificationTimeoutMinutes: Number(e.target.value) || 15 })}
          placeholder="15"
        />
        <p className="mt-1 text-xs text-slate-500">
          How long a chatbot clarification stays valid before the node expires and must ask again.
        </p>
      </div>
      )}

      <div className="order-5">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Variable <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.outputVariable || ""}
          onChange={(e) => updateConfig({ outputVariable: e.target.value })}
          placeholder="extracted"
        />
        <p className="mt-1 text-xs text-slate-500">
          Reference extracted fields downstream as{" "}
          <code className="bg-slate-100 px-1 rounded">{`{{${config.outputVariable || "extracted"}.invoiceNumber}}`}</code>.
        </p>
      </div>
      </div>
    </div>
  );
}

function CollapsibleHelp({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
      </button>
      {open && (
        <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 space-y-1">
          {children}
        </div>
      )}
    </div>
  );
}

function AITaskConfig({ config, updateConfig }: any) {
  const [outputFields, setOutputFields] = useState<Array<{ key: string; type: string; description: string }>>(
    Array.isArray(config.outputFields) && config.outputFields.length > 0
      ? config.outputFields.map((field: any) => ({
          key: field?.key || "",
          type: field?.type || "string",
          description: field?.description || "",
        }))
      : [{ key: "", type: "string", description: "" }]
  );

  // Active LLM provider (from AI Configuration), shown for reference
  const [activeProvider, setActiveProvider] = useState<{ provider: string; model: string } | null>(null);

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      instructionMode: config.instructionMode || "static",
      instruction: config.instruction || "",
      input: config.input || "",
      outputFormat: config.outputFormat || "text",
      clarificationTimeoutMinutes: config.clarificationTimeoutMinutes ?? 15,
      outputVariable: config.outputVariable || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/orchestrations/ai-provider")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.success) {
          setActiveProvider({ provider: data.provider, model: data.model });
        }
      })
      .catch(() => {
        /* non-fatal: just don't show the provider */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    updateConfig({ outputFields });
  }, [outputFields]);

  const instructionMode = config.instructionMode || "static";

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
      {/* Active provider */}
      <div className="order-2 rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
        <div>
          Active AI provider:{" "}
          {activeProvider ? (
            <span className="font-semibold">
              {activeProvider.provider}
              {activeProvider.model ? ` (${activeProvider.model})` : ""}
            </span>
          ) : (
            <span className="italic">loading…</span>
          )}
        </div>
        <div className="mt-1">
          Change it on the <span className="font-semibold">AI Configuration</span> page.
        </div>
      </div>

      {/* How to use */}
      <div className="order-3">
        <CollapsibleHelp title="How to use this node">
          <p>
            AI Task performs an open-ended task — summarize a file, draft a reply,
            rewrite some text — using an instruction and optional context, and
            stores the result in an output variable you can reference downstream.
          </p>
          <ol className="list-decimal pl-4 space-y-1 mt-2">
            <li>Choose where the instruction comes from (fixed, chat, or both).</li>
            <li>Point Context Content at earlier output, e.g. <code className="bg-slate-100 px-1 rounded">{`{{parsedFile}}`}</code>.</li>
            <li>Reference the result downstream as <code className="bg-slate-100 px-1 rounded">{`{{output}}`}</code> or <code className="bg-slate-100 px-1 rounded">{`{{output.field}}`}</code>.</li>
          </ol>
        </CollapsibleHelp>
      </div>

      <div className="order-1">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Instruction Source
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={instructionMode}
          onChange={(e) => updateConfig({ instructionMode: e.target.value })}
        >
          <option value="static">Fixed instruction</option>
          <option value="chat">Chat message is the instruction</option>
          <option value="hybrid">Fixed instruction + chat message</option>
        </select>
        <p className="mt-1 text-xs text-slate-500">
          Chat mode asks the user what to do if no chatbot message is available yet.
        </p>
      </div>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="order-1">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Instruction {instructionMode !== "chat" && <span className="text-red-500">*</span>}
        </label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={config.instruction || ""}
          onChange={(e) => updateConfig({ instruction: e.target.value })}
          placeholder={
            instructionMode === "chat"
              ? "Optional guardrails/persona, e.g. \"Keep a professional tone.\""
              : "e.g. \"Summarize the content in 3 bullet points for a busy manager.\""
          }
        />
        {instructionMode === "chat" && (
          <p className="mt-1 text-xs text-slate-500">
            Optional — the chat message itself is the task; this adds extra guardrails.
          </p>
        )}
      </div>

      <div className="order-2">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Context Content (optional)
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
          value={config.input || ""}
          onChange={(e) => updateConfig({ input: e.target.value })}
          placeholder="{{parsedFile}} or {{formatterResult}}"
        />
        <p className="mt-1 text-xs text-slate-500">
          The content the task should work on, e.g. a parsed file or formatted data from an earlier node.
        </p>
      </div>

      <div className="order-4">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Format
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.outputFormat || "text"}
          onChange={(e) => updateConfig({ outputFormat: e.target.value })}
        >
          <option value="text">Plain text</option>
          <option value="json">Structured fields</option>
        </select>
      </div>

      {config.outputFormat === "json" && (
        <div className="order-5">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            Output Fields <span className="text-red-500">*</span>
          </label>
          <CollapsibleHelp title="How fields work">
            <p>
              Give each field a name (used downstream) and describe what it should
              contain, e.g. a &ldquo;subject&rdquo; and &ldquo;body&rdquo; field for a drafted email.
            </p>
          </CollapsibleHelp>
          <div className="space-y-3 mt-2">
            {outputFields.map((field, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    placeholder="Field name (e.g. subject)"
                    value={field.key}
                    onChange={(e) => {
                      const updated = [...outputFields];
                      updated[index].key = e.target.value;
                      setOutputFields(updated);
                    }}
                  />
                  <select
                    className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                    value={field.type}
                    onChange={(e) => {
                      const updated = [...outputFields];
                      updated[index].type = e.target.value;
                      setOutputFields(updated);
                    }}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="array">Array</option>
                    <option value="object">Object</option>
                  </select>
                  <button
                    type="button"
                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                    onClick={() => setOutputFields(outputFields.filter((_, i) => i !== index))}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <input
                  type="text"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Describe what this field should contain (e.g. the email subject line)"
                  value={field.description}
                  onChange={(e) => {
                    const updated = [...outputFields];
                    updated[index].description = e.target.value;
                    setOutputFields(updated);
                  }}
                />
              </div>
            ))}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
              onClick={() => setOutputFields([...outputFields, { key: "", type: "string", description: "" }])}
            >
              <Plus className="h-4 w-4" />
              Add Field
            </button>
          </div>
        </div>
      )}

      {instructionMode === "chat" && (
        <div className="order-3">
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Clarification Expiry Timeout (minutes)
          </label>
          <input
            type="number"
            min={1}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={config.clarificationTimeoutMinutes ?? 15}
            onChange={(e) => updateConfig({ clarificationTimeoutMinutes: Number(e.target.value) || 15 })}
            placeholder="15"
          />
          <p className="mt-1 text-xs text-slate-500">
            How long the &ldquo;what would you like me to do?&rdquo; prompt stays valid before it expires.
          </p>
        </div>
      )}

      <div className="order-6">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Variable <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.outputVariable || ""}
          onChange={(e) => updateConfig({ outputVariable: e.target.value })}
          placeholder="aiTask"
        />
        <p className="mt-1 text-xs text-slate-500">
          Reference the result downstream as{" "}
          <code className="bg-slate-100 px-1 rounded">
            {config.outputFormat === "json"
              ? `{{${config.outputVariable || "aiTask"}.${outputFields[0]?.key || "field"}}}`
              : `{{${config.outputVariable || "aiTask"}}}`}
          </code>
          .
        </p>
      </div>
      </div>
    </div>
  );
}

function KnowledgeSearchConfig({ config, updateConfig }: any) {
  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      query: config.query || "",
      topK: config.topK ?? 5,
      outputVariable: config.outputVariable || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
        <CollapsibleHelp title="How to use this node">
          <p>
            Knowledge Search runs a real search against the company&rsquo;s indexed
            documents and returns the most relevant passages and citations. It
            does not summarize or answer — feed its output into an{" "}
            <strong>AI Task</strong> node&rsquo;s &ldquo;Context Content&rdquo; field to
            have that node reason over the retrieved passages.
          </p>
        </CollapsibleHelp>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="order-1">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Search Query <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
          value={config.query || ""}
          onChange={(e) => updateConfig({ query: e.target.value })}
          placeholder="{{trigger.input.userMessage}}"
        />
        <p className="mt-1 text-xs text-slate-500">
          What to search the knowledge base for — usually the chat message, or a summary from an earlier node.
        </p>
      </div>

      <div className="order-3">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Max Results
        </label>
        <input
          type="number"
          min={1}
          max={20}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.topK ?? 5}
          onChange={(e) => updateConfig({ topK: Number(e.target.value) || 5 })}
          placeholder="5"
        />
      </div>

      <div className="order-2">
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Variable <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.outputVariable || ""}
          onChange={(e) => updateConfig({ outputVariable: e.target.value })}
          placeholder="knowledgeSearch"
        />
        <p className="mt-1 text-xs text-slate-500">
          Reference the retrieved text downstream as{" "}
          <code className="bg-slate-100 px-1 rounded">
            {`{{${config.outputVariable || "knowledgeSearch"}}}`}
          </code>
          , the raw passages as{" "}
          <code className="bg-slate-100 px-1 rounded">
            {`{{${config.outputVariable || "knowledgeSearch"}Chunks}}`}
          </code>
          , and citations as{" "}
          <code className="bg-slate-100 px-1 rounded">
            {`{{${config.outputVariable || "knowledgeSearch"}Citations}}`}
          </code>
          .
        </p>
      </div>
      </div>
    </div>
  );
}

function ConditionConfig({ config, updateConfig }: any) {
  const [conditions, setConditions] = useState<Array<{ variable: string; operator: string; value?: string; logicAfter?: "and" | "or"; caseSensitive?: boolean }>>(
    config.conditions || [{ variable: "", operator: "equals", value: "", logicAfter: "and", caseSensitive: false }]
  );

  useEffect(() => {
    updateConfig({ conditions });
  }, [conditions]);

  const addCondition = () => {
    setConditions([...conditions, { variable: "", operator: "equals", value: "", logicAfter: "and", caseSensitive: false }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const updateCondition = (index: number, field: string, value: string | boolean) => {
    const updated = [...conditions];
    updated[index] = { ...updated[index], [field]: value };
    setConditions(updated);
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex flex-col gap-4">
      {/* Variable Usage Help */}
      <details className="min-w-0 overflow-hidden rounded-lg border border-slate-300 bg-white [overflow-wrap:anywhere]
        [&_*]:min-w-0 [&_code]:whitespace-pre-wrap [&_code]:break-all
        [&_.font-mono]:whitespace-pre-wrap [&_.font-mono]:break-words
        [&_.flex]:flex-wrap">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          📘 How to Use Variables in Conditions
        </summary>
        <div className="px-4 py-3 space-y-4 text-sm border-t border-slate-200 bg-slate-50">
          
          {/* Variable Format */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Variable Format</h4>
            <p className="text-slate-700 mb-2">
              Variables use <code className="bg-slate-200 px-1 py-0.5 rounded text-xs">{"{{scope.variableName}}"}</code> format with double curly braces.
            </p>
            <div className="bg-white border border-slate-200 rounded p-2 text-xs font-mono">
              <div className="text-blue-600">{"{{variables.orderAmount}}"}</div>
              <div className="text-blue-600">{"{{capturedData.email.value}}"}</div>
              <div className="text-blue-600">{"{{workflow.CreateInvoice.total}}"}</div>
            </div>
          </div>

          {/* Variable Sources */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Variable Sources</h4>
            
            <div className="space-y-3">
              {/* Variable Node */}
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">📈</span>
                  <span className="font-semibold text-slate-800">Variable Node</span>
                  <code className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-xs">{"{{variables.xxx}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Stores values explicitly set in Variable nodes.</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Variable Node: "orderAmount" = 5000</div>
                  <div className="text-blue-600 mt-1">Use: {"{{variables.orderAmount}}"}</div>
                </div>
              </div>

              {/* Data Capture Node */}
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">📋</span>
                  <span className="font-semibold text-slate-800">Data Capture Node</span>
                  <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">{"{{capturedData.xxx.value}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Captures user input from forms during workflow execution.</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Captured fields: email, phone, address</div>
                  <div className="text-blue-600 mt-1">Use: {"{{capturedData.email.value}}"}</div>
                  <div className="text-blue-600">Use: {"{{capturedData.phone.value}}"}</div>
                </div>
              </div>

              {/* Workflow Node */}
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🔄</span>
                  <span className="font-semibold text-slate-800">Workflow Node</span>
                  <code className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">{"{{workflow.Name.field}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Outputs from completed guided workflows.</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Workflow: "CreateInvoice" outputs: id, total, status</div>
                  <div className="text-blue-600 mt-1">Use: {"{{workflow.CreateInvoice.id}}"}</div>
                  <div className="text-blue-600">Use: {"{{workflow.CreateInvoice.total}}"}</div>
                </div>
              </div>

              {/* Trigger Node */}
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">⚡</span>
                  <span className="font-semibold text-slate-800">Trigger Node</span>
                  <code className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs">{"{{trigger.xxx}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Data passed when orchestration starts (manual, chatbot, email, schedule).</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Trigger data: orderId, customerId, priority</div>
                  <div className="text-blue-600 mt-1">Use: {"{{trigger.orderId}}"}</div>
                  <div className="text-blue-600">Use: {"{{trigger.priority}}"}</div>
                </div>
              </div>

              {/* AI Extraction Node */}
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🤖</span>
                  <span className="font-semibold text-slate-800">AI Extraction Node</span>
                  <code className="bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded text-xs">{"{{ai.xxx}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Data extracted by AI from documents or text.</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Extracted: amount, invoiceNumber, date</div>
                  <div className="text-blue-600 mt-1">Use: {"{{ai.amount}}"}</div>
                  <div className="text-blue-600">Use: {"{{ai.invoiceNumber}}"}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Example Conditions */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">Example Conditions</h4>
            
            <div className="space-y-2">
              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">Check if amount exceeds threshold:</div>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div>Variable: <span className="text-blue-600">{"{{variables.orderAmount}}"}</span></div>
                  <div>Operator: <span className="text-slate-600">greater_than</span></div>
                  <div>Value: <span className="text-blue-600">1000</span></div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">Check customer type:</div>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div>Variable: <span className="text-blue-600">{"{{capturedData.customerType.value}}"}</span></div>
                  <div>Operator: <span className="text-slate-600">equals</span></div>
                  <div>Value: <span className="text-blue-600">Premium</span></div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">Check workflow status:</div>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div>Variable: <span className="text-blue-600">{"{{workflow.CreateInvoice.status}}"}</span></div>
                  <div>Operator: <span className="text-slate-600">equals</span></div>
                  <div>Value: <span className="text-blue-600">completed</span></div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded p-2">
                <div className="text-xs font-semibold text-slate-700 mb-1">Check if email exists:</div>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div>Variable: <span className="text-blue-600">{"{{capturedData.email.value}}"}</span></div>
                  <div>Operator: <span className="text-slate-600">not_empty</span></div>
                  <div className="text-slate-500 italic">(No value needed for this operator)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Best Practices */}
          <div>
            <h4 className="font-semibold text-slate-900 mb-2">⭐ Best Practices</h4>
            <ul className="space-y-1 text-xs text-slate-700">
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Use descriptive names: <code className="bg-slate-200 px-1 rounded">{"{{variables.customerOrderAmount}}"}</code> not <code className="bg-slate-200 px-1 rounded">{"{{variables.amt}}"}</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Variables must exist BEFORE the condition node in the orchestration flow</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Match exact field names from node outputs (case-sensitive)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>Test with literal values first: use <code className="bg-slate-200 px-1 rounded">Premium</code> instead of variables initially</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-600 mt-0.5">✓</span>
                <span>For numbers, don't use quotes: <code className="bg-slate-200 px-1 rounded">1000</code> not <code className="bg-slate-200 px-1 rounded">"1000"</code></span>
              </li>
            </ul>
          </div>

          {/* Important Notes */}
          <div className="bg-amber-50 border border-amber-200 rounded p-2">
            <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-1">
              <span>⚠️</span> Important Notes
            </h4>
            <ul className="space-y-1 text-xs text-amber-800">
              <li>• The system automatically resolves variable paths during execution</li>
              <li>• If a variable doesn't exist, the condition evaluates to false</li>
              <li>• Condition evaluation is left-to-right (no parentheses grouping)</li>
              <li>• Node labels in the designer don't affect variable names</li>
            </ul>
          </div>

        </div>
      </details>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      {/* Conditions List */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-700">
            Conditions <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addCondition}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
          >
            <Plus className="h-3 w-3" />
            Add Condition
          </button>
        </div>

        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <div key={index}>
              {/* Condition Card */}
              <div className="border border-slate-200 rounded-lg p-3 space-y-3 bg-slate-50">
                {/* Condition Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-600">Condition {index + 1}</span>
                  {conditions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCondition(index)}
                      className="text-red-600 hover:text-red-700"
                      title="Remove condition"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Variable (Left Value) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Variable <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                    value={condition.variable || ""}
                    onChange={(e) => updateCondition(index, "variable", e.target.value)}
                    placeholder="{{variableName}} or literal value"
                  />
                </div>

                {/* Operator */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Operator <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                    value={condition.operator || "equals"}
                    onChange={(e) => updateCondition(index, "operator", e.target.value)}
                  >
                    <option value="equals">Equals (=)</option>
                    <option value="not_equals">Not Equals (≠)</option>
                    <option value="greater_than">Greater Than (&gt;)</option>
                    <option value="less_than">Less Than (&lt;)</option>
                    <option value="greater_or_equal">Greater or Equal (≥)</option>
                    <option value="less_or_equal">Less or Equal (≤)</option>
                    <option value="contains">Contains</option>
                    <option value="not_contains">Not Contains</option>
                    <option value="contains_any">Contains Any (OR)</option>
                    <option value="contains_all">Contains All (AND)</option>
                    <option value="not_contains_any">Not Contains Any</option>
                    <option value="starts_with">Starts With</option>
                    <option value="ends_with">Ends With</option>
                    <option value="exists">Exists (not null)</option>
                    <option value="not_exists">Not Exists (null)</option>
                    <option value="empty">Empty</option>
                    <option value="not_empty">Not Empty</option>
                  </select>
                </div>

                {/* Value (Right Value) - Hidden for certain operators */}
                {!["exists", "not_exists", "empty", "not_empty"].includes(condition.operator) && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Value <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
                      value={condition.value || ""}
                      onChange={(e) => updateCondition(index, "value", e.target.value)}
                      placeholder={["contains_any", "contains_all", "not_contains_any"].includes(condition.operator) ? "gautam,baruah,john" : "{{variableName}} or literal value"}
                    />
                    {/* Help text for multi-value operators */}
                    {["contains_any", "contains_all", "not_contains_any"].includes(condition.operator) && (
                      <p className="mt-1 text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">
                        <span className="font-semibold text-blue-900">💡 Tip:</span> Separate multiple values with commas. 
                        {condition.operator === "contains_any" && "Returns TRUE if ANY value is found."}
                        {condition.operator === "contains_all" && "Returns TRUE only if ALL values are found."}
                        {condition.operator === "not_contains_any" && "Returns TRUE if NONE of the values are found."}
                      </p>
                    )}
                  </div>
                )}

                {/* Case Sensitive Checkbox - Show for string comparison operators */}
                {["equals", "not_equals", "contains", "not_contains", "contains_any", "contains_all", "not_contains_any", "starts_with", "ends_with"].includes(condition.operator) && (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`caseSensitive_${index}`}
                      checked={condition.caseSensitive === true}
                      onChange={(e) => updateCondition(index, "caseSensitive", e.target.checked)}
                      className="h-3.5 w-3.5"
                    />
                    <label htmlFor={`caseSensitive_${index}`} className="text-xs text-slate-600">
                      Case sensitive
                    </label>
                  </div>
                )}
              </div>

              {/* Logic Operator (between current and next condition) */}
              {index < conditions.length - 1 && (
                <div className="flex items-center justify-center py-2">
                  <select
                    className="rounded border-2 border-slate-400 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:ring-2 focus:ring-blue-500 shadow-sm"
                    value={condition.logicAfter || "and"}
                    onChange={(e) => updateCondition(index, "logicAfter", e.target.value)}
                  >
                    <option value="and">AND (&&)</option>
                    <option value="or">OR (||)</option>
                  </select>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Expression Preview */}
      {conditions.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-900 mb-1">Expression Preview:</p>
          <p className="text-xs text-blue-800 font-mono">
            {conditions.map((c, i) => (
              <span key={i}>
                <span className="text-blue-600">{c.variable || "?"}</span>
                {" "}<span className="text-slate-600">{c.operator}</span>{" "}
                {!["exists", "not_exists", "empty", "not_empty"].includes(c.operator) && (
                  <span className="text-blue-600">{c.value || "?"}</span>
                )}
                {i < conditions.length - 1 && (
                  <span className="text-purple-600 font-bold"> {(c.logicAfter || "and").toUpperCase()} </span>
                )}
              </span>
            ))}
          </p>
        </div>
      )}
      </div>
    </div>
  );
}

function SwitchConfig({ config, updateConfig, edges, currentNode }: any) {
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const defaultIsConnected = edges.some(
    (edge: Edge) => edge.source === currentNode.id && edge.sourceHandle === "default"
  );
  const unaryOperators = ["exists", "not_exists", "empty", "not_empty"];
  const stringOperators = ["equals", "not_equals", "contains", "not_contains", "contains_any", "contains_all", "not_contains_any"];

  useEffect(() => {
    if (!Array.isArray(config.routes) || config.routes.length === 0) {
      updateConfig({
        type: "switch",
        variable: config.variable || "",
        routes: [{
          id: `route-${Date.now()}`,
          name: "",
          operator: "equals",
          value: "",
          valueType: "auto",
          caseSensitive: false,
        }],
      });
    }
    // Seed defaults only once; subsequent edits are driven by the controls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateRoute(index: number, patch: Record<string, unknown>) {
    updateConfig({
      routes: routes.map((route: Record<string, unknown>, routeIndex: number) =>
        routeIndex === index ? { ...route, ...patch } : route
      ),
    });
  }

  function addRoute() {
    updateConfig({
      routes: [
        ...routes,
        {
          id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: "",
          operator: "equals",
          value: "",
          valueType: "auto",
          caseSensitive: false,
        },
      ],
    });
  }

  function moveRoute(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= routes.length) return;
    const next = [...routes];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    updateConfig({ routes: next });
  }

  function routeIsConnected(routeId: string) {
    return edges.some((edge: Edge) => edge.source === currentNode.id && edge.sourceHandle === routeId);
  }

  function removeRoute(index: number) {
    const route = routes[index];
    if (!route || routeIsConnected(String(route.id))) return;
    updateConfig({ routes: routes.filter((_: unknown, routeIndex: number) => routeIndex !== index) });
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
        <details className="rounded-lg border border-slate-300 bg-white">
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            How to use Switch / Router
          </summary>
          <div className="space-y-4 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
              <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                <p className="font-semibold">First-match routing</p>
                <p className="mt-1 leading-5">
                  Routes are evaluated from top to bottom. Only the first matching route runs. If none match, the workflow follows the Default output.
                </p>
              </div>

              <div>
                <p className="font-semibold text-slate-800">What this node does</p>
                <p className="mt-1 leading-5">
                  Switch / Router reads one value and sends the workflow through one named output. It is useful when a status, category, document type, response code, or number can lead to several different actions.
                </p>
              </div>

              <div className="rounded border border-blue-200 bg-blue-50 p-2.5">
                <p className="font-semibold text-blue-900">Condition or Switch?</p>
                <ul className="mt-1 space-y-1 text-blue-800">
                  <li><strong>Condition:</strong> a yes/no decision, such as “Amount greater than 1,000?”</li>
                  <li><strong>Switch:</strong> three or more outcomes from one value, such as Draft, Submitted, Approved, or Rejected.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-800">How to configure it</p>
                <ol className="mt-1 list-decimal space-y-1 pl-4 leading-5">
                  <li>Enter the value to inspect, for example <code className="rounded bg-slate-200 px-1">{"{{invoice.status}}"}</code>.</li>
                  <li>Add one route for each expected outcome.</li>
                  <li>Order specific routes before broader routes because the first match wins.</li>
                  <li>Connect every named output and the Default output to the appropriate next node.</li>
                </ol>
              </div>

              <div>
                <p className="font-semibold text-slate-800">Example 1: Invoice status</p>
                <div className="mt-1 rounded border border-slate-200 bg-white p-2 font-mono leading-5">
                  <div>Value: {"{{invoice.status}}"}</div>
                  <div>Draft → Request completion</div>
                  <div>Submitted → Begin approval</div>
                  <div>Approved → Schedule payment</div>
                  <div>Rejected → Notify requester</div>
                  <div>Default → Manual review</div>
                </div>
              </div>

              <div>
                <p className="font-semibold text-slate-800">Example 2: Risk score</p>
                <div className="mt-1 rounded border border-slate-200 bg-white p-2 font-mono leading-5">
                  <div>Value: {"{{assessment.riskScore}}"}</div>
                  <div>High risk: greater than 70</div>
                  <div>Medium risk: greater than 30</div>
                  <div>Default: 0–30 / unexpected values</div>
                </div>
                <p className="mt-1 leading-5">
                  The High-risk route must come first. If “greater than 30” came first, a score of 90 would take that broader route and evaluation would stop.
                </p>
              </div>

              <div className="rounded border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                <p className="font-semibold">Default is the safety net</p>
                <p className="mt-1 leading-5">
                  Default runs when no route matches, including unexpected new values. Connect it to manual review, a notification, or a safe ending so executions do not stop without an intended outcome.
                </p>
              </div>
          </div>
        </details>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">
            Value or variable <span className="text-red-500">*</span>
          </label>
          <input
            className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-4 focus:ring-slate-900/10"
            onChange={(event) => updateConfig({ type: "switch", variable: event.target.value })}
            placeholder="{{variables.status}}"
            type="text"
            value={config.variable || ""}
          />
          <p className="mt-1 text-xs text-slate-500">Use a context expression or a literal value.</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Always available</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">Default</span>
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${defaultIsConnected ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {defaultIsConnected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">Used when no named route matches.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Routes</h4>
          <p className="text-xs text-slate-500">Drag connections from the matching named outputs on the node.</p>
        </div>
        <div>
          <button className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700" onClick={addRoute} type="button">
            <Plus className="h-3.5 w-3.5" />
            Add Route
          </button>
        </div>

        <div className="space-y-3">
          {routes.map((route: any, index: number) => {
            const connected = routeIsConnected(String(route.id));
            return (
              <details className="rounded-lg border border-slate-200 bg-slate-50" key={route.id}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-3 [&::-webkit-details-marker]:hidden">
                  <span className="text-xs font-semibold text-slate-600">
                    {String(route.name || "").trim() || `Route ${index + 1}`}
                  </span>
                  <div className="flex items-center gap-1">
                    <button aria-label="Move route up" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs text-slate-600 disabled:opacity-30" disabled={index === 0} onClick={(event) => { event.preventDefault(); moveRoute(index, -1); }} type="button">↑</button>
                    <button aria-label="Move route down" className="h-7 w-7 rounded border border-slate-200 bg-white text-xs text-slate-600 disabled:opacity-30" disabled={index === routes.length - 1} onClick={(event) => { event.preventDefault(); moveRoute(index, 1); }} type="button">↓</button>
                    <button
                      aria-label="Remove route"
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-200 bg-white text-red-600 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={connected}
                      onClick={(event) => { event.preventDefault(); removeRoute(index); }}
                      title={connected ? "Disconnect this route before removing it." : "Remove route"}
                      type="button"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </summary>

                <div className="grid gap-3 border-t border-slate-200 p-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Route name <span className="text-red-500">*</span></label>
                    <input className="h-9 w-full rounded border border-slate-300 px-2 text-sm" onChange={(event) => updateRoute(index, { name: event.target.value })} placeholder={`Route ${index + 1}`} type="text" value={route.name || ""} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Operator <span className="text-red-500">*</span></label>
                    <select className="h-9 w-full rounded border border-slate-300 px-2 text-sm" onChange={(event) => updateRoute(index, { operator: event.target.value })} value={route.operator || "equals"}>
                      <option value="equals">Equals (=)</option>
                      <option value="not_equals">Not Equals (≠)</option>
                      <option value="greater_than">Greater Than (&gt;)</option>
                      <option value="less_than">Less Than (&lt;)</option>
                      <option value="contains">Contains</option>
                      <option value="not_contains">Not Contains</option>
                      <option value="contains_any">Contains Any</option>
                      <option value="contains_all">Contains All</option>
                      <option value="not_contains_any">Not Contains Any</option>
                      <option value="exists">Exists</option>
                      <option value="not_exists">Does Not Exist</option>
                      <option value="empty">Is Empty</option>
                      <option value="not_empty">Is Not Empty</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Value type</label>
                    <select className="h-9 w-full rounded border border-slate-300 px-2 text-sm" onChange={(event) => updateRoute(index, { valueType: event.target.value })} value={route.valueType || "auto"}>
                      <option value="auto">Automatic</option>
                      <option value="text">Text</option>
                      <option value="number">Number</option>
                      <option value="boolean">Boolean</option>
                    </select>
                  </div>
                {!unaryOperators.includes(route.operator) ? (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Comparison value <span className="text-red-500">*</span></label>
                    <input
                      className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
                      onChange={(event) => updateRoute(index, { value: event.target.value })}
                      placeholder={["contains_any", "contains_all", "not_contains_any"].includes(route.operator) ? "value one, value two" : "approved"}
                      type="text"
                      value={route.value ?? ""}
                    />
                  </div>
                ) : null}

                {stringOperators.includes(route.operator) ? (
                  <label className="mt-3 inline-flex items-center gap-2 text-xs text-slate-600">
                    <input checked={route.caseSensitive === true} className="h-3.5 w-3.5 rounded border-slate-300" onChange={(event) => updateRoute(index, { caseSensitive: event.target.checked })} type="checkbox" />
                    Case sensitive
                  </label>
                ) : null}
                {connected ? <p className="mt-2 text-xs text-slate-500">Connected route; disconnect it before removal.</p> : null}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HumanApprovalConfig({ config, updateConfig }: any) {
  const [fields, setFields] = useState<Array<{ label: string; value: string; defaultValue?: string }>>(
    config.fields || []
  );

  useEffect(() => {
    updateConfig({ fields });
  }, [fields]);

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      title: config.title || "",
      description: config.description || "",
      approverEmail: config.approverEmail || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.title || ""}
          onChange={(e) => updateConfig({ title: e.target.value })}
          placeholder="Approval title"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={config.description || ""}
          onChange={(e) => updateConfig({ description: e.target.value })}
          placeholder="Detailed description for approver"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Approver Email <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.approverEmail || ""}
          onChange={(e) => updateConfig({ approverEmail: e.target.value })}
          placeholder="user@example.com or {{variableName}}"
        />
        <p className="mt-1 text-xs text-slate-500">Email address or {'{{variable}}'}</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">Approval Fields</label>
        <div className="space-y-2">
          {fields.map((field, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-2 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
                  placeholder="Field label"
                  value={field.label}
                  onChange={(e) => {
                    const updated = [...fields];
                    updated[index].label = e.target.value;
                    setFields(updated);
                  }}
                />
                <button
                  type="button"
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  onClick={() => setFields(fields.filter((_, i) => i !== index))}
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                placeholder="Value ({{variable}} or literal)"
                value={field.value}
                onChange={(e) => {
                  const updated = [...fields];
                  updated[index].value = e.target.value;
                  setFields(updated);
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
            onClick={() => setFields([...fields, { label: "", value: "" }])}
          >
            <Plus className="h-4 w-4" />
            Add Field
          </button>
        </div>
      </div>
    </div>
  );
}

function NotificationConfig({ config, updateConfig, companyId, targetAppId }: any) {
  const channelMeta: Array<{ key: string; label: string; summary: string }> = [
    { key: "email", label: "Email", summary: "Structured email notifications" },
    { key: "internal", label: "Internal Notification", summary: "In-app alerts for users and roles" },
    { key: "teams", label: "Microsoft Teams", summary: "Channel messages and mentions" },
    { key: "slack", label: "Slack", summary: "Workspace/channel or DM notifications" },
    { key: "sms", label: "SMS", summary: "Short message delivery with segment estimation" },
    { key: "whatsapp", label: "WhatsApp", summary: "Template or session message delivery" },
  ];

  const variableTokens = [
    "{{trigger.id}}",
    "{{trigger.timestamp}}",
    "{{variables.status}}",
    "{{variables.referenceId}}",
    "{{workflow.currentNode}}",
  ];

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [testState, setTestState] = useState<Record<string, { loading: boolean; status: "idle" | "success" | "error"; message: string }>>({});
  const [senderProviders, setSenderProviders] = useState<Array<{ id: string; provider: string; name: string; from_name: string | null; from_email: string }>>([]);

  useEffect(() => {
    let active = true;

    const loadSenderProviders = async () => {
      if (!companyId || !targetAppId) {
        if (active) setSenderProviders([]);
        return;
      }

      try {
        const params = new URLSearchParams({
          companyId: String(companyId),
          targetAppId: String(targetAppId),
          activeOnly: "true",
        });
        const response = await fetch(`/api/orchestrations/email-sender-credentials?${params.toString()}`);
        if (!response.ok) return;
        const payload = await response.json();
        const items = Array.isArray(payload?.credentials) ? payload.credentials : [];

        if (active) {
          setSenderProviders(
            items.map((item: any) => ({
              id: String(item.id),
              provider: String(item.provider || "smtp"),
              name: String(item.name || ""),
              from_name: item.from_name ? String(item.from_name) : null,
              from_email: String(item.from_email || ""),
            }))
          );
        }
      } catch {
        if (active) setSenderProviders([]);
      }
    };

    void loadSenderProviders();

    return () => {
      active = false;
    };
  }, [companyId, targetAppId]);

  useEffect(() => {
    const selectedId = String(config?.channels?.email?.senderCredentialId || "");
    const currentFromName = String(config?.channels?.email?.fromName || "").trim();
    if (!selectedId || currentFromName) {
      return;
    }

    const selectedProvider = senderProviders.find((provider) => provider.id === selectedId);
    if (!selectedProvider) {
      return;
    }

    const autoFromName = selectedProvider.from_name || selectedProvider.name || "";
    if (!autoFromName) {
      return;
    }

    updateConfig({
      channels: {
        ...(config.channels || {}),
        email: {
          ...(config.channels?.email || {}),
          fromName: autoFromName,
        },
      },
    });
  }, [config.channels, config?.channels?.email?.fromName, config?.channels?.email?.senderCredentialId, senderProviders, updateConfig]);

  useEffect(() => {
    if (config.channels) return;

    const defaults: Record<string, any> = {
      email: {
        enabled: config.channel === "email",
        senderCredentialId: "",
        fromName: "",
        to: config.channel === "email" ? (config.recipient || "") : "",
        cc: "",
        bcc: "",
        subject: config.channel === "email" ? (config.subject || "") : "",
        body: config.channel === "email" ? (config.message || "") : "",
        bodyFormat: "rich_text",
        attachments: [],
        priority: "normal",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
      internal: {
        enabled: config.channel === "internal",
        users: config.channel === "internal" ? (config.recipient || "") : "",
        roles: "",
        teams: "",
        groups: "",
        title: config.channel === "internal" ? (config.subject || "") : "",
        message: config.channel === "internal" ? (config.message || "") : "",
        notificationType: "information",
        actionLabel: "",
        actionUrl: "",
        expiryDate: "",
        persistentUntilRead: false,
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 1 },
      },
      teams: {
        enabled: config.channel === "teams",
        mentions: "",
        title: config.channel === "teams" ? (config.subject || "") : "",
        message: config.channel === "teams" ? (config.message || "") : "",
        messageFormat: "adaptive_card",
        actionButtons: [],
        webhookUrl: config.channel === "teams" ? (config.recipient || "") : "",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
      slack: {
        enabled: config.channel === "slack",
        mentions: "",
        message: config.channel === "slack" ? (config.message || "") : "",
        messageFormat: "plain_text",
        actionButtons: [],
        threadTs: "",
        webhookUrl: config.channel === "slack" ? (config.recipient || "") : "",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
      sms: {
        enabled: false,
        senderId: "",
        recipients: "",
        message: "",
        template: "",
        unicodeSupport: false,
        webhookUrl: "",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
      whatsapp: {
        enabled: false,
        businessAccount: "",
        senderNumber: "",
        recipients: "",
        messageType: "session_message",
        templateName: "",
        templateLanguage: "",
        templateVariables: "",
        body: "",
        mediaAttachment: "",
        interactiveButtons: [],
        webhookUrl: "",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
    };

    updateConfig({ channels: defaults });
  }, [config.channels, config.channel, config.message, config.recipient, config.subject, updateConfig]);

  const channels = config.channels || {};

  const setChannel = (key: string, updates: Record<string, any>) => {
    updateConfig({
      channels: {
        ...channels,
        [key]: {
          ...(channels[key] || {}),
          ...updates,
        },
      },
    });
  };

  const setChannelNested = (key: string, nestedKey: string, updates: Record<string, any>) => {
    const current = channels[key] || {};
    setChannel(key, {
      [nestedKey]: {
        ...(current[nestedKey] || {}),
        ...updates,
      },
    });
  };

  const appendVariable = (key: string, field: string, token: string) => {
    const existing = String(channels[key]?.[field] || "");
    const spacer = existing && !existing.endsWith(" ") ? " " : "";
    setChannel(key, { [field]: `${existing}${spacer}${token}` });
  };

  const addListItem = (key: string, field: string, item: Record<string, any>) => {
    const current = Array.isArray(channels[key]?.[field]) ? channels[key][field] : [];
    setChannel(key, { [field]: [...current, item] });
  };

  const updateListItem = (key: string, field: string, index: number, updates: Record<string, any>) => {
    const current = Array.isArray(channels[key]?.[field]) ? [...channels[key][field]] : [];
    current[index] = { ...(current[index] || {}), ...updates };
    setChannel(key, { [field]: current });
  };

  const removeListItem = (key: string, field: string, index: number) => {
    const current = Array.isArray(channels[key]?.[field]) ? [...channels[key][field]] : [];
    setChannel(key, { [field]: current.filter((_: any, i: number) => i !== index) });
  };

  const enabledChannels = channelMeta.filter((entry) => channels?.[entry.key]?.enabled);

  const smsMessage = String(channels.sms?.message || "");
  const smsUnicode = channels.sms?.unicodeSupport === true;
  const smsSingleLimit = smsUnicode ? 70 : 160;
  const smsConcatLimit = smsUnicode ? 67 : 153;
  const smsSegments =
    smsMessage.length === 0
      ? 0
      : smsMessage.length <= smsSingleLimit
      ? 1
      : Math.ceil(smsMessage.length / smsConcatLimit);

  const getError = (condition: boolean, text: string) => (condition ? text : "");

  const channelErrors = {
    email: {
      senderCredentialId: getError(channels.email?.enabled && !String(channels.email?.senderCredentialId || "").trim(), "Sender provider is required"),
      to: getError(channels.email?.enabled && !String(channels.email?.to || "").trim(), "To recipients are required"),
      subject: getError(channels.email?.enabled && !String(channels.email?.subject || "").trim(), "Subject is required"),
      body: getError(channels.email?.enabled && !String(channels.email?.body || "").trim(), "Message body is required"),
    },
    internal: {
      recipients: getError(
        channels.internal?.enabled &&
          !String(channels.internal?.users || "").trim() &&
          !String(channels.internal?.roles || "").trim() &&
          !String(channels.internal?.teams || "").trim() &&
          !String(channels.internal?.groups || "").trim(),
        "At least one recipient target is required"
      ),
      title: getError(channels.internal?.enabled && !String(channels.internal?.title || "").trim(), "Title is required"),
      message: getError(channels.internal?.enabled && !String(channels.internal?.message || "").trim(), "Message is required"),
    },
    teams: {
      message: getError(channels.teams?.enabled && !String(channels.teams?.message || "").trim(), "Message is required"),
      webhook: getError(
        channels.teams?.enabled && !String(channels.teams?.webhookUrl || "").trim(),
        "Webhook URL is required"
      ),
    },
    slack: {
      message: getError(channels.slack?.enabled && !String(channels.slack?.message || "").trim(), "Message is required"),
      webhook: getError(
        channels.slack?.enabled && !String(channels.slack?.webhookUrl || "").trim(),
        "Webhook URL is required"
      ),
    },
    sms: {
      recipients: getError(channels.sms?.enabled && !String(channels.sms?.recipients || "").trim(), "Recipient phone numbers are required"),
      message: getError(channels.sms?.enabled && !String(channels.sms?.message || "").trim(), "Message is required"),
    },
    whatsapp: {
      recipients: getError(channels.whatsapp?.enabled && !String(channels.whatsapp?.recipients || "").trim(), "Recipient phone numbers are required"),
      template: getError(
        channels.whatsapp?.enabled &&
          channels.whatsapp?.messageType === "approved_template" &&
          !String(channels.whatsapp?.templateName || "").trim(),
        "Template name is required for approved template mode"
      ),
      body: getError(
        channels.whatsapp?.enabled &&
          channels.whatsapp?.messageType !== "approved_template" &&
          !String(channels.whatsapp?.body || "").trim(),
        "Message body is required for session message mode"
      ),
    },
  };

  const handleTestSend = async (channelKey: string) => {
    const channelConfig = channels[channelKey] || {};
    setTestState((prev) => ({
      ...prev,
      [channelKey]: { loading: true, status: "idle", message: "Sending test notification..." },
    }));

    try {
      const response = await fetch("/api/admin/orchestrations/test-notification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          config: {
            type: "notification",
            channels: {
              [channelKey]: {
                ...channelConfig,
                enabled: true,
              },
            },
          },
          context: {
            testMode: true,
            companyId: companyId || null,
            targetAppId: targetAppId || null,
            trigger: { id: "test-trigger", timestamp: new Date().toISOString() },
            variables: { status: "test", referenceId: "TEST-001" },
            workflow: { currentNode: "notification" },
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload?.result?.success === false) {
        throw new Error(payload?.result?.error || payload?.error || payload?.message || "Test send failed");
      }

      setTestState((prev) => ({
        ...prev,
        [channelKey]: { loading: false, status: "success", message: "Test notification sent successfully" },
      }));
    } catch (error) {
      setTestState((prev) => ({
        ...prev,
        [channelKey]: {
          loading: false,
          status: "error",
          message: error instanceof Error ? error.message : "Test send failed",
        },
      }));
    }
  };

  const renderVariableButtons = (channelKey: string, field: string) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {variableTokens.map((token) => (
        <button
          key={token}
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50"
          onClick={() => appendVariable(channelKey, field, token)}
        >
          {token}
        </button>
      ))}
    </div>
  );

  const renderDeliveryAndRetry = (channelKey: string) => {
    const channel = channels[channelKey] || {};
    const retriesEnabled = channel.retry?.enabled !== false;
    return (
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery mode</label>
          <select
            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            value={channel.delivery?.mode || "immediate"}
            onChange={(e) => setChannelNested(channelKey, "delivery", { mode: e.target.value })}
          >
            <option value="immediate">Immediate</option>
            <option value="scheduled">Scheduled</option>
          </select>
        </div>
        {channel.delivery?.mode === "scheduled" && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Scheduled at</label>
            <input
              type="datetime-local"
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
              value={channel.delivery?.scheduledAt || ""}
              onChange={(e) => setChannelNested(channelKey, "delivery", { scheduledAt: e.target.value })}
            />
          </div>
        )}
        <label className="flex h-9 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3" htmlFor={`${channelKey}-retry-enabled`}>
          <input
            id={`${channelKey}-retry-enabled`}
            type="checkbox"
            className="h-4 w-4 shrink-0 rounded border-slate-300"
            checked={retriesEnabled}
            onChange={(e) => setChannelNested(channelKey, "retry", { enabled: e.target.checked })}
          />
          <span className="truncate text-xs font-medium text-slate-700" title="Enable retries">Enable retries</span>
        </label>
        {retriesEnabled && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block truncate text-xs font-semibold text-slate-700" title="Max attempts">Max attempts</label>
              <input
                type="number"
                min={1}
                max={10}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={channel.retry?.maxAttempts ?? 2}
                onChange={(e) => setChannelNested(channelKey, "retry", { maxAttempts: Number(e.target.value || 2) })}
              />
            </div>
            <div>
              <label className="mb-1 block truncate text-xs font-semibold text-slate-700" title="Retry delay (seconds)">Retry delay (sec)</label>
              <input
                type="number"
                min={0}
                max={300}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                value={channel.retry?.delaySeconds ?? 2}
                onChange={(e) => setChannelNested(channelKey, "retry", { delaySeconds: Number(e.target.value || 0) })}
              />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-sm font-semibold text-slate-800">Enabled channels summary</p>
        {enabledChannels.length === 0 ? (
          <p className="mt-1 text-xs text-amber-700">No channels enabled yet. Expand a panel and enable at least one channel.</p>
        ) : (
          <div className="mt-2 space-y-1 text-xs text-slate-700">
            {enabledChannels.map((entry) => (
              <div key={entry.key} className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1">
                <span className="font-semibold">{entry.label}</span>
                <span className="text-slate-500 truncate max-w-[220px] text-right">
                  {entry.key === "email" && (channels.email?.to || "No recipients")}
                  {entry.key === "internal" && (channels.internal?.users || channels.internal?.roles || channels.internal?.teams || channels.internal?.groups || "No recipients")}
                  {entry.key === "teams" && (channels.teams?.webhookUrl || "No destination")}
                  {entry.key === "slack" && (channels.slack?.webhookUrl || "No destination")}
                  {entry.key === "sms" && (channels.sms?.recipients || "No recipients")}
                  {entry.key === "whatsapp" && (channels.whatsapp?.recipients || "No recipients")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      {channelMeta.map((entry) => {
        const channel = channels[entry.key] || {};
        const isOpen = !!expanded[entry.key];
        const isEnabled = channel.enabled === true;
        const state = testState[entry.key] || { loading: false, status: "idle", message: "" };

        return (
          <div key={entry.key} className="rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [entry.key]: !isOpen }))}
              className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 text-left hover:bg-slate-50"
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />}
              <div className="grid min-w-0 grid-cols-[minmax(72px,0.8fr)_minmax(0,1.4fr)] items-center gap-2">
                <span className="truncate text-sm font-semibold text-slate-900" title={entry.label}>{entry.label}</span>
                <span className="truncate text-xs text-slate-500" title={entry.summary}>{entry.summary}</span>
              </div>
              <span className={`shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${isEnabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {isEnabled ? "Enabled" : "Disabled"}
              </span>
            </button>

            {isOpen && (
              <div className="min-w-0 overflow-hidden border-t border-slate-200 px-3 py-3 space-y-3
                [&_*]:min-w-0 [&_.grid]:grid-cols-1 [&_.flex]:flex-wrap
                [&_input:not([type=checkbox])]:w-full [&_select]:w-full [&_textarea]:w-full
                [&_input]:max-w-full [&_select]:max-w-full [&_textarea]:max-w-full">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={isEnabled}
                      onChange={(e) => setChannel(entry.key, { enabled: e.target.checked })}
                      className="rounded border-slate-300"
                    />
                    Enable channel
                  </label>
                  <button
                    type="button"
                    className="rounded border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                    onClick={() => handleTestSend(entry.key)}
                    disabled={!isEnabled || state.loading}
                  >
                    {state.loading ? "Testing..." : "Test send"}
                  </button>
                </div>

                {state.status !== "idle" && (
                  <p className={`text-xs ${state.status === "success" ? "text-green-700" : "text-red-700"}`}>
                    {state.message}
                  </p>
                )}

                {entry.key === "email" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Sender provider <span className="text-red-500">*</span></label>
                      <select
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.email.senderCredentialId ? "border-red-400" : "border-slate-300"}`}
                        value={channel.senderCredentialId || ""}
                        onChange={(e) => {
                          const selectedId = e.target.value;
                          const selectedProvider = senderProviders.find((provider) => provider.id === selectedId);
                          const autoFromName = selectedProvider?.from_name || selectedProvider?.name || "";

                          setChannel("email", {
                            senderCredentialId: selectedId,
                            fromName: autoFromName,
                          });
                        }}
                      >
                        <option value="">Select active provider</option>
                        {senderProviders.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.provider.toUpperCase()} - {provider.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Active sender providers scoped to this target app.</p>
                      {channelErrors.email.senderCredentialId && <p className="mt-1 text-xs text-red-600">{channelErrors.email.senderCredentialId}</p>}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">From name</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.fromName || ""}
                        onChange={(e) => setChannel("email", { fromName: e.target.value })}
                        placeholder="Scout Notifications"
                      />
                      <p className="mt-1 text-xs text-slate-500">Auto-filled from selected provider; you can override it.</p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">To recipients <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.email.to ? "border-red-400" : "border-slate-300"}`}
                        rows={2}
                        value={channel.to || ""}
                        onChange={(e) => setChannel("email", { to: e.target.value })}
                        placeholder="user@example.com, {{variables.ownerEmail}}"
                      />
                      {channelErrors.email.to && <p className="mt-1 text-xs text-red-600">{channelErrors.email.to}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">CC</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.cc || ""}
                        onChange={(e) => setChannel("email", { cc: e.target.value })}
                        placeholder="optional"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">BCC</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.bcc || ""}
                        onChange={(e) => setChannel("email", { bcc: e.target.value })}
                        placeholder="optional"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Subject <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.email.subject ? "border-red-400" : "border-slate-300"}`}
                        value={channel.subject || ""}
                        onChange={(e) => setChannel("email", { subject: e.target.value })}
                        placeholder="Status update for {{variables.referenceId}}"
                      />
                      {channelErrors.email.subject && <p className="mt-1 text-xs text-red-600">{channelErrors.email.subject}</p>}
                      {renderVariableButtons("email", "subject")}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message body <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.email.body ? "border-red-400" : "border-slate-300"}`}
                        rows={2}
                        value={channel.body || ""}
                        onChange={(e) => setChannel("email", { body: e.target.value })}
                        placeholder="Use variables like {{variables.referenceId}} and {{trigger.timestamp}}"
                      />
                      {channelErrors.email.body && <p className="mt-1 text-xs text-red-600">{channelErrors.email.body}</p>}
                      {renderVariableButtons("email", "body")}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Body format</label>
                        <select
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.bodyFormat || "rich_text"}
                          onChange={(e) => setChannel("email", { bodyFormat: e.target.value })}
                        >
                          <option value="rich_text">Rich text</option>
                          <option value="plain_text">Plain text</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Priority</label>
                        <select
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.priority || "normal"}
                          onChange={(e) => setChannel("email", { priority: e.target.value })}
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">Attachments</label>
                        <button
                          type="button"
                          className="text-xs text-blue-700 hover:text-blue-800"
                          onClick={() => addListItem("email", "attachments", { name: "", url: "", contentType: "" })}
                        >
                          Add attachment
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(channel.attachments) ? channel.attachments : []).map((attachment: any, index: number) => (
                          <div key={index} className="rounded border border-slate-200 p-2 bg-slate-50 space-y-2">
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
                              <input
                                type="text"
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="invoice.pdf"
                                value={attachment.name || ""}
                                onChange={(e) => updateListItem("email", "attachments", index, { name: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">URL</label>
                              <input
                                type="text"
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="https://..."
                                value={attachment.url || ""}
                                onChange={(e) => updateListItem("email", "attachments", index, { url: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Content type</label>
                              <input
                                type="text"
                                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="application/pdf"
                                value={attachment.contentType || ""}
                                onChange={(e) => updateListItem("email", "attachments", index, { contentType: e.target.value })}
                              />
                            </div>
                            <button
                              type="button"
                              className="text-xs text-red-600 hover:text-red-700"
                              onClick={() => removeListItem("email", "attachments", index)}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderDeliveryAndRetry("email")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Use comma-separated recipients for To, CC, and BCC. Rich text supports variable interpolation. Attachment URLs must be reachable by the server process.</p>
                    </details>
                  </div>
                )}

                {entry.key === "internal" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Users</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.users || ""}
                          onChange={(e) => setChannel("internal", { users: e.target.value })}
                          placeholder="emails or user IDs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Roles</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.roles || ""}
                          onChange={(e) => setChannel("internal", { roles: e.target.value })}
                          placeholder="role names or IDs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Teams</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.teams || ""}
                          onChange={(e) => setChannel("internal", { teams: e.target.value })}
                          placeholder="team names or IDs"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Groups</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.groups || ""}
                          onChange={(e) => setChannel("internal", { groups: e.target.value })}
                          placeholder="group names or IDs"
                        />
                      </div>
                    </div>
                    {channelErrors.internal.recipients && <p className="text-xs text-red-600">{channelErrors.internal.recipients}</p>}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.internal.title ? "border-red-400" : "border-slate-300"}`}
                        value={channel.title || ""}
                        onChange={(e) => setChannel("internal", { title: e.target.value })}
                        placeholder="Approval required"
                      />
                      {channelErrors.internal.title && <p className="mt-1 text-xs text-red-600">{channelErrors.internal.title}</p>}
                      {renderVariableButtons("internal", "title")}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.internal.message ? "border-red-400" : "border-slate-300"}`}
                        rows={4}
                        value={channel.message || ""}
                        onChange={(e) => setChannel("internal", { message: e.target.value })}
                        placeholder="You have a new approval request"
                      />
                      {channelErrors.internal.message && <p className="mt-1 text-xs text-red-600">{channelErrors.internal.message}</p>}
                      {renderVariableButtons("internal", "message")}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Notification type</label>
                        <select
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.notificationType || "information"}
                          onChange={(e) => setChannel("internal", { notificationType: e.target.value })}
                        >
                          <option value="information">Information</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Expiry date</label>
                        <input
                          type="datetime-local"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.expiryDate || ""}
                          onChange={(e) => setChannel("internal", { expiryDate: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Action label</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.actionLabel || ""}
                          onChange={(e) => setChannel("internal", { actionLabel: e.target.value })}
                          placeholder="Open request"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Action URL</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.actionUrl || ""}
                          onChange={(e) => setChannel("internal", { actionUrl: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={channel.persistentUntilRead === true}
                        onChange={(e) => setChannel("internal", { persistentUntilRead: e.target.checked })}
                      />
                      Mark as persistent until read
                    </label>

                    {renderDeliveryAndRetry("internal")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Users can be specified by UUID or email. Roles are resolved through active company role assignments. Teams/groups are resolved when membership tables exist.</p>
                    </details>
                  </div>
                )}

                {entry.key === "teams" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.teams.webhook ? "border-red-400" : "border-slate-300"}`}
                        value={channel.webhookUrl || ""}
                        onChange={(e) => setChannel("teams", { webhookUrl: e.target.value })}
                        placeholder="https://outlook.office.com/webhook/..."
                      />
                      <p className="mt-1 text-xs text-slate-500">Incoming webhook URL for the destination Teams channel. This is the only thing that determines where the message goes.</p>
                      {channelErrors.teams.webhook && <p className="mt-1 text-xs text-red-600">{channelErrors.teams.webhook}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Title</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.title || ""}
                        onChange={(e) => setChannel("teams", { title: e.target.value })}
                        placeholder="Workflow update"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.teams.message ? "border-red-400" : "border-slate-300"}`}
                        rows={4}
                        value={channel.message || ""}
                        onChange={(e) => setChannel("teams", { message: e.target.value })}
                        placeholder="Status for {{variables.referenceId}}"
                      />
                      {channelErrors.teams.message && <p className="mt-1 text-xs text-red-600">{channelErrors.teams.message}</p>}
                      {renderVariableButtons("teams", "message")}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Mentions</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.mentions || ""}
                          onChange={(e) => setChannel("teams", { mentions: e.target.value })}
                          placeholder="@ops-team, @john"
                        />
                        <p className="mt-1 text-xs text-slate-500">Prepended to the message text.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Message format</label>
                        <select
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.messageFormat || "adaptive_card"}
                          onChange={(e) => setChannel("teams", { messageFormat: e.target.value })}
                        >
                          <option value="adaptive_card">Adaptive Card</option>
                          <option value="plain_text">Plain text</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">Action buttons</label>
                        <button
                          type="button"
                          className="text-xs text-blue-700 hover:text-blue-800"
                          onClick={() => addListItem("teams", "actionButtons", { label: "", url: "" })}
                        >
                          Add button
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(channel.actionButtons) ? channel.actionButtons : []).map((button: any, index: number) => (
                          <div key={index} className="rounded border border-slate-200 p-2 bg-slate-50 flex gap-2">
                            <input
                              type="text"
                              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.label || ""}
                              onChange={(e) => updateListItem("teams", "actionButtons", index, { label: e.target.value })}
                              placeholder="Label"
                            />
                            <input
                              type="text"
                              className="flex-[2] rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.url || ""}
                              onChange={(e) => updateListItem("teams", "actionButtons", index, { url: e.target.value })}
                              placeholder="URL"
                            />
                            <button type="button" className="text-red-600 text-xs" onClick={() => removeListItem("teams", "actionButtons", index)}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderDeliveryAndRetry("teams")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Adaptive Card mode supports richer layout and action buttons. Use mentions for key recipients.</p>
                    </details>
                  </div>
                )}

                {entry.key === "slack" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.slack.webhook ? "border-red-400" : "border-slate-300"}`}
                        value={channel.webhookUrl || ""}
                        onChange={(e) => setChannel("slack", { webhookUrl: e.target.value })}
                        placeholder="https://hooks.slack.com/services/..."
                      />
                      <p className="mt-1 text-xs text-slate-500">Incoming webhook URL for the destination Slack channel. This is the only thing that determines where the message goes.</p>
                      {channelErrors.slack.webhook && <p className="mt-1 text-xs text-red-600">{channelErrors.slack.webhook}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.slack.message ? "border-red-400" : "border-slate-300"}`}
                        rows={4}
                        value={channel.message || ""}
                        onChange={(e) => setChannel("slack", { message: e.target.value })}
                        placeholder="Deployment for {{variables.referenceId}} completed"
                      />
                      {channelErrors.slack.message && <p className="mt-1 text-xs text-red-600">{channelErrors.slack.message}</p>}
                      {renderVariableButtons("slack", "message")}
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Mentions</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.mentions || ""}
                          onChange={(e) => setChannel("slack", { mentions: e.target.value })}
                          placeholder="@ops, <!here>"
                        />
                        <p className="mt-1 text-xs text-slate-500">Prepended to the message text.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Message format</label>
                        <select
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.messageFormat || "plain_text"}
                          onChange={(e) => setChannel("slack", { messageFormat: e.target.value })}
                        >
                          <option value="plain_text">Plain text</option>
                          <option value="block_kit">Block Kit</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">Action buttons</label>
                        <button
                          type="button"
                          className="text-xs text-blue-700 hover:text-blue-800"
                          onClick={() => addListItem("slack", "actionButtons", { label: "", url: "" })}
                        >
                          Add button
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(channel.actionButtons) ? channel.actionButtons : []).map((button: any, index: number) => (
                          <div key={index} className="rounded border border-slate-200 p-2 bg-slate-50 flex gap-2">
                            <input
                              type="text"
                              className="flex-1 rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.label || ""}
                              onChange={(e) => updateListItem("slack", "actionButtons", index, { label: e.target.value })}
                              placeholder="Label"
                            />
                            <input
                              type="text"
                              className="flex-[2] rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.url || ""}
                              onChange={(e) => updateListItem("slack", "actionButtons", index, { url: e.target.value })}
                              placeholder="URL"
                            />
                            <button type="button" className="text-red-600 text-xs" onClick={() => removeListItem("slack", "actionButtons", index)}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    <details className="rounded border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">Advanced options</summary>
                      <div className="mt-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Thread timestamp</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.threadTs || ""}
                          onChange={(e) => setChannel("slack", { threadTs: e.target.value })}
                          placeholder="1731106130.111900"
                        />
                        <p className="mt-1 text-xs text-slate-500">Reply within an existing thread instead of posting a new message.</p>
                      </div>
                    </details>

                    {renderDeliveryAndRetry("slack")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Block Kit mode is best for structured updates and action buttons. Use thread timestamp to reply in an existing thread when needed.</p>
                    </details>
                  </div>
                )}

                {entry.key === "sms" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Sender ID or number</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.senderId || ""}
                          onChange={(e) => setChannel("sms", { senderId: e.target.value })}
                          placeholder="SCOUT or +15550100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Template</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.template || ""}
                          onChange={(e) => setChannel("sms", { template: e.target.value })}
                          placeholder="template code"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Recipient phone numbers <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.sms.recipients ? "border-red-400" : "border-slate-300"}`}
                        rows={2}
                        value={channel.recipients || ""}
                        onChange={(e) => setChannel("sms", { recipients: e.target.value })}
                        placeholder="+15551234567, +15550987654"
                      />
                      {channelErrors.sms.recipients && <p className="mt-1 text-xs text-red-600">{channelErrors.sms.recipients}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.sms.message ? "border-red-400" : "border-slate-300"}`}
                        rows={4}
                        value={channel.message || ""}
                        onChange={(e) => setChannel("sms", { message: e.target.value })}
                        placeholder="Reference {{variables.referenceId}} is now complete"
                      />
                      {channelErrors.sms.message && <p className="mt-1 text-xs text-red-600">{channelErrors.sms.message}</p>}
                      {renderVariableButtons("sms", "message")}
                      <p className="mt-1 text-xs text-slate-500">Character count: {smsMessage.length} | Estimated segments: {smsSegments}</p>
                    </div>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300"
                        checked={channel.unicodeSupport === true}
                        onChange={(e) => setChannel("sms", { unicodeSupport: e.target.checked })}
                      />
                      Unicode support
                    </label>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.webhookUrl || ""}
                        onChange={(e) => setChannel("sms", { webhookUrl: e.target.value })}
                        placeholder="Uses NOTIFICATION_SMS_WEBHOOK_URL if blank"
                      />
                    </div>

                    {renderDeliveryAndRetry("sms")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">SMS segmentation changes for Unicode messages. Keep critical updates concise to reduce segment count and provider costs.</p>
                    </details>
                  </div>
                )}

                {entry.key === "whatsapp" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-2 items-end gap-3">
                      <div className="min-w-0">
                        <label className="mb-1 block h-5 truncate text-xs font-semibold leading-5 text-slate-700" title="Business account or sender number">Business account or sender number</label>
                        <input
                          type="text"
                          className="h-10 w-full min-w-0 rounded border border-slate-300 px-2 text-sm"
                          value={channel.businessAccount || channel.senderNumber || ""}
                          onChange={(e) => setChannel("whatsapp", { businessAccount: e.target.value, senderNumber: e.target.value })}
                          placeholder="WABA_ID or +15550100"
                        />
                      </div>
                      <div className="min-w-0">
                        <label className="mb-1 block h-5 truncate text-xs font-semibold leading-5 text-slate-700" title="Message type">Message type</label>
                        <select
                          className="h-10 w-full min-w-0 rounded border border-slate-300 px-2 text-sm"
                          value={channel.messageType || "session_message"}
                          onChange={(e) => setChannel("whatsapp", { messageType: e.target.value })}
                        >
                          <option value="approved_template">Approved template</option>
                          <option value="session_message">Session message</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Recipient phone numbers <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.whatsapp.recipients ? "border-red-400" : "border-slate-300"}`}
                        rows={2}
                        value={channel.recipients || ""}
                        onChange={(e) => setChannel("whatsapp", { recipients: e.target.value })}
                        placeholder="+15551234567"
                      />
                      {channelErrors.whatsapp.recipients && <p className="mt-1 text-xs text-red-600">{channelErrors.whatsapp.recipients}</p>}
                    </div>

                    {channel.messageType === "approved_template" ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Template name <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.whatsapp.template ? "border-red-400" : "border-slate-300"}`}
                            value={channel.templateName || ""}
                            onChange={(e) => setChannel("whatsapp", { templateName: e.target.value })}
                            placeholder="order_update"
                          />
                          {channelErrors.whatsapp.template && <p className="mt-1 text-xs text-red-600">{channelErrors.whatsapp.template}</p>}
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Language</label>
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.templateLanguage || "en"}
                            onChange={(e) => setChannel("whatsapp", { templateLanguage: e.target.value })}
                            placeholder="en"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Template variables</label>
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.templateVariables || ""}
                            onChange={(e) => setChannel("whatsapp", { templateVariables: e.target.value })}
                            placeholder="value1, value2"
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Message body <span className="text-red-500">*</span></label>
                        <textarea
                          className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.whatsapp.body ? "border-red-400" : "border-slate-300"}`}
                          rows={4}
                          value={channel.body || ""}
                          onChange={(e) => setChannel("whatsapp", { body: e.target.value })}
                          placeholder="Order {{variables.referenceId}} is ready"
                        />
                        {channelErrors.whatsapp.body && <p className="mt-1 text-xs text-red-600">{channelErrors.whatsapp.body}</p>}
                        {renderVariableButtons("whatsapp", "body")}
                      </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Media attachment</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.mediaAttachment || ""}
                          onChange={(e) => setChannel("whatsapp", { mediaAttachment: e.target.value })}
                          placeholder="https://..."
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.webhookUrl || ""}
                          onChange={(e) => setChannel("whatsapp", { webhookUrl: e.target.value })}
                          placeholder="Uses NOTIFICATION_WHATSAPP_WEBHOOK_URL if blank"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">Interactive buttons</label>
                        <button
                          type="button"
                          className="text-xs text-blue-700 hover:text-blue-800"
                          onClick={() => addListItem("whatsapp", "interactiveButtons", { label: "", actionType: "url", value: "" })}
                        >
                          Add button
                        </button>
                      </div>
                      <div className="space-y-2">
                        {(Array.isArray(channel.interactiveButtons) ? channel.interactiveButtons : []).map((button: any, index: number) => (
                          <div key={index} className="rounded border border-slate-200 p-2 bg-slate-50 grid grid-cols-1 gap-2 sm:grid-cols-4">
                            <input
                              type="text"
                              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.label || ""}
                              onChange={(e) => updateListItem("whatsapp", "interactiveButtons", index, { label: e.target.value })}
                              placeholder="Label"
                            />
                            <select
                              className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.actionType || "url"}
                              onChange={(e) => updateListItem("whatsapp", "interactiveButtons", index, { actionType: e.target.value })}
                            >
                              <option value="url">URL</option>
                              <option value="reply">Reply</option>
                            </select>
                            <input
                              type="text"
                              className="sm:col-span-2 rounded border border-slate-300 px-2 py-1.5 text-sm"
                              value={button.value || ""}
                              onChange={(e) => updateListItem("whatsapp", "interactiveButtons", index, { value: e.target.value })}
                              placeholder={button.actionType === "reply" ? "Reply payload" : "https://..."}
                            />
                            <button type="button" className="text-red-600 text-xs" onClick={() => removeListItem("whatsapp", "interactiveButtons", index)}>Remove</button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {renderDeliveryAndRetry("whatsapp")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Approved templates are required outside session windows. Session messages allow free-form body text. Interactive buttons can be URL or quick-reply style.</p>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function DataFormatterConfig({ config, updateConfig }: any) {
  const format = String(config.format || "pretty_json");
  const columns = Array.isArray(config.columns) ? config.columns.join(", ") : "";

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      inputVariablePath: String(config.inputVariablePath || ""),
      format: String(config.format || "pretty_json"),
      outputVariable: String(config.outputVariable || ""),
      columns: Array.isArray(config.columns) ? config.columns : [],
      customTemplate: String(config.customTemplate || ""),
      maxRows: Number(config.maxRows || 100),
      emptyText: String(config.emptyText ?? ""),
      nullText: String(config.nullText ?? ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-950">
        Convert structured data into reusable text, email-safe HTML, CSV, or JSON. Use the output variable in Notification, API Call, Variable, or End nodes.
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        For a rich-text email, select <strong>HTML Table</strong> and use {"{{formattedData}}"} in the Notification body. Cell values are HTML-escaped automatically.
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Input Variable Path <span className="text-red-500">*</span></label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={String(config.inputVariablePath || "")}
            onChange={(event) => updateConfig({ inputVariablePath: event.target.value })}
            placeholder="e.g., apiResult.parsedJson.rows"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Maximum Rows</label>
          <input
            type="number"
            min={1}
            max={1000}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={Number(config.maxRows || 100)}
            onChange={(event) => updateConfig({ maxRows: Number(event.target.value) || 100 })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Empty Result Text</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={String(config.emptyText ?? "")}
            onChange={(event) => updateConfig({ emptyText: event.target.value })}
            placeholder="No data available."
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Null Value Text</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={String(config.nullText ?? "")}
            onChange={(event) => updateConfig({ nullText: event.target.value })}
            placeholder="Blank"
          />
        </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Format <span className="text-red-500">*</span></label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={format}
          onChange={(event) => updateConfig({ format: event.target.value })}
        >
          <option value="pretty_json">Pretty JSON</option>
          <option value="html_table">HTML Table</option>
          <option value="plain_text_table">Plain-text Table</option>
          <option value="csv">CSV</option>
          <option value="key_value">Key/value List</option>
          <option value="custom_template">Custom Template</option>
        </select>
      </div>

      {["html_table", "plain_text_table", "csv"].includes(format) && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Columns</label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={columns}
            onChange={(event) => updateConfig({
              columns: event.target.value.split(",").map((item) => item.trim()).filter(Boolean),
            })}
            placeholder="Optional: name, status, created_at"
          />
          <p className="mt-1 text-xs text-slate-500">Comma-separated paths. Leave blank to infer columns from the data.</p>
        </div>
      )}

      {format === "custom_template" && (
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Custom Template <span className="text-red-500">*</span></label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
            rows={5}
            value={String(config.customTemplate || "")}
            onChange={(event) => updateConfig({ customTemplate: event.target.value })}
            placeholder={"Results ({{rowCount}} rows):\n{{json}}"}
          />
          <p className="mt-1 text-xs text-slate-500">Available tokens: {"{{value}}"}, {"{{json}}"}, and {"{{rowCount}}"}.</p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Output Variable <span className="text-red-500">*</span></label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={String(config.outputVariable || "")}
          onChange={(event) => updateConfig({ outputVariable: event.target.value })}
          placeholder="formattedData"
        />
      </div>
      </div>
    </div>
  );
}

function FileParserConfig({ config, updateConfig }: any) {
  const extractMode = String(config.extractMode || "text");

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      sourceVariablePath: String(config.sourceVariablePath || ""),
      extractMode: String(config.extractMode || "text"),
      outputVariable: String(config.outputVariable || ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-xs text-violet-950">
        Reads a file attached to the triggering chat message and extracts its content. Only available on Manual and Chatbot triggers, since only those can carry a file attachment.
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        In structured mode, the output is an array of row objects, usable with Data Formatter (e.g. as a CSV/HTML table) or AI Extraction. In text mode, the output is the file's full extracted text.
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Source Variable Path <span className="text-red-500">*</span></label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={String(config.sourceVariablePath || "")}
          onChange={(event) => updateConfig({ sourceVariablePath: event.target.value })}
          placeholder="e.g., trigger.input.attachments.0"
        />
        <p className="mt-1 text-xs text-slate-500">Path to the attachment reference in context. The trigger node's attached file (if any) is available at trigger.input.attachments.0.</p>
      </div>

      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Extract Mode <span className="text-red-500">*</span></label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={extractMode}
            onChange={(event) => updateConfig({ extractMode: event.target.value })}
          >
            <option value="text">Plain text (PDF, DOCX, CSV, TXT, JSON, XML)</option>
            <option value="structured">Structured rows (CSV only)</option>
          </select>
          {extractMode === "structured" && (
            <p className="mt-1 text-xs text-amber-700">Structured mode only works for CSV files. Other file types will fail at runtime.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Output Variable <span className="text-red-500">*</span></label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={String(config.outputVariable || "")}
            onChange={(event) => updateConfig({ outputVariable: event.target.value })}
            placeholder="parsedFile"
          />
        </div>
      </div>
      </div>
    </div>
  );
}

const FOR_EACH_BODY_TYPES = [
  { value: "api_call", label: "API Call" },
  { value: "notification", label: "Notification" },
  { value: "ai_extraction", label: "AI Extraction" },
  { value: "variable", label: "Variable" },
  { value: "data_formatter", label: "Data Formatter" },
];

function ForEachConfig({ config, updateConfig, companyId, targetAppId }: any) {
  const bodyNodeType = String(config.bodyNodeType || "");
  const bodyConfig = config.bodyConfig || {};

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      sourceVariablePath: String(config.sourceVariablePath || ""),
      itemVariableName: String(config.itemVariableName || ""),
      maxIterations: Number(config.maxIterations || 100),
      continueOnItemFailure: config.continueOnItemFailure !== false,
      outputVariable: String(config.outputVariable || ""),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateBodyConfig(patch: Record<string, unknown>) {
    updateConfig({ bodyConfig: { ...bodyConfig, ...patch, type: bodyNodeType } });
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-3 text-xs text-teal-950">
        Runs one action once per item in a list — e.g. call an API for every row from a File Parser node. Each iteration sees the current item at the variable name below.
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Source Variable Path (array) <span className="text-red-500">*</span></label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={String(config.sourceVariablePath || "")}
          onChange={(event) => updateConfig({ sourceVariablePath: event.target.value })}
          placeholder="e.g., rows"
        />
      </div>

      <div className="grid gap-3">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Item Variable Name <span className="text-red-500">*</span></label>
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={String(config.itemVariableName || "")}
            onChange={(event) => updateConfig({ itemVariableName: event.target.value })}
            placeholder="item"
          />
          <p className="mt-1 text-xs text-slate-500">Reference the current row as {"{{"}{String(config.itemVariableName || "item")}.someField{"}}"} in the action below.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">Max Iterations</label>
          <input
            type="number"
            min={1}
            max={500}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={Number(config.maxIterations || 100)}
            onChange={(event) => updateConfig({ maxIterations: Number(event.target.value) || 100 })}
          />
          <p className="mt-1 text-xs text-slate-500">Hard-capped at 500 regardless of this value.</p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={config.continueOnItemFailure !== false}
          onChange={(event) => updateConfig({ continueOnItemFailure: event.target.checked })}
        />
        Continue running remaining items if one fails
      </label>

      <div>
        <label className="mb-1 block text-sm font-semibold text-slate-700">Output Variable <span className="text-red-500">*</span></label>
        <input
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={String(config.outputVariable || "")}
          onChange={(event) => updateConfig({ outputVariable: event.target.value })}
          placeholder="loopResults"
        />
      </div>

      <div className="border-t border-slate-200 pt-4">
        <label className="mb-1 block text-sm font-semibold text-slate-700">Action To Run Per Item <span className="text-red-500">*</span></label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={bodyNodeType}
          onChange={(event) => updateConfig({ bodyNodeType: event.target.value, bodyConfig: { type: event.target.value } })}
        >
          <option value="">Select an action...</option>
          {FOR_EACH_BODY_TYPES.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      </div>

      {bodyNodeType && (
        <div className="min-w-0 md:col-span-2">
          {bodyNodeType === "api_call" && <ApiCallConfig config={bodyConfig} updateConfig={updateBodyConfig} />}
          {bodyNodeType === "notification" && (
            <NotificationConfig config={bodyConfig} updateConfig={updateBodyConfig} companyId={companyId} targetAppId={targetAppId} />
          )}
          {bodyNodeType === "ai_extraction" && <AIExtractionConfig config={bodyConfig} updateConfig={updateBodyConfig} />}
          {bodyNodeType === "variable" && <VariableConfig config={bodyConfig} updateConfig={updateBodyConfig} />}
          {bodyNodeType === "data_formatter" && <DataFormatterConfig config={bodyConfig} updateConfig={updateBodyConfig} />}
        </div>
      )}
    </div>
  );
}

function VariableConfig({ config, updateConfig }: any) {
  const [variables, setVariables] = useState<Array<{ name: string; value: string }>>(
    config.variables || [{ name: "", value: "" }]
  );

  useEffect(() => {
    updateConfig({ variables });
  }, [variables]);

  const addVariable = () => {
    setVariables([...variables, { name: "", value: "" }]);
  };

  const removeVariable = (index: number) => {
    if (variables.length > 1) {
      setVariables(variables.filter((_, i) => i !== index));
    }
  };

  const updateVariable = (index: number, field: 'name' | 'value', value: string) => {
    const updated = [...variables];
    updated[index][field] = value;
    setVariables(updated);
  };

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      {/* Help Section */}
      <details className="min-w-0 overflow-hidden border border-slate-300 rounded-lg bg-white [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          💡 What are Variables?
        </summary>
        <div className="px-4 py-3 space-y-3 text-sm border-t border-slate-200 bg-blue-50">
          <p className="text-blue-800">
            Variables let you store and reuse values throughout your orchestration.
          </p>
          <div className="space-y-1 text-xs text-blue-700">
            <p><strong>Literal value:</strong> <code className="bg-blue-100 px-1 rounded">Premium</code>, <code className="bg-blue-100 px-1 rounded">100</code>, <code className="bg-blue-100 px-1 rounded">true</code></p>
            <p><strong>From another source:</strong> <code className="bg-blue-100 px-1 rounded">{'{{capturedData.name.value}}'}</code></p>
            <p><strong>Calculate:</strong> <code className="bg-blue-100 px-1 rounded">{'{{capturedData.price.value}} * 1.13'}</code></p>
            <p className="mt-2 text-blue-900"><strong>Use later:</strong> <code className="bg-blue-100 px-1 rounded">{'{{variables.yourVariableName}}'}</code></p>
          </div>
        </div>
      </details>

      {/* Usage Example */}
      <details className="min-w-0 overflow-hidden border border-slate-300 rounded-lg bg-white [overflow-wrap:anywhere] [&_code]:whitespace-pre-wrap [&_code]:break-all">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          📋 Example Usage
        </summary>
        <div className="px-4 py-3 text-xs border-t border-slate-200 bg-slate-50">
          <div className="space-y-1 font-mono text-slate-700">
            <p><strong>Set:</strong> Name: <code className="bg-white px-1 rounded">total</code>, Value: <code className="bg-white px-1 rounded">{'{{capturedData.price.value}} * {{capturedData.qty.value}}'}</code></p>
            <p><strong>Use:</strong> In Condition or Notification: <code className="bg-white px-1 rounded">{'{{variables.total}}'}</code></p>
          </div>
        </div>
      </details>
      </div>

      {/* Variables List */}
      <div className="min-w-0 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-semibold text-slate-700">
            Variables <span className="text-red-500">*</span>
          </label>
          <button
            type="button"
            onClick={addVariable}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
          >
            <Plus className="h-3 w-3" />
            Add Variable
          </button>
        </div>

        <div className="space-y-3">
          {variables.map((variable, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-3 bg-slate-50 space-y-2">
              {/* Header with delete button */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Variable {index + 1}</span>
                {variables.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeVariable(index)}
                    className="text-red-600 hover:text-red-700 p-1"
                    title="Remove variable"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Variable Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white"
                  value={variable.name}
                  onChange={(e) => updateVariable(index, 'name', e.target.value)}
                  placeholder="e.g., total, customerTier, isApproved"
                />
              </div>

              {/* Variable Value */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Value <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white font-mono"
                  rows={2}
                  value={variable.value}
                  onChange={(e) => updateVariable(index, 'value', e.target.value)}
                  placeholder="Premium  OR  {{capturedData.name.value}}  OR  {{variables.price}} * 1.1"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Can be literal, variable reference, or expression with math operators
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DatabaseConfigLegacy({ config, updateConfig, targetAppId }: any) {
  const [activeSchemas, setActiveSchemas] = useState<Array<{
    id: string;
    databaseName: string;
    databaseType: string;
    version: number;
    updatedAt: string;
  }>>([]);
  const [loadingSchemas, setLoadingSchemas] = useState(false);
  const [schemasError, setSchemasError] = useState("");

  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    if (config?.type !== "database") defaults.type = "database";
    if (!config?.outputVariable) defaults.outputVariable = "databaseQuery";
    if (!config?.userRequestVariablePath) defaults.userRequestVariablePath = "userMessage";
    if (!config?.extractedInputVariablePath) defaults.extractedInputVariablePath = "extracted";
    if (!config?.maxRows) defaults.maxRows = 25;
    if (config?.allowSelectStar === undefined) defaults.allowSelectStar = false;

    if (Object.keys(defaults).length > 0) {
      updateConfig(defaults);
    }
  }, [
    config?.type,
    config?.outputVariable,
    config?.userRequestVariablePath,
    config?.extractedInputVariablePath,
    config?.maxRows,
    config?.allowSelectStar,
    updateConfig,
  ]);

  useEffect(() => {
    const selectedTargetAppId = String(targetAppId || "").trim();
    if (!selectedTargetAppId) {
      setActiveSchemas([]);
      setSchemasError("Select a target app in orchestration to load active database schemas.");
      return;
    }

    let cancelled = false;
    setLoadingSchemas(true);
    setSchemasError("");

    void fetch(`/api/admin/database-schemas?activeOnly=1&targetAppId=${encodeURIComponent(selectedTargetAppId)}`)
      .then((response) => response.json().then((body) => ({ ok: response.ok, body })))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (!ok) {
          setActiveSchemas([]);
          setSchemasError(typeof body?.message === "string" ? body.message : "Unable to load active schemas.");
          return;
        }
        const rows = Array.isArray(body?.schemas) ? body.schemas : [];
        setActiveSchemas(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setActiveSchemas([]);
        setSchemasError("Unable to load active schemas.");
      })
      .finally(() => {
        if (!cancelled) setLoadingSchemas(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetAppId]);

  const schemaMissing = !String(config.schemaId || "").trim();

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Active Database Schema <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={String(config.schemaId || "")}
          onChange={(e) => updateConfig({ schemaId: e.target.value })}
          disabled={loadingSchemas || !targetAppId}
        >
          <option value="">Select active schema</option>
          {activeSchemas.map((schema) => (
            <option key={schema.id} value={schema.id}>
              {schema.databaseName} ({schema.databaseType}) v{schema.version}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate-500">Mandatory. Only active schemas for selected target app are listed.</p>
        {schemaMissing ? <p className="mt-1 text-xs text-red-600">Schema selection is required.</p> : null}
        {schemasError ? <p className="mt-1 text-xs text-red-600">{schemasError}</p> : null}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Variable <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={String(config.outputVariable || "")}
          onChange={(e) => updateConfig({ outputVariable: e.target.value })}
          placeholder="e.g., databaseQuery"
        />
        <p className="mt-1 text-xs text-slate-500">Generated SQL and metadata are stored at this variable path.</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">User Request Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={String(config.userRequestVariablePath || "")}
          onChange={(e) => updateConfig({ userRequestVariablePath: e.target.value })}
          placeholder="e.g., userMessage or trigger.input.userMessage"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">AI Extraction JSON Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={String(config.extractedInputVariablePath || "")}
          onChange={(e) => updateConfig({ extractedInputVariablePath: e.target.value })}
          placeholder="e.g., extracted"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Additional Context Variable Path</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={String(config.additionalContextVariablePath || "")}
          onChange={(e) => updateConfig({ additionalContextVariablePath: e.target.value })}
          placeholder="Optional, e.g., trigger.input"
        />
      </div>

      <details className="rounded-lg border border-amber-200 bg-amber-50 p-3" open>
        <summary className="cursor-pointer text-sm font-semibold text-amber-900">Field Guide: which value goes where</summary>
        <div className="mt-3 space-y-3 text-xs text-amber-900">
          <p><strong>User Request Variable Path</strong>: raw user question from chatbot.</p>
          <p><strong>AI Extraction JSON Variable Path</strong>: structured JSON from AI Extractor output.</p>
          <p><strong>Additional Context Variable Path</strong>: optional extra payload like user profile, channel, company, or session metadata.</p>

          <div className="rounded border border-amber-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">Recommended setup for chatbot -&gt; ai extractor -&gt; database node</p>
              <button
                type="button"
                className="rounded border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-200"
                onClick={() =>
                  updateConfig({
                    userRequestVariablePath: "userMessage",
                    extractedInputVariablePath: "extracted",
                    additionalContextVariablePath: "trigger.input",
                  })
                }
              >
                Use recommended defaults
              </button>
            </div>
            <p className="mt-1">User Request Variable Path: <span className="font-mono">userMessage</span></p>
            <p className="mt-1">AI Extraction JSON Variable Path: <span className="font-mono">extracted</span></p>
            <p className="mt-1">Additional Context Variable Path: <span className="font-mono">trigger.input</span> (optional)</p>
          </div>

          <div className="rounded border border-amber-200 bg-white p-3">
            <p className="font-semibold">Sample runtime context</p>
            <pre className="mt-2 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] text-slate-100">{`{
  "userMessage": "show last 5 invoices for acme",
  "extracted": {
    "customerName": "acme",
    "entity": "invoice",
    "limit": 5
  },
  "trigger": {
    "input": {
      "conversationId": "conv_123",
      "channel": "chatbot"
    }
  }
}`}</pre>
            <p className="mt-2">Database Node reads question from <span className="font-mono">userMessage</span>, extracted filters from <span className="font-mono">extracted</span>, and optional metadata from <span className="font-mono">trigger.input</span>.</p>
          </div>

          <p className="text-amber-800">Tip: if you changed AI Extractor output variable to something like <span className="font-mono">extraction.result</span>, use that exact same path here.</p>
        </div>
      </details>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Max Rows</label>
        <input
          type="number"
          min={1}
          max={500}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          value={Number(config.maxRows || 25)}
          onChange={(e) => updateConfig({ maxRows: Number(e.target.value || 25) })}
        />
        <p className="mt-1 text-xs text-slate-500">Safety cap. SQL generator will apply row limit when missing.</p>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="allowSelectStar"
          type="checkbox"
          className="rounded border-slate-300"
          checked={config.allowSelectStar === true}
          onChange={(e) => updateConfig({ allowSelectStar: e.target.checked })}
        />
        <label htmlFor="allowSelectStar" className="text-sm text-slate-700">Allow SELECT * when absolutely necessary</label>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Custom SQL Generation Instructions</label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          rows={3}
          value={String(config.customInstructions || "")}
          onChange={(e) => updateConfig({ customInstructions: e.target.value })}
          placeholder="Optional business rules, preferred filters, sorting guidance, etc."
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        This node generates a safe SELECT SQL query only. It does not execute the query yet.
        Generated SQL and safety validation details are included in node output so they are visible in execution monitoring.
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
        Manage active schemas in
        {" "}
        <a
          href="/control-panel/administration/database-schema"
          className="font-semibold text-blue-700 hover:text-blue-800 underline"
          target="_blank"
          rel="noreferrer"
        >
          Database Schema Manager
        </a>
        .
      </div>
    </div>
  );
}

function AiPlannerConfig({ config, updateConfig }: any) {
  const isDraftingEntryPoint = config.isDraftingEntryPoint === true;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        This node marks where chat users land when they ask for something new —
        matching against existing orchestrations first, then drafting a new one
        for admin approval. The actual conversation runs outside this graph;
        this node never executes any logic of its own.
      </div>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <input
          checked={isDraftingEntryPoint}
          id="aiPlannerIsDraftingEntryPoint"
          onChange={(e) => updateConfig({ isDraftingEntryPoint: e.target.checked })}
          type="checkbox"
        />
        <label className="text-sm text-slate-700" htmlFor="aiPlannerIsDraftingEntryPoint">
          Make this the AI Planner drafting entry point for this trigger type
        </label>
      </div>
      <p className="text-xs text-slate-500">
        Only one orchestration per target application and trigger type may be
        checked. Publishing will fail if another orchestration already claims
        this scope.
      </p>

      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Match Confidence Threshold</label>
        <input
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
          disabled={!isDraftingEntryPoint}
          max="1"
          min="0"
          onChange={(e) => updateConfig({ matchConfidenceThreshold: parseFloat(e.target.value) })}
          step="0.05"
          type="number"
          value={config.matchConfidenceThreshold ?? 0.75}
        />
        <p className="mt-1 text-xs text-slate-500">
          Minimum semantic similarity required to match an existing orchestration
          before drafting a new one. Only used when this node is the drafting
          entry point.
        </p>
      </div>
      </div>
    </div>
  );
}

function EndConfig({ config, updateConfig, supportsMessage }: any) {
  const displayMode = String(config.displayMode || "text");

  // Seed default config values on mount so they persist even if the user
  // never touches these fields before saving.
  useEffect(() => {
    updateConfig({
      displayMode: String(config.displayMode || "text"),
      displayDataPath: String(config.displayDataPath || ""),
      displayColumnPaths: Array.isArray(config.displayColumnPaths) ? config.displayColumnPaths : [],
      responseVariablePath: String(config.responseVariablePath || ""),
      includeNodeResponses: config.includeNodeResponses !== false,
      displayMessage: config.displayMessage === true,
      message: config.message || "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      <div className="flex min-w-0 flex-col gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        End node now aggregates previous node outputs into one final workflow response.
        Keep orchestration flow one-way. Use status updates for progress and this section for final response shaping.
      </div>

      <details className="rounded-lg border border-slate-300 bg-white">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
          Final response examples
        </summary>
        <div className="px-4 py-3 space-y-2 text-xs border-t border-slate-200 bg-slate-50 text-slate-700">
          <p><strong>Path:</strong> finalResponse</p>
          <p><strong>Contains:</strong> execution id, selected output variables, and optional per-node responses.</p>
          <p><strong>Table example:</strong> set Display Data Variable Path to <span className="font-mono">apiResult.parsedJson.rows</span>.</p>
          <p><strong>Chatbot flow:</strong> Workflow router can read this final response and send a clean answer to the user.</p>
        </div>
      </details>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50 p-4 shadow-sm">
      <div className="grid gap-3">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Display Mode</label>
          <select
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={displayMode}
            onChange={(e) => updateConfig({ displayMode: e.target.value })}
          >
            <option value="text">Text</option>
            <option value="table">Table</option>
            <option value="json">JSON</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Text preserves the existing completion message. Table and JSON attach structured content to the chatbot response.
          </p>
        </div>

        {displayMode !== "text" && (
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Display Data Variable Path <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={String(config.displayDataPath || "")}
              onChange={(e) => updateConfig({ displayDataPath: e.target.value })}
              placeholder="e.g., apiResult.parsedJson.rows"
            />
            <p className="mt-1 text-xs text-slate-500">
              Use the API Call node output path that contains the rows or JSON object.
            </p>
          </div>
        )}
      </div>

      {displayMode === "table" && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Table Columns
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={Array.isArray(config.displayColumnPaths) ? config.displayColumnPaths.join(", ") : ""}
            onChange={(e) => updateConfig({
              displayColumnPaths: e.target.value
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })}
            placeholder="Optional, e.g., name, status, created_at"
          />
          <p className="mt-1 text-xs text-slate-500">
            Comma-separated keys in display order. Leave blank to infer columns from the returned rows.
          </p>
        </div>
      )}

      <div className="grid gap-3">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">Final Response Variable Path</label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={String(config.responseVariablePath || "")}
            onChange={(e) => updateConfig({ responseVariablePath: e.target.value })}
            placeholder="e.g., finalResponse"
          />
          <p className="mt-1 text-xs text-slate-500">
            End node stores consolidated response at this path.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3">
          <input
            id="includeNodeResponses"
            type="checkbox"
            className="mt-0.5 rounded border-slate-300"
            checked={config.includeNodeResponses !== false}
            onChange={(e) => updateConfig({ includeNodeResponses: e.target.checked })}
          />
          <label htmlFor="includeNodeResponses" className="text-sm text-slate-700">
            Include per-node outputs in final response
            <span className="block text-xs text-slate-500 mt-1">
              Keeps each node&apos;s output/status under final response for downstream consumers.
            </span>
          </label>
        </div>
      </div>

      {!supportsMessage ? (
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          A completion message is only shown to users for <span className="font-semibold">Manual</span> and <span className="font-semibold">Chatbot</span> triggers.
          Aggregation settings above still apply for all trigger types.
        </div>
      ) : null}

      {supportsMessage ? (
        <>
      <div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="displayMessage"
            className="rounded border-slate-300"
            checked={config.displayMessage === true}
            onChange={(e) => updateConfig({ displayMessage: e.target.checked })}
          />
          <label htmlFor="displayMessage" className="text-sm text-slate-700">
            Display message
          </label>
        </div>
        <p className="mt-1 ml-6 text-xs text-slate-500">
          Show a completion message to the user when orchestration ends.
        </p>
      </div>

      {config.displayMessage && (
        <>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Message <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              value={config.message || ""}
              onChange={(e) => updateConfig({ message: e.target.value })}
              placeholder="e.g., Order {{variables.orderId}} completed with total ${{variables.total}}"
              rows={3}
            />
          </div>

          {/* Help Section */}
          <details className="border border-slate-300 rounded-lg bg-white">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 select-none">
              💡 Using Variables in Messages
            </summary>
            <div className="px-4 py-3 space-y-2 text-xs border-t border-slate-200 bg-blue-50">
              <p className="text-blue-800">
                You can include dynamic values from your orchestration in the end message:
              </p>
              <div className="space-y-1 text-blue-700">
                <p><strong>From Variables:</strong> <code className="bg-blue-100 px-1 rounded">{'{{variables.total}}'}</code></p>
                <p><strong>From Captured Data:</strong> <code className="bg-blue-100 px-1 rounded">{'{{capturedData.customerName.value}}'}</code></p>
                <p><strong>From AI Extraction:</strong> <code className="bg-blue-100 px-1 rounded">{'{{extracted.invoiceNumber}}'}</code></p>
                <p><strong>From Workflow:</strong> <code className="bg-blue-100 px-1 rounded">{'{{workflow.ProcessOrder.orderId}}'}</code></p>
                <p><strong>From Trigger:</strong> <code className="bg-blue-100 px-1 rounded">{'{{trigger.requestId}}'}</code></p>
              </div>
              <div className="mt-2 p-2 bg-white border border-blue-200 rounded">
                <p className="font-semibold text-blue-900 mb-1">Example:</p>
                <p className="font-mono text-blue-800">
                  Order #{'{{variables.orderId}}'} completed! Total: ${'{{variables.total}}'}
                </p>
              </div>
            </div>
          </details>
        </>
      )}
        </>
      ) : null}
      </div>
    </div>
  );
}

