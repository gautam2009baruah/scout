/**
 * Node Properties Panel
 * Renders appropriate UI controls for each node type configuration
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { X, Trash2, Plus, Minus, Move, Maximize2, Save } from "lucide-react";
import type { Node, Edge } from "reactflow";
import type { NodeType } from "@/shared/orchestrationTypes";
import Draggable from "react-draggable";
import { MultiSelectDropdown } from "./multi-select-dropdown";

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
  { type: "variable", label: "Variable", icon: "📊" },
  { type: "end", label: "End", icon: "🏁" },
];

interface NodePropertiesPanelProps {
  node: Node;
  nodes?: Node[]; // All nodes in the flow for context-aware suggestions
  edges?: Edge[]; // All edges for checking node connections
  orchestrationId?: string; // Orchestration ID for saving to database
  onClose: () => void;
  onUpdate: (updates: Partial<Node>) => void;
  onDelete: () => void;
  onDatabaseSave?: () => void; // Called after successful database save
}

export function NodePropertiesPanel({ node, nodes = [], edges = [], orchestrationId, onClose, onUpdate, onDelete, onDatabaseSave }: NodePropertiesPanelProps) {
  const nodeType = node.data.nodeType as NodeType;
  
  // Local state for editing (not saved until Save button clicked)
  const [localLabel, setLocalLabel] = useState(node.data.label);
  const [localDisplayDescription, setLocalDisplayDescription] = useState(node.data.displayDescription || "");
  const [localConfig, setLocalConfig] = useState(node.data.config || {});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  
  const [panelWidth, setPanelWidth] = useState(384);
  const [panelHeight, setPanelHeight] = useState(600);
  const [position, setPosition] = useState({ x: 0, y: 80 });
  const nodeRef = useRef<HTMLDivElement>(null);

  // Calculate initial position after mount to ensure it's fully visible on LEFT side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({ x: 32, y: 80 });
    }
  }, []);

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

  // Validate fields before saving
  const validateFields = (): { valid: boolean; error: string | null } => {
    // Check node label is not empty
    if (!localLabel.trim()) {
      return { valid: false, error: "Node label is required" };
    }

    // Node-specific validations
    if (nodeType === "end" && localConfig.displayMessage && !localConfig.message?.trim()) {
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
      
      setPanelWidth(Math.max(300, Math.min(newWidth, typeof window !== 'undefined' ? window.innerWidth - 32 : 1200)));
      setPanelHeight(Math.max(400, Math.min(newHeight, typeof window !== 'undefined' ? window.innerHeight - 100 : 800)));
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

  return (
    <>
      <Draggable
        handle=".drag-handle"
        nodeRef={nodeRef}
        position={position}
        onDrag={(e, data) => {
          setPosition({ x: data.x, y: data.y });
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
                    setPanelWidth(384);
                    setPanelHeight(600);
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
        {nodeType === "trigger" && <TriggerConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "workflow" && <WorkflowConfig config={localConfig} updateConfig={updateLocalConfig} nodes={nodes} edges={edges} currentNode={node} />}
        {nodeType === "data_capture" && <DataCaptureConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_extraction" && <AIExtractionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "ai_decision" && <AIDecisionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "condition" && <ConditionConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "human_approval" && <HumanApprovalConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "notification" && <NotificationConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "variable" && <VariableConfig config={localConfig} updateConfig={updateLocalConfig} />}
        {nodeType === "end" && <EndConfig config={localConfig} updateConfig={updateLocalConfig} />}

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
  );
}

// ============================================================================
// Node-specific configuration components
// ============================================================================

function TriggerConfig({ config, updateConfig }: any) {
  const [triggerType, setTriggerType] = useState(config.triggerType || "manual");
  const [inputFields, setInputFields] = useState<any[]>(config.inputFields || []);
  const [examplePhrases, setExamplePhrases] = useState<string[]>(config.examplePhrases || []);
  const [requiredVariables, setRequiredVariables] = useState<any[]>(config.requiredVariables || []);
  
  const handleTriggerTypeChange = (newType: string) => {
    setTriggerType(newType);
    updateConfig({ triggerType: newType });
  };

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
          <option value="manual">Manual</option>
          <option value="chatbot">Chatbot</option>
          <option value="schedule">Schedule</option>
          <option value="webhook">Webhook</option>
          <option value="api">API</option>
          <option value="email">Email</option>
          <option value="file_upload">File Upload</option>
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
            </div>
          )}

          {(config.scheduleType === "daily" || config.scheduleType === "weekly" || config.scheduleType === "monthly") && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input
                type="time"
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                value={config.specificTime || "00:00"}
                onChange={(e) => updateConfig({ specificTime: e.target.value })}
              />
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
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="UTC, America/New_York, Europe/London"
              value={config.timezone || "UTC"}
              onChange={(e) => updateConfig({ timezone: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="scheduleEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="scheduleEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>
        </div>
      )}

      {/* Webhook Trigger Configuration */}
      {triggerType === "webhook" && (
        <div className="border-l-4 border-blue-500 bg-blue-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Webhook Settings</h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Allowed HTTP Methods</label>
            <div className="flex gap-3">
              {["GET", "POST", "PUT"].map((method) => (
                <label key={method} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={(config.allowedMethods || ["POST"]).includes(method)}
                    onChange={(e) => {
                      const current = config.allowedMethods || ["POST"];
                      const updated = e.target.checked
                        ? [...current, method]
                        : current.filter((m: string) => m !== method);
                      updateConfig({ allowedMethods: updated });
                    }}
                  />
                  {method}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">IP Allowlist (optional)</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="192.168.1.1, 10.0.0.5"
              value={(config.allowedIPs || []).join(", ")}
              onChange={(e) => {
                const ips = e.target.value.split(",").map(ip => ip.trim()).filter(ip => ip);
                updateConfig({ allowedIPs: ips });
              }}
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated IP addresses</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="webhookEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="webhookEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>

          <p className="text-xs text-blue-700">ℹ️ Webhook URL and secret will be generated when trigger is created</p>
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

      {/* API Trigger Configuration */}
      {triggerType === "api" && (
        <div className="border-l-4 border-indigo-500 bg-indigo-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">API Trigger Settings</h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Rate Limit (requests/minute)</label>
            <input
              type="number"
              min="0"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="0 = unlimited"
              value={config.rateLimit || 60}
              onChange={(e) => updateConfig({ rateLimit: parseInt(e.target.value) || 0 })}
            />
            <p className="text-xs text-slate-500 mt-1">0 means unlimited</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="apiEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="apiEnabled" className="text-sm text-slate-700">Enabled</label>
          </div>

          <p className="text-xs text-indigo-700">ℹ️ API clients can be managed separately</p>
        </div>
      )}

      {/* Email Trigger Configuration */}
      {triggerType === "email" && (
        <div className="border-l-4 border-pink-500 bg-pink-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">Email Trigger Settings</h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Provider</label>
            <select
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.provider || "gmail"}
              onChange={(e) => updateConfig({ provider: e.target.value })}
            >
              <option value="gmail">Gmail</option>
              <option value="outlook">Microsoft Outlook</option>
              <option value="imap">IMAP (Generic)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mailbox/Email Address</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="inbox@company.com"
              value={config.mailbox || ""}
              onChange={(e) => updateConfig({ mailbox: e.target.value })}
            />
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
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Sender Filter (optional)</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="sender@domain.com"
              value={config.senderFilter || ""}
              onChange={(e) => updateConfig({ senderFilter: e.target.value })}
            />
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

          <p className="text-xs text-pink-700">ℹ️ Email credentials must be configured separately</p>
        </div>
      )}

      {/* File Upload Trigger Configuration */}
      {triggerType === "file_upload" && (
        <div className="border-l-4 border-teal-500 bg-teal-50 p-4 rounded space-y-3">
          <h4 className="text-sm font-semibold text-slate-700">File Upload Settings</h4>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Allowed File Types</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder=".pdf, .docx, .txt"
              value={(config.allowedFileTypes || []).join(", ")}
              onChange={(e) => {
                const types = e.target.value.split(",").map(t => t.trim()).filter(t => t);
                updateConfig({ allowedFileTypes: types });
              }}
            />
            <p className="text-xs text-slate-500 mt-1">Comma-separated file extensions</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Max File Size (MB)</label>
            <input
              type="number"
              min="1"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              value={config.maxFileSizeMB || 10}
              onChange={(e) => updateConfig({ maxFileSizeMB: parseInt(e.target.value) || 10 })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Storage Location</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="./storage/uploads"
              value={config.storageLocation || "./storage/uploads"}
              onChange={(e) => updateConfig({ storageLocation: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowMultipleFiles"
              checked={config.allowMultipleFiles !== false}
              onChange={(e) => updateConfig({ allowMultipleFiles: e.target.checked })}
            />
            <label htmlFor="allowMultipleFiles" className="text-sm text-slate-700">Allow multiple files</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="virusScanEnabled"
              checked={config.virusScanEnabled === true}
              onChange={(e) => updateConfig({ virusScanEnabled: e.target.checked })}
            />
            <label htmlFor="virusScanEnabled" className="text-sm text-slate-700">Enable virus scanning</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="aiExtractionCompatible"
              checked={config.aiExtractionCompatible === true}
              onChange={(e) => updateConfig({ aiExtractionCompatible: e.target.checked })}
            />
            <label htmlFor="aiExtractionCompatible" className="text-sm text-slate-700">AI extraction compatible</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="fileUploadEnabled"
              checked={config.enabled !== false}
              onChange={(e) => updateConfig({ enabled: e.target.checked })}
            />
            <label htmlFor="fileUploadEnabled" className="text-sm text-slate-700">Enabled</label>
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
                  <p className="mt-1 text-[10px] text-slate-500">Variable name for next nodes</p>
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
                Variable name to store captured data. Access as {'{{capturedData.fieldName}}'}. Useful when you have multiple data capture nodes and need to keep their data separate (e.g., userInfo, orderDetails).
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AIExtractionConfig({ config, updateConfig }: any) {
  const [schemaFields, setSchemaFields] = useState<Array<{ key: string; type: string }>>(
    Object.entries(config.schema || {}).map(([key, type]) => ({ key, type: type as string }))
  );

  useEffect(() => {
    const schema = schemaFields.reduce((acc, field) => {
      if (field.key) acc[field.key] = field.type;
      return acc;
    }, {} as Record<string, string>);
    updateConfig({ schema });
  }, [schemaFields]);

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
          <option value="custom">Custom</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Model</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.model || ""}
          onChange={(e) => updateConfig({ model: e.target.value })}
          placeholder="gpt-4, gemini-pro, claude-3-opus, etc."
        />
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
          placeholder="{{variableName}} or literal text"
        />
        <p className="mt-1 text-xs text-slate-500">Text to extract data from</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Extraction Schema <span className="text-red-500">*</span>
        </label>
        <div className="space-y-2">
          {schemaFields.map((field, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="Field name"
                value={field.key}
                onChange={(e) => {
                  const updated = [...schemaFields];
                  updated[index].key = e.target.value;
                  setSchemaFields(updated);
                }}
              />
              <select
                className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
            onClick={() => setSchemaFields([...schemaFields, { key: "", type: "string" }])}
          >
            <Plus className="h-4 w-4" />
            Add Field
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Define fields to extract from text</p>
      </div>
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
  const [conditions, setConditions] = useState<Array<{ variable: string; operator: string; value?: string; logicAfter?: "and" | "or" }>>(
    config.conditions || [{ variable: "", operator: "equals", value: "", logicAfter: "and" }]
  );

  useEffect(() => {
    updateConfig({ conditions });
  }, [conditions]);

  const addCondition = () => {
    setConditions([...conditions, { variable: "", operator: "equals", value: "", logicAfter: "and" }]);
  };

  const removeCondition = (index: number) => {
    if (conditions.length > 1) {
      setConditions(conditions.filter((_, i) => i !== index));
    }
  };

  const updateCondition = (index: number, field: string, value: string) => {
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
              <div className="text-blue-600">{"{{datacapture.email}}"}</div>
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
                  <code className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-xs">{"{{datacapture.xxx}}"}</code>
                </div>
                <p className="text-xs text-slate-600 mb-1">Captures user input from forms during workflow execution.</p>
                <div className="bg-slate-50 rounded p-1.5 text-xs font-mono">
                  <div className="text-slate-500">Captured fields: email, phone, address</div>
                  <div className="text-blue-600 mt-1">Use: {"{{datacapture.email}}"}</div>
                  <div className="text-blue-600">Use: {"{{datacapture.phone}}"}</div>
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
                <p className="text-xs text-slate-600 mb-1">Data passed when orchestration starts (API, manual trigger).</p>
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
                  <div>Variable: <span className="text-blue-600">{"{{datacapture.customerType}}"}</span></div>
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
                  <div>Variable: <span className="text-blue-600">{"{{datacapture.email}}"}</span></div>
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
                      placeholder="{{variableName}} or literal value"
                    />
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
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Channel <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.channel || "email"}
          onChange={(e) => updateConfig({ channel: e.target.value })}
        >
          <option value="email">Email</option>
          <option value="teams">Microsoft Teams</option>
          <option value="slack">Slack</option>
          <option value="internal">Internal Notification</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Recipient <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.recipient || ""}
          onChange={(e) => updateConfig({ recipient: e.target.value })}
          placeholder={
            config.channel === "email" || config.channel === "internal"
              ? "user@example.com or {{variableName}}"
              : "Webhook URL"
          }
        />
        <p className="mt-1 text-xs text-slate-500">
          {config.channel === "email" || config.channel === "internal"
            ? "Email address or {{variable}}"
            : "Incoming webhook URL"}
        </p>
      </div>

      {(config.channel === "email" || config.channel === "internal") && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Subject <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={config.subject || ""}
            onChange={(e) => updateConfig({ subject: e.target.value })}
            placeholder="Notification subject"
          />
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          rows={5}
          value={config.message || ""}
          onChange={(e) => updateConfig({ message: e.target.value })}
          placeholder="Use {{variableName}} for dynamic content"
        />
        <p className="mt-1 text-xs text-slate-500">Supports {'{{variable}}'} substitution</p>
      </div>
    </div>
  );
}

function VariableConfig({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Operation <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.operation || "create"}
          onChange={(e) => updateConfig({ operation: e.target.value })}
        >
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="transform">Transform</option>
          <option value="delete">Delete</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Variable Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.variableName || ""}
          onChange={(e) => updateConfig({ variableName: e.target.value })}
          placeholder="variableName or nested.path"
        />
        <p className="mt-1 text-xs text-slate-500">Use dot notation for nested: customer.email</p>
      </div>

      {config.operation !== "delete" && (
        <>
          {config.operation === "transform" ? (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Expression <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                value={config.expression || ""}
                onChange={(e) => updateConfig({ expression: e.target.value })}
                placeholder="{{price}} * 1.1"
              />
              <p className="mt-1 text-xs text-slate-500">Math or string expression</p>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Value <span className="text-red-500">*</span>
              </label>
              <textarea
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={config.value || ""}
                onChange={(e) => updateConfig({ value: e.target.value })}
                placeholder="{{variableName}} or literal value"
              />
              <p className="mt-1 text-xs text-slate-500">Use {'{{variable}}'} or enter literal value</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EndConfig({ config, updateConfig }: any) {
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
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={config.message || ""}
            onChange={(e) => updateConfig({ message: e.target.value })}
            placeholder="e.g., Orchestration completed successfully!"
            rows={3}
          />
          <p className="mt-1 text-xs text-slate-500">Message shown to user at completion</p>
        </div>
      )}
    </div>
  );
}
