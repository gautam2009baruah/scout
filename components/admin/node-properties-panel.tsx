/**
 * Node Properties Panel
 * Renders appropriate UI controls for each node type configuration
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { X, Trash2, Plus, Minus, Move, Maximize2 } from "lucide-react";
import type { Node } from "reactflow";
import type { NodeType } from "@/shared/orchestrationTypes";
import Draggable from "react-draggable";
import { MultiSelectDropdown } from "./multi-select-dropdown";

const NODE_CONFIGS = [
  { type: "trigger", label: "Trigger", icon: "⚡" },
  { type: "workflow", label: "Workflow", icon: "🔄" },
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
  onClose: () => void;
  onUpdate: (updates: Partial<Node>) => void;
  onDelete: () => void;
}

export function NodePropertiesPanel({ node, nodes = [], onClose, onUpdate, onDelete }: NodePropertiesPanelProps) {
  const nodeType = node.data.nodeType as NodeType;
  const config = node.data.config || {};
  const [panelWidth, setPanelWidth] = useState(384); // 96 * 4 = 384px (w-96)
  const [panelHeight, setPanelHeight] = useState(600);
  const [position, setPosition] = useState({ x: 0, y: 80 });
  const nodeRef = useRef<HTMLDivElement>(null);

  // Calculate initial position after mount to ensure it's fully visible on LEFT side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setPosition({ x: 32, y: 80 });
    }
  }, []);

  const updateConfig = (updates: Record<string, any>) => {
    onUpdate({
      data: {
        ...node.data,
        config: { ...config, ...updates },
      },
    });
  };

  const updateLabel = (label: string) => {
    onUpdate({
      data: { ...node.data, label },
    });
  };

  const updateDisplayDescription = (displayDescription: string) => {
    onUpdate({
      data: { ...node.data, displayDescription },
    });
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
                  onClick={onClose}
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
            value={node.data.label}
            onChange={(e) => updateLabel(e.target.value)}
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
            value={node.data.displayDescription || ""}
            onChange={(e) => updateDisplayDescription(e.target.value)}
            placeholder="e.g., Extract rate code from email, Fill rate form, Send confirmation"
          />
          <p className="mt-1 text-xs text-slate-500">
            Human-readable description shown to users when orchestration is triggered
          </p>
        </div>

        {/* Node-specific configuration */}
        {nodeType === "trigger" && <TriggerConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "workflow" && <WorkflowConfig config={config} updateConfig={updateConfig} nodes={nodes} />}
        {nodeType === "ai_extraction" && <AIExtractionConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "ai_decision" && <AIDecisionConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "condition" && <ConditionConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "human_approval" && <HumanApprovalConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "notification" && <NotificationConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "variable" && <VariableConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "end" && <EndConfig config={config} updateConfig={updateConfig} />}

        {/* Delete Button */}
        <div className="pt-4 border-t border-slate-200">
          <button
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
            onClick={onDelete}
            type="button"
          >
            <Trash2 className="h-4 w-4" />
            Delete Node
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
            <label className="block text-sm font-medium text-slate-700 mb-1">Intent Name</label>
            <input
              type="text"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
              placeholder="process_report, handle_request"
              value={config.intentName || ""}
              onChange={(e) => updateConfig({ intentName: e.target.value })}
            />
          </div>

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
              id="confirmationRequired"
              checked={config.confirmationRequired !== false}
              onChange={(e) => updateConfig({ confirmationRequired: e.target.checked })}
            />
            <label htmlFor="confirmationRequired" className="text-sm text-slate-700">Require user confirmation</label>
          </div>

          {config.confirmationRequired !== false && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Confirmation Message (optional)</label>
              <textarea
                className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                rows={2}
                placeholder="Custom confirmation message to show user"
                value={config.confirmationMessage || ""}
                onChange={(e) => updateConfig({ confirmationMessage: e.target.value })}
              />
            </div>
          )}

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

function WorkflowConfig({ config, updateConfig, nodes = [] }: any) {
  const [inputMappings, setInputMappings] = useState<Array<{ key: string; value: string }>>(
    Object.entries(config.inputMapping || {}).map(([key, value]) => ({ key, value: value as string }))
  );
  const [outputMappings, setOutputMappings] = useState<Array<{ key: string; value: string }>>(
    Object.entries(config.outputMapping || {}).map(([key, value]) => ({ key, value: value as string }))
  );
  const [availableWorkflows, setAvailableWorkflows] = useState<Array<{ id: string; title: string; status: string }>>([]);
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

  // Fetch available workflows
  useEffect(() => {
    async function fetchWorkflows() {
      try {
        const response = await fetch("/api/admin/guided-workflows");
        if (response.ok) {
          const data = await response.json();
          const workflows = (data.guides || [])
            .filter((guide: any) => guide.status === "published")
            .map((guide: any) => ({
              id: guide.id,
              title: guide.title,
              status: guide.status,
            }));
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
    const outputMapping = outputMappings.reduce((acc, mapping) => {
      if (mapping.key && mapping.value) acc[mapping.key] = mapping.value;
      return acc;
    }, {} as Record<string, string>);
    updateConfig({ outputMapping });
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
              {availableWorkflows.map((workflow) => (
                <option key={workflow.id} value={workflow.id}>
                  {workflow.title} ({workflow.id})
                </option>
              ))}
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
      {availableTriggerPhrases.length > 0 && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Execute When User Says <span className="text-slate-500 text-xs font-normal">(optional)</span>
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

      {/* Input Mapping Section */}
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

      {/* Output Mapping Section */}
      <div className="border-t pt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          📤 Output Mapping
        </label>
        <div className="mb-3 p-3 bg-slate-50 rounded-lg text-xs text-slate-700">
          <p className="font-semibold mb-1">How it works:</p>
          <p className="mb-2">After the workflow runs, it returns <strong>result data</strong>. Save that data to use in later nodes.</p>
          <div className="flex items-center gap-2 text-xs">
            <span className="bg-white px-2 py-1 rounded border">invoiceId</span>
            <span>←</span>
            <span className="bg-white px-2 py-1 rounded border font-mono">output.invoiceId</span>
          </div>
          <p className="mt-1 text-slate-600">↑ Save workflow's "invoiceId" result as "invoiceId" variable</p>
        </div>
        
        {/* Column Headers */}
        <div className="grid grid-cols-[1fr_auto_2fr_auto] gap-2 mb-2 px-1">
          <div className="text-xs font-semibold text-slate-600">
            Variable Name
            <div className="text-[10px] font-normal text-slate-500">Save as this name</div>
          </div>
          <div></div>
          <div className="text-xs font-semibold text-slate-600">
            Workflow Output Field
            <div className="text-[10px] font-normal text-slate-500">Get this from workflow result</div>
          </div>
          <div></div>
        </div>

        <div className="space-y-2">
          {outputMappings.map((mapping, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto_2fr_auto] gap-2 items-center">
              <input
                type="text"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="invoiceId"
                value={mapping.key}
                onChange={(e) => {
                  const updated = [...outputMappings];
                  updated[index].key = e.target.value;
                  setOutputMappings(updated);
                }}
              />
              <span className="flex items-center text-slate-400 text-lg">←</span>
              <input
                type="text"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="output.invoiceId"
                value={mapping.value}
                onChange={(e) => {
                  const updated = [...outputMappings];
                  updated[index].value = e.target.value;
                  setOutputMappings(updated);
                }}
              />
              <button
                type="button"
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                onClick={() => setOutputMappings(outputMappings.filter((_, i) => i !== index))}
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-700"
            onClick={() => setOutputMappings([...outputMappings, { key: "", value: "" }])}
          >
            <Plus className="h-4 w-4" />
            Add Output Mapping
          </button>
        </div>
        <div className="mt-3 p-2 bg-purple-50 border border-purple-200 rounded text-xs text-purple-800">
          <strong>💡 Common Examples:</strong>
          <div className="mt-1 space-y-1 font-mono">
            <div>invoiceId ← output.invoiceId</div>
            <div>pdfUrl ← output.pdfPath</div>
            <div>status ← output.status</div>
          </div>
        </div>
      </div>

      <div className="border-t pt-4">
        <label className="block text-sm font-semibold text-slate-700 mb-1">Execution Mode</label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.executionMode || "auto"}
          onChange={(e) => updateConfig({ executionMode: e.target.value })}
        >
          <option value="auto">Auto</option>
          <option value="manual">Manual</option>
          <option value="scheduled">Scheduled</option>
        </select>
      </div>

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
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Operator <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.operator || "equals"}
          onChange={(e) => updateConfig({ operator: e.target.value })}
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

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Left Value <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.leftValue || ""}
          onChange={(e) => updateConfig({ leftValue: e.target.value })}
          placeholder="{{variableName}} or literal value"
        />
        <p className="mt-1 text-xs text-slate-500">First value to compare</p>
      </div>

      {!["exists", "not_exists", "empty", "not_empty"].includes(config.operator) && (
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Right Value <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            value={config.rightValue || ""}
            onChange={(e) => updateConfig({ rightValue: e.target.value })}
            placeholder="{{variableName}} or literal value"
          />
          <p className="mt-1 text-xs text-slate-500">Second value to compare</p>
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
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Status <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.status || "success"}
          onChange={(e) => updateConfig({ status: e.target.value })}
        >
          <option value="success">Success</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Message</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.message || ""}
          onChange={(e) => updateConfig({ message: e.target.value })}
          placeholder="Completion message"
        />
      </div>
    </div>
  );
}
