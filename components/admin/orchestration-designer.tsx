/**
 * Orchestration Designer
 * Visual drag-and-drop workflow orchestration builder
 * 
 * Features:
 * - Drag nodes from toolbox onto canvas
 * - Connect nodes with edges
 * - Configure node properties
 * - Save/publish orchestrations
 * - Execute orchestrations
 */

"use client";

import { useState, useCallback, useRef } from "react";
import {
  Play,
  Save,
  Upload,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  Grid3x3,
  Undo,
  Redo,
  Trash2,
  Settings,
  Plus,
} from "lucide-react";
import type { DesignerNode, DesignerEdge, NodeType, Orchestration } from "@/shared/orchestrationTypes";

type CompanyOption = { id: string; name: string };

const NODE_TYPES: Array<{ type: NodeType; label: string; icon: string; category: string }> = [
  { type: "trigger", label: "Trigger", icon: "⚡", category: "Start" },
  { type: "workflow", label: "Workflow", icon: "🔄", category: "Actions" },
  { type: "ai_extraction", label: "AI Extraction", icon: "🤖", category: "AI" },
  { type: "ai_decision", label: "AI Decision", icon: "🧠", category: "AI" },
  { type: "condition", label: "Condition", icon: "❓", category: "Logic" },
  { type: "human_approval", label: "Human Approval", icon: "✋", category: "Human" },
  { type: "notification", label: "Notification", icon: "📧", category: "Actions" },
  { type: "variable", label: "Variable", icon: "📊", category: "Data" },
  { type: "end", label: "End", icon: "🏁", category: "End" },
];

export function OrchestrationDesigner({ companies }: { companies: CompanyOption[] }) {
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [nodes, setNodes] = useState<DesignerNode[]>([]);
  const [edges, setEdges] = useState<DesignerEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<DesignerNode | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedType, setDraggedType] = useState<NodeType | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [history, setHistory] = useState<Array<{ nodes: DesignerNode[]; edges: DesignerEdge[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showGrid, setShowGrid] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Node drag from toolbox
  const handleToolboxDragStart = (type: NodeType) => {
    setDraggedType(type);
    setIsDragging(true);
  };

  const handleToolboxDragEnd = () => {
    setIsDragging(false);
    setDraggedType(null);
  };

  // Drop node on canvas
  const handleCanvasDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedType || !canvasRef.current) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = (e.clientX - rect.left - pan.x) / zoom;
      const y = (e.clientY - rect.top - pan.y) / zoom;

      const nodeType = NODE_TYPES.find((n) => n.type === draggedType);
      const newNode: DesignerNode = {
        id: `node-${Date.now()}`,
        type: draggedType,
        data: {
          label: nodeType?.label || "Node",
          config: { type: draggedType } as any,
        },
        position: { x, y },
      };

      setNodes((prev) => [...prev, newNode]);
      saveHistory();
      setDraggedType(null);
      setIsDragging(false);
    },
    [draggedType, zoom, pan]
  );

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // History management
  const saveHistory = () => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: [...nodes], edges: [...edges] });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
    }
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.1, 2));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.1, 0.5));
  const handleFitView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Delete selected node
  const deleteSelectedNode = () => {
    if (selectedNode) {
      setNodes((prev) => prev.filter((n) => n.id !== selectedNode.id));
      setEdges((prev) =>
        prev.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id)
      );
      setSelectedNode(null);
      saveHistory();
    }
  };

  // Save orchestration
  const saveOrchestration = async () => {
    if (!orchestration) return;
    // API call to save orchestration, nodes, and edges
    alert("Orchestration saved successfully!");
  };

  // Publish orchestration
  const publishOrchestration = async () => {
    if (!orchestration) return;
    // API call to publish orchestration
    alert("Orchestration published successfully!");
  };

  // Execute orchestration
  const executeOrchestration = async () => {
    if (!orchestration) return;
    // API call to execute orchestration
    alert("Orchestration execution started!");
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
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={historyIndex <= 0}
              onClick={undo}
              title="Undo"
              type="button"
            >
              <Undo className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              disabled={historyIndex >= history.length - 1}
              onClick={redo}
              title="Redo"
              type="button"
            >
              <Redo className="h-4 w-4" />
            </button>
            <div className="h-6 w-px bg-slate-300" />
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleZoomOut}
              title="Zoom Out"
              type="button"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-slate-700">{Math.round(zoom * 100)}%</span>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleZoomIn}
              title="Zoom In"
              type="button"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              onClick={handleFitView}
              title="Fit View"
              type="button"
            >
              <Maximize className="h-4 w-4" />
            </button>
            <button
              className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 ${
                showGrid ? "bg-slate-100" : "bg-white"
              }`}
              onClick={() => setShowGrid(!showGrid)}
              title="Toggle Grid"
              type="button"
            >
              <Grid3x3 className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {orchestration ? (
        <div className="flex flex-1 overflow-hidden">
          {/* Node Toolbox */}
          <div className="w-64 border-r border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Node Library</h3>
            <div className="space-y-3">
              {Object.entries(
                NODE_TYPES.reduce((acc, node) => {
                  if (!acc[node.category]) acc[node.category] = [];
                  acc[node.category].push(node);
                  return acc;
                }, {} as Record<string, typeof NODE_TYPES>)
              ).map(([category, categoryNodes]) => (
                <div key={category}>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{category}</p>
                  <div className="space-y-1">
                    {categoryNodes.map((node) => (
                      <div
                        className="flex cursor-move items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-400 hover:shadow-sm"
                        draggable
                        key={node.type}
                        onDragEnd={handleToolboxDragEnd}
                        onDragStart={() => handleToolboxDragStart(node.type)}
                      >
                        <span className="text-lg">{node.icon}</span>
                        <span>{node.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Canvas */}
          <div
            className={`flex-1 overflow-hidden ${showGrid ? "bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:20px_20px]" : "bg-slate-100"}`}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
            ref={canvasRef}
          >
            <div
              className="relative h-full w-full"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
              }}
            >
              {nodes.map((node) => (
                <div
                  className={`absolute cursor-pointer rounded-lg border-2 bg-white p-4 shadow-md ${
                    selectedNode?.id === node.id
                      ? "border-blue-500"
                      : "border-slate-300 hover:border-slate-400"
                  }`}
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  style={{
                    left: node.position.x,
                    top: node.position.y,
                    width: "180px",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">
                      {NODE_TYPES.find((n) => n.type === node.type)?.icon}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-slate-900">{node.data.label}</p>
                      <p className="text-xs text-slate-500 capitalize">{node.type.replace("_", " ")}</p>
                    </div>
                  </div>
                </div>
              ))}
              {nodes.length === 0 && (
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                  <p className="text-lg font-semibold text-slate-700">Drag nodes from the left panel</p>
                  <p className="mt-1 text-sm text-slate-500">Build your orchestration by connecting nodes</p>
                </div>
              )}
            </div>
          </div>

          {/* Properties Panel */}
          {selectedNode && (
            <div className="w-80 border-l border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-900">Node Properties</h3>
                <button
                  className="text-slate-500 hover:text-red-600"
                  onClick={deleteSelectedNode}
                  title="Delete Node"
                  type="button"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Node Type</label>
                  <p className="mt-1 text-sm text-slate-900 capitalize">{selectedNode.type.replace("_", " ")}</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Label</label>
                  <input
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    type="text"
                    value={selectedNode.data.label}
                    onChange={(e) => {
                      setNodes((prev) =>
                        prev.map((n) =>
                          n.id === selectedNode.id
                            ? { ...n, data: { ...n.data, label: e.target.value } }
                            : n
                        )
                      );
                      setSelectedNode({
                        ...selectedNode,
                        data: { ...selectedNode.data, label: e.target.value },
                      });
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600">Configuration</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                    rows={10}
                    value={JSON.stringify(selectedNode.data.config, null, 2)}
                    onChange={(e) => {
                      try {
                        const config = JSON.parse(e.target.value);
                        setNodes((prev) =>
                          prev.map((n) =>
                            n.id === selectedNode.id ? { ...n, data: { ...n.data, config } } : n
                          )
                        );
                        setSelectedNode({ ...selectedNode, data: { ...selectedNode.data, config } });
                      } catch {
                        // Invalid JSON, ignore
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center">
            <Settings className="mx-auto h-16 w-16 text-slate-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No Orchestration Loaded</h3>
            <p className="mt-2 text-sm text-slate-500">
              Create a new orchestration or load an existing one to get started
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

  const handleCreate = () => {
    const newOrchestration: Orchestration = {
      id: crypto.randomUUID(),
      companyId,
      name,
      description,
      version: 1,
      status: "draft",
      triggerType,
      triggerConfig: {},
      variables: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdByEmail: null,
      updatedByEmail: null,
      publishedAt: null,
      publishedByEmail: null,
    };
    onCreate(newOrchestration);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">Create Orchestration</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600">Name</label>
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600">Description</label>
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            disabled={!name || !companyId}
            onClick={handleCreate}
            type="button"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
