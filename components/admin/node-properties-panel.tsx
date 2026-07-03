/**
 * Node Properties Panel
 * Renders appropriate UI controls for each node type configuration
 */

"use client";

import { useState, useEffect } from "react";
import { X, Trash2, Plus, Minus } from "lucide-react";
import type { Node } from "reactflow";
import type { NodeType } from "@/shared/orchestrationTypes";

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
  onClose: () => void;
  onUpdate: (updates: Partial<Node>) => void;
  onDelete: () => void;
}

export function NodePropertiesPanel({ node, onClose, onUpdate, onDelete }: NodePropertiesPanelProps) {
  const nodeType = node.data.nodeType as NodeType;
  const config = node.data.config || {};

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

  return (
    <div className="w-96 border-l border-slate-200 bg-white overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 p-4 z-10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-slate-900">Node Properties</h3>
          <button
            className="text-slate-500 hover:text-slate-700 transition-colors"
            onClick={onClose}
            type="button"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xl">{NODE_CONFIGS.find((n) => n.type === nodeType)?.icon}</span>
            <span className="text-sm font-semibold text-slate-700">
              {NODE_CONFIGS.find((n) => n.type === nodeType)?.label}
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
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

        {/* Node-specific configuration */}
        {nodeType === "trigger" && <TriggerConfig config={config} updateConfig={updateConfig} />}
        {nodeType === "workflow" && <WorkflowConfig config={config} updateConfig={updateConfig} />}
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
  );
}

// ============================================================================
// Node-specific configuration components
// ============================================================================

function TriggerConfig({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Trigger Type <span className="text-red-500">*</span>
        </label>
        <select
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.triggerType || "manual"}
          onChange={(e) => updateConfig({ triggerType: e.target.value })}
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
    </div>
  );
}

function WorkflowConfig({ config, updateConfig }: any) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Workflow ID <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.workflowId || ""}
          onChange={(e) => updateConfig({ workflowId: e.target.value })}
          placeholder="workflow-id or {{variableName}}"
        />
        <p className="mt-1 text-xs text-slate-500">Use workflow ID or {'{{variable}}'}</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">Target URL</label>
        <input
          type="text"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
          value={config.targetUrl || ""}
          onChange={(e) => updateConfig({ targetUrl: e.target.value })}
          placeholder="https://example.com or {{variableName}}"
        />
        <p className="mt-1 text-xs text-slate-500">Target URL for workflow execution</p>
      </div>

      <div>
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
