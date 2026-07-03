/**
 * Orchestration Designer with React Flow
 * Visual drag-and-drop workflow orchestration builder
 * 
 * Features:
 * - Drag nodes from toolbox onto canvas
 * - Draw connections between nodes
 * - Configure node properties
 * - Save/publish orchestrations
 * - Execute orchestrations
 */

"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import ReactFlow, {
  Node,
  Edge,
  Connection,
  addEdge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  BackgroundVariant,
  Panel,
  NodeTypes,
  Handle,
  Position,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  Play,
  Save,
  Upload,
  Trash2,
  Settings,
  Plus,
  X,
} from "lucide-react";
import type { NodeType, Orchestration, ManualTriggerConfig } from "@/shared/orchestrationTypes";
import { NodePropertiesPanel } from "./node-properties-panel";
import { ManualTriggerDialog } from "./manual-trigger-dialog";

type CompanyOption = { id: string; name: string };

const NODE_CONFIGS: Array<{ type: NodeType; label: string; icon: string; color: string }> = [
  { type: "trigger", label: "Trigger", icon: "⚡", color: "#10b981" },
  { type: "workflow", label: "Workflow", icon: "🔄", color: "#3b82f6" },
  { type: "ai_extraction", label: "AI Extraction", icon: "🤖", color: "#8b5cf6" },
  { type: "ai_decision", label: "AI Decision", icon: "🧠", color: "#a855f7" },
  { type: "condition", label: "Condition", icon: "❓", color: "#f59e0b" },
  { type: "human_approval", label: "Human Approval", icon: "✋", color: "#ec4899" },
  { type: "notification", label: "Notification", icon: "📧", color: "#06b6d4" },
  { type: "variable", label: "Variable", icon: "📊", color: "#14b8a6" },
  { type: "end", label: "End", icon: "🏁", color: "#ef4444" },
];

// Custom Node Component
function CustomNode({ data }: { data: any }) {
  const config = NODE_CONFIGS.find((n) => n.type === data.nodeType);
  return (
    <div
      className="relative rounded-lg border-2 bg-white px-4 py-3 shadow-md"
      style={{ borderColor: config?.color || "#64748b", minWidth: 150 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-700"
      />
      <div className="flex items-center gap-2">
        <span className="text-xl">{config?.icon}</span>
        <div className="flex-1">
          <div className="text-xs font-semibold text-slate-500">{config?.label}</div>
          <div className="text-sm font-semibold text-slate-900">{data.label}</div>
        </div>
      </div>
    </div>
  );
}

// Node type mapping for React Flow
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

export function OrchestrationDesigner({ companies }: { companies: CompanyOption[] }) {
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isManualTriggerOpen, setIsManualTriggerOpen] = useState(false);
  const [manualTriggerConfig, setManualTriggerConfig] = useState<ManualTriggerConfig | null>(null);

  // Load orchestration data when orchestration changes
  useEffect(() => {
    if (!orchestration?.id) return;

    // Load nodes
    fetch(`/api/admin/orchestrations/nodes?orchestrationId=${orchestration.id}`)
      .then((res) => res.json())
      .then((data) => {
        const flowNodes: Node[] = data.nodes.map((node: any) => ({
          id: node.id,
          type: "custom",
          position: { x: node.positionX, y: node.positionY },
          data: {
            label: node.label,
            nodeType: node.nodeType,
            config: node.config,
          },
        }));
        setNodes(flowNodes);
      });

    // Load connections
    fetch(`/api/admin/orchestrations/connections?orchestrationId=${orchestration.id}`)
      .then((res) => res.json())
      .then((data) => {
        const flowEdges: Edge[] = data.connections.map((conn: any) => ({
          id: conn.id,
          source: conn.sourceNodeId,
          target: conn.targetNodeId,
          sourceHandle: conn.sourceHandle,
          targetHandle: conn.targetHandle,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
        }));
        setEdges(flowEdges);
      });
  }, [orchestration?.id, setNodes, setEdges]);

  // Handle connection creation
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        id: `edge-${Date.now()}`,
        markerEnd: { type: MarkerType.ArrowClosed },
        type: "smoothstep",
      };
      setEdges((eds) => addEdge(newEdge as Edge, eds));
    },
    [setEdges]
  );

  // Handle node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setIsPropertiesOpen(true);
  }, []);

  // Update selected node
  const updateSelectedNode = useCallback(
    (updates: Partial<Node>) => {
      if (!selectedNode) return;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === selectedNode.id ? { ...node, ...updates } : node
        )
      );
      setSelectedNode({ ...selectedNode, ...updates });
    },
    [selectedNode, setNodes]
  );

  // Add node from toolbox
  const addNode = useCallback(
    (nodeType: NodeType) => {
      if (!orchestration) {
        alert("Please create an orchestration first");
        return;
      }

      const config = NODE_CONFIGS.find((n) => n.type === nodeType);
      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: "custom",
        position: {
          x: Math.random() * 400 + 100,
          y: Math.random() * 300 + 100,
        },
        data: {
          label: config?.label || "Node",
          nodeType,
          config: {},
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [orchestration, setNodes]
  );

  // Delete selected node
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((node) => node.id !== selectedNode.id));
    setEdges((eds) => eds.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id));
    setSelectedNode(null);
    setIsPropertiesOpen(false);
  }, [selectedNode, setNodes, setEdges]);

  // Save orchestration
  const saveOrchestration = async () => {
    if (!orchestration) return;

    try {
      // Save/update orchestration
      const response = await fetch("/api/admin/orchestrations", {
        method: orchestration.createdAt ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: orchestration.id,
          companyId: orchestration.companyId,
          name: orchestration.name,
          description: orchestration.description,
          triggerType: orchestration.triggerType,
          triggerConfig: orchestration.triggerConfig,
          variables: orchestration.variables,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to save orchestration");
      }

      // Delete all existing nodes and connections
      const existingNodes = await fetch(`/api/admin/orchestrations/nodes?orchestrationId=${orchestration.id}`).then(r => r.json());
      for (const node of existingNodes.nodes || []) {
        await fetch(`/api/admin/orchestrations/nodes?id=${node.id}`, { method: "DELETE" });
      }

      const existingConns = await fetch(`/api/admin/orchestrations/connections?orchestrationId=${orchestration.id}`).then(r => r.json());
      for (const conn of existingConns.connections || []) {
        await fetch(`/api/admin/orchestrations/connections?id=${conn.id}`, { method: "DELETE" });
      }

      // Save nodes
      const nodeIdMap = new Map<string, string>();
      for (const node of nodes) {
        const nodeResponse = await fetch("/api/admin/orchestrations/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orchestrationId: orchestration.id,
            nodeType: node.data.nodeType,
            label: node.data.label,
            positionX: node.position.x,
            positionY: node.position.y,
            config: node.data.config,
          }),
        });
        const savedNode = await nodeResponse.json();
        nodeIdMap.set(node.id, savedNode.node.id);
      }

      // Save connections/edges
      for (const edge of edges) {
        await fetch("/api/admin/orchestrations/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orchestrationId: orchestration.id,
            sourceNodeId: nodeIdMap.get(edge.source) || edge.source,
            targetNodeId: nodeIdMap.get(edge.target) || edge.target,
            sourceHandle: edge.sourceHandle,
            targetHandle: edge.targetHandle,
          }),
        });
      }

      alert("Orchestration saved successfully!");
    } catch (error) {
      console.error("Error saving orchestration:", error);
      alert(error instanceof Error ? error.message : "Failed to save orchestration");
    }
  };

  // Publish orchestration
  const publishOrchestration = async () => {
    if (!orchestration) return;

    if (!confirm("Publish this orchestration? This will make it available for execution.")) {
      return;
    }

    try {
      const response = await fetch("/api/admin/orchestrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: orchestration.id,
          publish: true,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to publish orchestration");
      }

      const result = await response.json();
      setOrchestration(result.orchestration);
      alert("Orchestration published successfully!");
    } catch (error) {
      console.error("Error publishing orchestration:", error);
      alert(error instanceof Error ? error.message : "Failed to publish orchestration");
    }
  };

  // Execute orchestration via manual trigger
  const executeOrchestration = async () => {
    if (!orchestration) return;

    if (orchestration.status !== "published") {
      alert("Please publish the orchestration before executing it.");
      return;
    }

    try {
      // Get manual trigger configuration
      const response = await fetch(
        `/api/admin/orchestrations/triggers?orchestrationId=${orchestration.id}&triggerType=manual&status=active`
      );

      if (!response.ok) {
        throw new Error("Failed to get trigger configuration");
      }

      const data = await response.json();
      
      if (!data.triggers || data.triggers.length === 0) {
        // No manual trigger exists, create default one
        const createResponse = await fetch("/api/admin/orchestrations/triggers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orchestrationId: orchestration.id,
            triggerType: "manual",
            name: "Manual Trigger",
            description: "Manually start this orchestration",
            config: {
              type: "manual",
              inputFields: [],
            },
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to create manual trigger");
        }

        const newTrigger = await createResponse.json();
        setManualTriggerConfig(newTrigger.config as ManualTriggerConfig);
      } else {
        setManualTriggerConfig(data.triggers[0].config as ManualTriggerConfig);
      }

      setIsManualTriggerOpen(true);
    } catch (error) {
      console.error("Error preparing manual trigger:", error);
      alert(error instanceof Error ? error.message : "Failed to prepare manual trigger");
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          {!orchestration ? (
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => setIsCreateDialogOpen(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              New Orchestration
            </button>
          ) : (
            <>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={saveOrchestration}
                type="button"
              >
                <Save className="h-4 w-4" />
                Save Draft
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                onClick={publishOrchestration}
                type="button"
              >
                <Upload className="h-4 w-4" />
                Publish
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                onClick={executeOrchestration}
                type="button"
              >
                <Play className="h-4 w-4" />
                Run
              </button>
            </>
          )}
        </div>

        {orchestration && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">
              {orchestration.name} <span className="text-xs text-slate-500">v{orchestration.version}</span>
            </span>
            <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${
              orchestration.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
            }`}>
              {orchestration.status}
            </span>
          </div>
        )}
      </div>

      {orchestration ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Node Toolbox */}
          <div className="w-56 border-r border-slate-200 bg-white p-4 overflow-y-auto">
            <h3 className="mb-3 text-sm font-bold text-slate-900">Node Types</h3>
            <div className="space-y-2">
              {NODE_CONFIGS.map((nodeConfig) => (
                <button
                  key={nodeConfig.type}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                  onClick={() => addNode(nodeConfig.type)}
                  type="button"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{nodeConfig.icon}</span>
                    <span>{nodeConfig.label}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold mb-1">💡 Tips:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Click a node to add it</li>
                <li>Drag nodes to reposition</li>
                <li>Drag from node edge to connect</li>
                <li>Click node to edit properties</li>
              </ul>
            </div>
          </div>

          {/* React Flow Canvas */}
          <div className="flex-1 bg-slate-50">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              fitView
              snapToGrid
              snapGrid={[15, 15]}
              defaultEdgeOptions={{
                type: "smoothstep",
                markerEnd: { type: MarkerType.ArrowClosed },
              }}
            >
              <Background variant={BackgroundVariant.Dots} gap={15} size={1} />
              <Controls />
              <MiniMap
                nodeColor={(node) => {
                  const config = NODE_CONFIGS.find((n) => n.type === node.data.nodeType);
                  return config?.color || "#64748b";
                }}
                nodeBorderRadius={8}
              />
              <Panel position="top-right" className="bg-white rounded-lg shadow-md p-2 text-xs text-slate-600">
                {nodes.length} nodes, {edges.length} connections
              </Panel>
            </ReactFlow>
          </div>

          {/* Properties Panel */}
          {isPropertiesOpen && selectedNode && (
            <NodePropertiesPanel
              node={selectedNode}
              onClose={() => setIsPropertiesOpen(false)}
              onUpdate={(updates) => updateSelectedNode(updates)}
              onDelete={deleteSelectedNode}
            />
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <Settings className="mx-auto h-16 w-16 text-slate-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No Orchestration Loaded</h3>
            <p className="mt-2 text-sm text-slate-500">
              Create a new orchestration to get started with visual workflow design
            </p>
            <button
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => setIsCreateDialogOpen(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              New Orchestration
            </button>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {isCreateDialogOpen && (
        <CreateOrchestrationDialog
          companies={companies}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={(newOrchestration) => {
            setOrchestration(newOrchestration);
            setIsCreateDialogOpen(false);
          }}
        />
      )}

      {/* Manual Trigger Dialog */}
      {isManualTriggerOpen && orchestration && manualTriggerConfig && (
        <ManualTriggerDialog
          orchestrationId={orchestration.id}
          orchestrationName={orchestration.name}
          triggerConfig={manualTriggerConfig}
          onClose={() => setIsManualTriggerOpen(false)}
          onSuccess={(executionId) => {
            setIsManualTriggerOpen(false);
            alert(`Orchestration execution started! Execution ID: ${executionId}`);
          }}
        />
      )}
    </div>
  );
}

function CreateOrchestrationDialog({
  companies,
  onClose,
  onCreate,
}: {
  companies: CompanyOption[];
  onClose: () => void;
  onCreate: (orchestration: Orchestration) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [triggerType, setTriggerType] = useState<"manual" | "chatbot" | "schedule" | "webhook">("manual");
  const [creating, setCreating] = useState(false);

  // Webhook configuration
  const [webhookMethods, setWebhookMethods] = useState<Array<"GET" | "POST" | "PUT">>(["POST"]);
  const [webhookIPs, setWebhookIPs] = useState("");

  // Schedule configuration
  const [scheduleExpression, setScheduleExpression] = useState("0 0 * * *");
  const [scheduleTimezone, setScheduleTimezone] = useState("UTC");

  const handleCreate = async () => {
    setCreating(true);
    try {
      // Build trigger config based on type
      let triggerConfig = {};
      if (triggerType === "webhook") {
        triggerConfig = {
          type: "webhook",
          allowedMethods: webhookMethods,
          allowedIPs: webhookIPs ? webhookIPs.split(",").map(ip => ip.trim()).filter(ip => ip) : undefined,
          enabled: true,
        };
      } else if (triggerType === "schedule") {
        triggerConfig = {
          type: "schedule",
          cronExpression: scheduleExpression,
          timezone: scheduleTimezone,
          enabled: true,
        };
      } else if (triggerType === "manual") {
        triggerConfig = {
          type: "manual",
          inputFields: [],
        };
      } else if (triggerType === "chatbot") {
        triggerConfig = {
          type: "chatbot",
          enabled: true,
        };
      }

      const response = await fetch("/api/admin/orchestrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          name,
          description,
          triggerType,
          triggerConfig,
          variables: {},
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to create orchestration");
      }

      const result = await response.json();
      onCreate(result.orchestration);
    } catch (error) {
      console.error("Error creating orchestration:", error);
      alert(error instanceof Error ? error.message : "Failed to create orchestration");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-xl font-bold text-slate-900">Create Orchestration</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600">Name</label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workflow"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600">Description</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this orchestration do?"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600">Company</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600">Trigger Type</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as any)}
            >
              <option value="manual">Manual</option>
              <option value="chatbot">Chatbot</option>
              <option value="schedule">Schedule</option>
              <option value="webhook">Webhook</option>
            </select>
          </div>

          {/* Webhook Configuration */}
          {triggerType === "webhook" && (
            <div className="space-y-3 border-l-4 border-blue-500 bg-blue-50 p-4 rounded">
              <h4 className="text-sm font-semibold text-slate-700">Webhook Settings</h4>
              
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-2">
                  Allowed HTTP Methods
                </label>
                <div className="flex gap-3">
                  {(["GET", "POST", "PUT"] as const).map((method) => (
                    <label key={method} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={webhookMethods.includes(method)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setWebhookMethods([...webhookMethods, method]);
                          } else {
                            setWebhookMethods(webhookMethods.filter((m) => m !== method));
                          }
                        }}
                        className="mr-2"
                      />
                      <span className="text-sm">{method}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  IP Allowlist (optional)
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={webhookIPs}
                  onChange={(e) => setWebhookIPs(e.target.value)}
                  placeholder="192.168.1.1, 10.0.0.5"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated IP addresses</p>
              </div>

              <p className="text-xs text-blue-700">
                ℹ️ A unique webhook URL and secret will be generated after creation
              </p>
            </div>
          )}

          {/* Schedule Configuration */}
          {triggerType === "schedule" && (
            <div className="space-y-3 border-l-4 border-purple-500 bg-purple-50 p-4 rounded">
              <h4 className="text-sm font-semibold text-slate-700">Schedule Settings</h4>
              
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Cron Expression
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
                  value={scheduleExpression}
                  onChange={(e) => setScheduleExpression(e.target.value)}
                  placeholder="0 0 * * *"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Format: minute hour day month weekday (e.g., "0 0 * * *" = daily at midnight)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                  Timezone
                </label>
                <input
                  type="text"
                  className="w-full rounded border border-slate-300 px-3 py-2 text-sm"
                  value={scheduleTimezone}
                  onChange={(e) => setScheduleTimezone(e.target.value)}
                  placeholder="UTC"
                />
                <p className="text-xs text-slate-500 mt-1">e.g., UTC, America/New_York, Europe/London</p>
              </div>
            </div>
          )}

          {/* Manual Trigger Info */}
          {triggerType === "manual" && (
            <div className="border-l-4 border-green-500 bg-green-50 p-3 rounded">
              <p className="text-xs text-green-700">
                ℹ️ Manual triggers can be executed from the UI with custom input fields (configurable after creation)
              </p>
            </div>
          )}

          {/* Chatbot Trigger Info */}
          {triggerType === "chatbot" && (
            <div className="border-l-4 border-orange-500 bg-orange-50 p-3 rounded">
              <p className="text-xs text-orange-700">
                ℹ️ Chatbot triggers are automatically invoked when users interact with the Scout chatbot
              </p>
            </div>
          )}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            disabled={creating}
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!name || !companyId || creating}
            onClick={handleCreate}
            type="button"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
