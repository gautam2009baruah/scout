/**
 * Node Properties Panel
 * Renders appropriate UI controls for each node type configuration
 */

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, Trash2, Plus, Minus, Move, Maximize2, Save, ChevronDown, ChevronRight } from "lucide-react";
import type { Node, Edge } from "reactflow";
import type { NodeType } from "@/shared/orchestrationTypes";
import { TRIGGER_TYPES, TRIGGER_TYPE_LABELS, UPCOMING_TRIGGER_TYPES } from "@/shared/orchestrationTypes";
import Draggable from "react-draggable";
import { createPortal } from "react-dom";
import { MultiSelectDropdown } from "./multi-select-dropdown";
import { ApiCallConfig } from "./api-call-config";
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
  { type: "ai_decision", label: "AI Decision", icon: "🧠" },
  { type: "condition", label: "Condition", icon: "❓" },
  { type: "human_approval", label: "Human Approval", icon: "✋" },
  { type: "notification", label: "Notification", icon: "📧" },
  { type: "api_call", label: "API Call", icon: "🌐" },
  { type: "variable", label: "Variable", icon: "📊" },
  { type: "end", label: "End", icon: "🏁" },
];

const PANEL_MARGIN = 16;
const DEFAULT_PANEL_WIDTH = 384;
const DEFAULT_PANEL_HEIGHT = 600;
const MIN_PANEL_WIDTH = 300;
const MIN_PANEL_HEIGHT = 400;

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getViewportPanelSize(width: number, height: number) {
  if (typeof window === "undefined") {
    return { width, height };
  }

  const maxWidth = Math.max(240, window.innerWidth - PANEL_MARGIN * 2);
  const maxHeight = Math.max(240, window.innerHeight - PANEL_MARGIN * 2);

  return {
    width: clampValue(width, Math.min(MIN_PANEL_WIDTH, maxWidth), maxWidth),
    height: clampValue(height, Math.min(MIN_PANEL_HEIGHT, maxHeight), maxHeight),
  };
}

function clampPanelPosition(
  position: { x: number; y: number },
  width: number,
  height: number
) {
  if (typeof window === "undefined") {
    return position;
  }

  return {
    x: clampValue(position.x, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)),
    y: clampValue(position.y, PANEL_MARGIN, Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)),
  };
}

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
  
  // Local state for editing (not saved until Save button clicked)
  const [localLabel, setLocalLabel] = useState(node.data.label);
  const [localDisplayDescription, setLocalDisplayDescription] = useState(node.data.displayDescription || "");
  const [localConfig, setLocalConfig] = useState(node.data.config || {});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  
  const [panelWidth, setPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [panelHeight, setPanelHeight] = useState(DEFAULT_PANEL_HEIGHT);
  const [position, setPosition] = useState({ x: PANEL_MARGIN, y: PANEL_MARGIN });
  const nodeRef = useRef<HTMLDivElement>(null);

  const placePanelInViewport = useCallback((width = panelWidth, height = panelHeight) => {
    const size = getViewportPanelSize(width, height);
    setPanelWidth(size.width);
    setPanelHeight(size.height);
    setPosition((current) => clampPanelPosition(current, size.width, size.height));
  }, [panelHeight, panelWidth]);

  // Calculate initial position after mount to ensure the full panel is visible.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const size = getViewportPanelSize(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);
      setPanelWidth(size.width);
      setPanelHeight(size.height);
      setPosition(clampPanelPosition({ x: 32, y: 32 }, size.width, size.height));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleWindowResize = () => {
      placePanelInViewport();
    };

    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, [placePanelInViewport]);

  // Reset local state when node changes (different node selected)
  useEffect(() => {
    setLocalLabel(node.data.label);
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

  // Update local config (not saved until Save clicked)
  const updateLocalConfig = (updates: Record<string, any>) => {
    setLocalConfig({ ...localConfig, ...updates });
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

  // Handle resize
  useEffect(() => {
    const resizeElement = nodeRef.current;
    if (!resizeElement) return;

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let resizeDirection = '';

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('resize-handle')) {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = panelWidth;
        startHeight = panelHeight;
        
        // Determine resize direction from the specific handle class
        resizeDirection = '';
        if (target.classList.contains('resize-left') || target.classList.contains('resize-topleft') || target.classList.contains('resize-bottomleft')) {
          resizeDirection += 'left';
        }
        if (target.classList.contains('resize-right') || target.classList.contains('resize-topright') || target.classList.contains('resize-bottomright')) {
          resizeDirection += 'right';
        }
        if (target.classList.contains('resize-top') || target.classList.contains('resize-topleft') || target.classList.contains('resize-topright')) {
          resizeDirection += 'top';
        }
        if (target.classList.contains('resize-bottom') || target.classList.contains('resize-bottomleft') || target.classList.contains('resize-bottomright')) {
          resizeDirection += 'bottom';
        }
        
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      
      // Handle horizontal resize
      if (resizeDirection.includes('left')) {
        newWidth = startWidth - deltaX;
      } else if (resizeDirection.includes('right')) {
        newWidth = startWidth + deltaX;
      }
      
      // Handle vertical resize
      if (resizeDirection.includes('top')) {
        newHeight = startHeight - deltaY;
      } else if (resizeDirection.includes('bottom')) {
        newHeight = startHeight + deltaY;
      }
      
      const size = getViewportPanelSize(newWidth, newHeight);
      setPanelWidth(size.width);
      setPanelHeight(size.height);
      setPosition((current) => clampPanelPosition(current, size.width, size.height));
    };

    const handleMouseUp = () => {
      isResizing = false;
      resizeDirection = '';
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [panelWidth, panelHeight]);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal((
    <>
      <Draggable
        handle=".drag-handle"
        nodeRef={nodeRef}
        position={position}
        onDrag={(e, data) => {
          setPosition(clampPanelPosition({ x: data.x, y: data.y }, panelWidth, panelHeight));
        }}
        onStop={(e, data) => {
          setPosition(clampPanelPosition({ x: data.x, y: data.y }, panelWidth, panelHeight));
        }}
        onStart={(e) => {
          // Prevent dragging when clicking on resize handles
          const target = e.target as HTMLElement;
          if (target.classList.contains('resize-handle') || target.closest('.resize-handle')) {
            return false;
          }
        }}
      >
      <div 
        ref={nodeRef}
        className="fixed bg-white border-2 border-slate-300 rounded-lg shadow-2xl"
        style={{ 
          top: 0,
          left: 0,
          width: `${panelWidth}px`,
          height: `${panelHeight}px`,
          zIndex: 9999
        }}
      >
        
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="drag-handle bg-gradient-to-r from-slate-700 to-slate-600 p-4 cursor-move border-b-2 border-slate-500 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Move className="h-4 w-4 text-slate-300" />
                <h3 className="text-base font-bold text-white">Node Properties</h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="text-slate-300 hover:text-white transition-colors p-1 rounded hover:bg-slate-600"
                  onClick={() => {
                    const size = getViewportPanelSize(DEFAULT_PANEL_WIDTH, DEFAULT_PANEL_HEIGHT);
                    setPanelWidth(size.width);
                    setPanelHeight(size.height);
                    setPosition(clampPanelPosition({ x: 32, y: 32 }, size.width, size.height));
                  }}
                  type="button"
                  title="Reset size"
                >
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button
                  className="text-slate-300 hover:text-white transition-colors p-1 rounded hover:bg-slate-600"
                  onClick={handleClose}
                  type="button"
                  title="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="rounded-lg bg-white bg-opacity-10 backdrop-blur-sm px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xl">{NODE_CONFIGS.find((n) => n.type === nodeType)?.icon}</span>
                <span className="text-sm font-semibold text-white">
                  {NODE_CONFIGS.find((n) => n.type === nodeType)?.label}
                </span>
              </div>
            </div>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto bg-white">
            <div className="p-4 space-y-4">
        {/* Common: Label */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Node Label <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            placeholder="Enter a descriptive label"
          />
          <p className="mt-1 text-xs text-slate-500">Display name for this node</p>
        </div>

        {/* Common: Display Description for Execution Plan */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Step Description <span className="text-slate-500 text-xs font-normal">(for execution plan)</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            value={localDisplayDescription}
            onChange={(e) => setLocalDisplayDescription(e.target.value)}
            placeholder="e.g., Extract rate code from email, Fill rate form, Send confirmation"
          />
          <p className="mt-1 text-xs text-slate-500">
            Human-readable description shown to users when orchestration is triggered
          </p>
        </div>

        {/* Node-specific configuration */}
        {nodeType === "trigger" && <TriggerConfig config={localConfig} updateConfig={updateLocalConfig} companyId={companyId} targetAppId={targetAppId} orchestrationId={orchestrationId} />}
        {nodeType === "workflow" && <WorkflowConfig config={localConfig} updateConfig={updateLocalConfig} nodes={nodes} edges={edges} currentNode={node} />}
        {nodeType === "data_capture" && <DataCaptureConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_extraction" && <AIExtractionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_decision" && <AIDecisionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "condition" && <ConditionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "human_approval" && <HumanApprovalConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "notification" && <NotificationConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "api_call" && <ApiCallConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "variable" && <VariableConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "end" && <EndConfig config={localConfig} updateConfig={updateLocalConfig} supportsMessage={supportsEndMessage} />}

        {/* Validation Error */}
        {validationError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700 font-medium">{validationError}</p>
          </div>
        )}

        {/* Save Button */}
        <div className="pt-4 border-t border-slate-200">
          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            onClick={handleSave}
            type="button"
          >
            <Save className="h-4 w-4" />
            Save Changes
          </button>
        </div>
            </div>
          </div>
        </div>

        {/* Resize Handles - Rendered LAST so they're on top */}
        <div 
          className="resize-handle resize-left absolute left-0 top-0 bottom-0 cursor-ew-resize bg-blue-400 bg-opacity-0 hover:bg-opacity-40 transition-all" 
          style={{ width: '6px', left: '-3px', zIndex: 10000 }}
        />
        <div 
          className="resize-handle resize-right absolute right-0 top-0 bottom-0 cursor-ew-resize bg-blue-400 bg-opacity-0 hover:bg-opacity-40 transition-all" 
          style={{ width: '6px', right: '-3px', zIndex: 10000 }}
        />
        <div 
          className="resize-handle resize-top absolute left-0 top-0 right-0 cursor-ns-resize bg-blue-400 bg-opacity-0 hover:bg-opacity-40 transition-all" 
          style={{ height: '6px', top: '-3px', zIndex: 10000 }}
        />
        <div 
          className="resize-handle resize-bottom absolute left-0 bottom-0 right-0 cursor-ns-resize bg-blue-400 bg-opacity-0 hover:bg-opacity-40 transition-all" 
          style={{ height: '6px', bottom: '-3px', zIndex: 10000 }}
        />
        {/* Corner Handles */}
        <div 
          className="resize-handle resize-topleft absolute cursor-nwse-resize bg-blue-500 bg-opacity-0 hover:bg-opacity-60 transition-all rounded-tl-lg" 
          style={{ width: '12px', height: '12px', left: '-3px', top: '-3px', zIndex: 10001 }}
        />
        <div 
          className="resize-handle resize-topright absolute cursor-nesw-resize bg-blue-500 bg-opacity-0 hover:bg-opacity-60 transition-all rounded-tr-lg" 
          style={{ width: '12px', height: '12px', right: '-3px', top: '-3px', zIndex: 10001 }}
        />
        <div 
          className="resize-handle resize-bottomleft absolute cursor-nesw-resize bg-blue-500 bg-opacity-0 hover:bg-opacity-60 transition-all rounded-bl-lg" 
          style={{ width: '12px', height: '12px', left: '-3px', bottom: '-3px', zIndex: 10001 }}
        />
        <div 
          className="resize-handle resize-bottomright absolute cursor-nwse-resize bg-blue-500 bg-opacity-0 hover:bg-opacity-60 transition-all rounded-br-lg" 
          style={{ width: '12px', height: '12px', right: '-3px', bottom: '-3px', zIndex: 10001 }}
        />
      </div>
    </Draggable>

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
  const [triggerType, setTriggerType] = useState(config.triggerType || "manual");
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
  type EmailCredential = { id: string; name: string; email_address: string; provider: string; is_active: boolean };
  const [emailCredentials, setEmailCredentials] = useState<EmailCredential[]>([]);
  const [loadingCredentials, setLoadingCredentials] = useState(false);
  const [generatedCredential, setGeneratedCredential] = useState<{
    title: string;
    value: string;
    copied: boolean;
  } | null>(null);

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
              credentials = credentials.filter((c: any) => {
                const targetApps = c.target_apps || [];
                return targetApps.some((app: any) => app.id === targetAppId);
              });
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Minimum Confidence</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.minConfidence || 0.7}
              onChange={(e) => updateConfig({ minConfidence: parseFloat(e.target.value) })}
            />
            <p className="text-xs text-slate-500 mt-1">Threshold for intent match (0-1)</p>
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
              <select
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.emailCredentialId || ""}
                onChange={(e) => updateConfig({ emailCredentialId: e.target.value })}
              >
                <option value="">Select email inbox</option>
                {emailCredentials.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.name} ({cred.email_address}) - {cred.provider.toUpperCase()}
                  </option>
                ))}
              </select>
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
                <p>Endpoint names are checked for duplicate conflicts and reserved words before publish.</p>
                <p>This endpoint is hosted by the Scout server deployment. You share this URL with consumers.</p>
                <p>One-click external hosting to a separate server is not available in this screen yet.</p>
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
                <p>Requests using methods outside this list are rejected.</p>
                <p>If "Require Request Body" is enabled, it applies only to methods that typically carry body payloads (POST/PUT/PATCH/DELETE).</p>
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
                <p>Requests larger than this size are rejected with an invalid input response.</p>
                <p>Example: 1048576 bytes is roughly 1 MB.</p>
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
                <p>Defines how many requests are allowed within one rate window.</p>
                <p>Example: 60 requests with a 60-second window means at most 60 requests per minute.</p>
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
                <p>Only these Content-Type values are accepted. Others are rejected.</p>
                <p>Use standard MIME values such as application/json or multipart/form-data.</p>
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
                <p>These headers are expected/accepted for consumer integrations.</p>
                <p>Headers are optional unless your auth mode requires specific headers.</p>
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
                <p>These query parameters are accepted by this endpoint format.</p>
                <p>They are optional unless your downstream orchestration logic expects them.</p>
                <p>Example: source=erp&version=v2</p>
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
                <p>These names map to extra path segments after /apitrigger/shortName/.</p>
                <p>Example: /apitrigger/invoice/acme/123 maps accountId=acme, orderId=123.</p>
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
  const [useManualInput, setUseManualInput] = useState(false);
  const [workflowSteps, setWorkflowSteps] = useState<Array<{ 
    description: string; 
    parameterName: string; 
    parameterLabel: string;
    type: string;
    stepOrder: number;
  }>>([]);
  const [fetchingWorkflowId, setFetchingWorkflowId] = useState<string | null>(null);
  const workflowCacheRef = useRef<Map<string, any>>(new Map());

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
      if (!config.workflowId || config.workflowId.includes("{{")) return;
      
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

  // Check if current value is a dynamic expression
  const isDynamicExpression = config.workflowId?.includes("{{") && config.workflowId?.includes("}}");
  const showManualInput = useManualInput || isDynamicExpression;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Workflow <span className="text-red-500">*</span>
        </label>
        
        {showManualInput ? (
          <>
            <input
              type="text"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
              value={config.workflowId || ""}
              onChange={(e) => updateConfig({ workflowId: e.target.value })}
              placeholder="{{variableName}} or workflow-id"
            />
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-slate-500">Dynamic expression or workflow ID</p>
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-700"
                onClick={() => setUseManualInput(false)}
              >
                Select from list
              </button>
            </div>
          </>
        ) : (
          <>
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
                        {'    → ' + workflow.title}
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
            <div className="mt-1 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {availableWorkflows.length} published workflow{availableWorkflows.length !== 1 ? "s" : ""} available
              </p>
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-700"
                onClick={() => setUseManualInput(true)}
              >
                Use dynamic expression
              </button>
            </div>
          </>
        )}
      </div>

      {/* Trigger Phrases Multi-Select (only show for chatbot triggers) */}
      {triggerType === "chatbot" && availableTriggerPhrases.length > 0 && (
        <div>
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
        <div>
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
        <div className="border-t pt-4">
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

      {/* Output Mapping Section */}
      <div className="border-t pt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          📤 Workflow Results
        </label>
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

      <div>
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

      <div>
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
        <div className="space-y-3">
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

      <div>
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
  );
}

function DataCaptureConfig({ config, updateConfig }: any) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="space-y-4">
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
          <div className="flex items-center gap-2 ml-6">
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

          <div className="ml-6">
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

      <div className="border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900"
        >
          <span>{showAdvanced ? '▼' : '▶'}</span>
          Advanced Settings
        </button>
        
        {showAdvanced && (
          <div className="mt-4 space-y-4 pl-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Output Variable Name
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                value={config.outputVariable || "capturedData"}
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
  );
}

function AIExtractionConfig({ config, updateConfig }: any) {
  const [schemaFields, setSchemaFields] = useState<Array<{ key: string; type: string; description: string }>>(
    Object.entries(config.schema || {}).map(([key, def]) => {
      if (def && typeof def === "object") {
        return {
          key,
          type: (def as any).type || "string",
          description: (def as any).description || "",
        };
      }
      return { key, type: (def as string) || "string", description: "" };
    })
  );

  // Active LLM provider (from AI Configuration), shown for reference
  const [activeProvider, setActiveProvider] = useState<{ provider: string; model: string } | null>(null);

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
        acc[field.key] = { type: field.type, description: field.description };
      }
      return acc;
    }, {} as Record<string, { type: string; description: string }>);
    updateConfig({ schema });
  }, [schemaFields]);

  return (
    <div className="space-y-4">
      {/* Active provider */}
      <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-xs text-blue-800">
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
      <CollapsibleHelp title="How to use this node">
        <p>
          AI Extraction reads some input text, uses the active AI provider to pull
          out the fields you describe, and stores the result in an output variable
          you can reference in later nodes.
        </p>
        <ol className="list-decimal pl-4 space-y-1 mt-2">
          <li>Put the text to analyze in <strong>Input Text</strong> (use variables from earlier nodes).</li>
          <li>List the <strong>Fields to Extract</strong>, each with a short description.</li>
          <li>Reference results downstream as <code className="bg-slate-100 px-1 rounded">{`{{output.field}}`}</code>.</li>
        </ol>
      </CollapsibleHelp>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Input Text <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
          value={config.input || ""}
          onChange={(e) => updateConfig({ input: e.target.value })}
          placeholder="{{bodyText}}"
        />
        <CollapsibleHelp title="Examples by node type">
          <ul className="space-y-2">
            <li>
              <div className="font-semibold text-slate-700">After an Email trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{subject}} {{bodyText}}`}</code>
            </li>
            <li>
              <div className="font-semibold text-slate-700">After a Manual trigger</div>
              <code className="block bg-slate-100 px-1 rounded">{`{{trigger.message}}`}</code>
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

      <div>
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
              <div className="flex gap-2">
                <input
                  type="text"
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="Field name (e.g. invoiceNumber)"
                  value={field.key}
                  onChange={(e) => {
                    const updated = [...schemaFields];
                    updated[index].key = e.target.value;
                    setSchemaFields(updated);
                  }}
                />
                <select
                  className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm"
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
                <button
                  type="button"
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                  onClick={() => setSchemaFields(schemaFields.filter((_, i) => i !== index))}
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
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
            </div>
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
            onClick={() =>
              setSchemaFields([...schemaFields, { key: "", type: "string", description: "" }])
            }
          >
            <Plus className="h-4 w-4" />
            Add Field
          </button>
        </div>
      </div>

      <div>
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

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Output Variable <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.outputVariable || "extracted"}
          onChange={(e) => updateConfig({ outputVariable: e.target.value })}
          placeholder="extracted"
        />
        <p className="mt-1 text-xs text-slate-500">
          Reference extracted fields downstream as{" "}
          <code className="bg-slate-100 px-1 rounded">{`{{${config.outputVariable || "extracted"}.invoiceNumber}}`}</code>.
        </p>
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

function AIDecisionConfig({ config, updateConfig }: any) {
  const [decisions, setDecisions] = useState<Array<{ label: string; description: string }>>(
    config.decisions || [{ label: "", description: "" }]
  );

  useEffect(() => {
    updateConfig({ decisions });
  }, [decisions]);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          AI Provider <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.provider || "openai"}
          onChange={(e) => updateConfig({ provider: e.target.value })}
        >
          <option value="openai">OpenAI</option>
          <option value="gemini">Google Gemini</option>
          <option value="anthropic">Anthropic Claude</option>
          <option value="ollama">Ollama</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Input Text <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          rows={3}
          value={config.input || ""}
          onChange={(e) => updateConfig({ input: e.target.value })}
          placeholder="{{variableName}} or text to analyze"
        />
        <p className="mt-1 text-xs text-slate-500">Text for AI to analyze and route</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Decision Options <span className="text-red-500">*</span>
        </label>
        <div className="space-y-3">
          {decisions.map((decision, index) => (
            <div key={index} className="border border-slate-200 rounded-lg p-3">
              <div className="flex items-start gap-2 mb-2">
                <input
                  type="text"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm font-medium"
                  placeholder="Label (e.g., urgent, normal)"
                  value={decision.label}
                  onChange={(e) => {
                    const updated = [...decisions];
                    updated[index].label = e.target.value;
                    setDecisions(updated);
                  }}
                />
                <button
                  type="button"
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  onClick={() => setDecisions(decisions.filter((_, i) => i !== index))}
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
              <textarea
                className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
                rows={2}
                placeholder="Description for AI context"
                value={decision.description}
                onChange={(e) => {
                  const updated = [...decisions];
                  updated[index].description = e.target.value;
                  setDecisions(updated);
                }}
              />
            </div>
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400"
            onClick={() => setDecisions([...decisions, { label: "", description: "" }])}
          >
            <Plus className="h-4 w-4" />
            Add Decision Option
          </button>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Default Decision</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={config.defaultDecision || ""}
          onChange={(e) => updateConfig({ defaultDecision: e.target.value })}
          placeholder="Fallback if AI can't decide"
        />
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
    <div className="space-y-4">
      {/* Variable Usage Help */}
      <details className="border border-slate-300 rounded-lg bg-white">
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
                  <span className="text-lg">📊</span>
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
  );
}

function HumanApprovalConfig({ config, updateConfig }: any) {
  const [fields, setFields] = useState<Array<{ label: string; value: string; defaultValue?: string }>>(
    config.fields || []
  );

  useEffect(() => {
    updateConfig({ fields });
  }, [fields]);

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

function NotificationConfig({ config, updateConfig }: any) {
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

  const [expanded, setExpanded] = useState<Record<string, boolean>>({ email: true });
  const [testState, setTestState] = useState<Record<string, { loading: boolean; status: "idle" | "success" | "error"; message: string }>>({});

  useEffect(() => {
    if (config.channels) return;

    const defaults: Record<string, any> = {
      email: {
        enabled: config.channel === "email",
        fromName: "",
        replyTo: "",
        to: config.channel === "email" ? (config.recipient || "") : "",
        cc: "",
        bcc: "",
        subject: config.channel === "email" ? (config.subject || "Notification") : "Notification",
        body: config.channel === "email" ? (config.message || "") : "",
        bodyFormat: "rich_text",
        template: config.template || "",
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
        title: config.channel === "internal" ? (config.subject || "Orchestration Notification") : "Orchestration Notification",
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
        connection: "",
        workspace: "",
        team: "",
        channel: "",
        mentions: "",
        title: config.channel === "teams" ? (config.subject || "Orchestration Notification") : "Orchestration Notification",
        message: config.channel === "teams" ? (config.message || "") : "",
        messageFormat: "adaptive_card",
        actionButtons: [],
        webhookUrl: config.channel === "teams" ? (config.recipient || "") : "",
        delivery: { mode: "immediate", scheduledAt: "" },
        retry: { enabled: true, maxAttempts: 2, delaySeconds: 2 },
      },
      slack: {
        enabled: config.channel === "slack",
        connection: "",
        workspace: "",
        channel: "",
        directMessageRecipient: "",
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
        templateLanguage: "en",
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
  }, [config.channels, config.channel, config.message, config.recipient, config.subject, config.template, updateConfig]);

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
        channels.teams?.enabled && !String(channels.teams?.webhookUrl || channels.teams?.connection || "").trim(),
        "Webhook URL or connection is required"
      ),
    },
    slack: {
      message: getError(channels.slack?.enabled && !String(channels.slack?.message || "").trim(), "Message is required"),
      webhook: getError(
        channels.slack?.enabled && !String(channels.slack?.webhookUrl || channels.slack?.connection || "").trim(),
        "Webhook URL or connection is required"
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
    return (
      <div className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="col-span-2 flex h-9 min-w-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-3" htmlFor={`${channelKey}-retry-enabled`}>
            <input
              id={`${channelKey}-retry-enabled`}
              type="checkbox"
              className="h-4 w-4 shrink-0 rounded border-slate-300"
              checked={channel.retry?.enabled !== false}
              onChange={(e) => setChannelNested(channelKey, "retry", { enabled: e.target.checked })}
            />
            <span className="truncate text-xs font-medium text-slate-700" title="Enable retries">Enable retries</span>
          </label>
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
      </div>
    );
  };

  return (
    <div className="space-y-4">
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
                  {entry.key === "teams" && (channels.teams?.team || channels.teams?.channel || channels.teams?.webhookUrl || "No destination")}
                  {entry.key === "slack" && (channels.slack?.channel || channels.slack?.directMessageRecipient || channels.slack?.webhookUrl || "No destination")}
                  {entry.key === "sms" && (channels.sms?.recipients || "No recipients")}
                  {entry.key === "whatsapp" && (channels.whatsapp?.recipients || "No recipients")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

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
              <div className="border-t border-slate-200 px-3 py-3 space-y-3">
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">From name</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.fromName || ""}
                          onChange={(e) => setChannel("email", { fromName: e.target.value })}
                          placeholder="Scout Notifications"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Reply-to email</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.replyTo || ""}
                          onChange={(e) => setChannel("email", { replyTo: e.target.value })}
                          placeholder="support@example.com"
                        />
                      </div>
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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Template</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.template || ""}
                          onChange={(e) => setChannel("email", { template: e.target.value })}
                          placeholder="template name"
                        />
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
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Message body <span className="text-red-500">*</span></label>
                      <textarea
                        className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.email.body ? "border-red-400" : "border-slate-300"}`}
                        rows={5}
                        value={channel.body || ""}
                        onChange={(e) => setChannel("email", { body: e.target.value })}
                        placeholder="Use variables like {{variables.referenceId}} and {{trigger.timestamp}}"
                      />
                      {channelErrors.email.body && <p className="mt-1 text-xs text-red-600">{channelErrors.email.body}</p>}
                      {renderVariableButtons("email", "body")}
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
                          <div key={index} className="rounded border border-slate-200 p-2 space-y-2 bg-slate-50">
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <input
                                type="text"
                                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="Name"
                                value={attachment.name || ""}
                                onChange={(e) => updateListItem("email", "attachments", index, { name: e.target.value })}
                              />
                              <input
                                type="text"
                                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="URL"
                                value={attachment.url || ""}
                                onChange={(e) => updateListItem("email", "attachments", index, { url: e.target.value })}
                              />
                              <input
                                type="text"
                                className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                                placeholder="Content type"
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
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Connection or workspace</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.connection || channel.workspace || ""}
                          onChange={(e) => setChannel("teams", { connection: e.target.value, workspace: e.target.value })}
                          placeholder="workspace alias"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Team and channel</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.team || ""}
                            onChange={(e) => setChannel("teams", { team: e.target.value })}
                            placeholder="Team"
                          />
                          <input
                            type="text"
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.channel || ""}
                            onChange={(e) => setChannel("teams", { channel: e.target.value })}
                            placeholder="Channel"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Recipients or mentions</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.mentions || ""}
                          onChange={(e) => setChannel("teams", { mentions: e.target.value })}
                          placeholder="@ops-team, @john"
                        />
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

                    <details className="rounded border border-slate-200 bg-slate-50 p-2">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-700">Advanced options</summary>
                      <div className="mt-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.teams.webhook ? "border-red-400" : "border-slate-300"}`}
                          value={channel.webhookUrl || ""}
                          onChange={(e) => setChannel("teams", { webhookUrl: e.target.value })}
                          placeholder="https://outlook.office.com/webhook/..."
                        />
                        {channelErrors.teams.webhook && <p className="mt-1 text-xs text-red-600">{channelErrors.teams.webhook}</p>}
                      </div>
                    </details>

                    {renderDeliveryAndRetry("teams")}

                    <details className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                      <summary className="cursor-pointer font-semibold text-slate-700">Learn more</summary>
                      <p className="mt-2">Adaptive Card mode supports richer layout and action buttons. Use mentions for key recipients. Webhook URL remains available under advanced options.</p>
                    </details>
                  </div>
                )}

                {entry.key === "slack" && (
                  <div className="grid grid-cols-1 gap-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Connection or workspace</label>
                        <input
                          type="text"
                          className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                          value={channel.connection || channel.workspace || ""}
                          onChange={(e) => setChannel("slack", { connection: e.target.value, workspace: e.target.value })}
                          placeholder="workspace alias"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Channel or DM recipient</label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.channel || ""}
                            onChange={(e) => setChannel("slack", { channel: e.target.value })}
                            placeholder="#channel"
                          />
                          <input
                            type="text"
                            className="rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.directMessageRecipient || ""}
                            onChange={(e) => setChannel("slack", { directMessageRecipient: e.target.value })}
                            placeholder="@user"
                          />
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Mentions</label>
                      <input
                        type="text"
                        className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                        value={channel.mentions || ""}
                        onChange={(e) => setChannel("slack", { mentions: e.target.value })}
                        placeholder="@ops, <!here>"
                      />
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
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Thread timestamp</label>
                          <input
                            type="text"
                            className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
                            value={channel.threadTs || ""}
                            onChange={(e) => setChannel("slack", { threadTs: e.target.value })}
                            placeholder="1731106130.111900"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Webhook URL <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            className={`w-full rounded border px-2 py-1.5 text-sm ${channelErrors.slack.webhook ? "border-red-400" : "border-slate-300"}`}
                            value={channel.webhookUrl || ""}
                            onChange={(e) => setChannel("slack", { webhookUrl: e.target.value })}
                            placeholder="https://hooks.slack.com/services/..."
                          />
                          {channelErrors.slack.webhook && <p className="mt-1 text-xs text-red-600">{channelErrors.slack.webhook}</p>}
                        </div>
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
    <div className="space-y-4">
      {/* Help Section */}
      <details className="border border-slate-300 rounded-lg bg-white">
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

      {/* Variables List */}
      <div>
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

      {/* Usage Example */}
      <details className="border border-slate-300 rounded-lg bg-white">
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
  );
}

function EndConfig({ config, updateConfig, supportsMessage }: any) {
  // "Display message" only makes sense for interactive triggers (manual/chatbot)
  // where a user actually sees the completion message via the player. For other
  // trigger types (email, schedule) there is no viewer, so hide it.
  if (!supportsMessage) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
          This is the end of the orchestration. A completion message can only be
          shown for <span className="font-semibold">Manual</span> and{" "}
          <span className="font-semibold">Chatbot</span> triggers, so there are no
          options to configure here for this trigger type.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
            <p className="mt-1 text-xs text-slate-500">
              You can use variables like {'{{variables.total}}'}, {'{{capturedData.name.value}}'}, or {'{{workflow.Result.status}}'}
            </p>
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
    </div>
  );
}

