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

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
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
  ChevronLeft,
  ChevronRight,
  List,
} from "lucide-react";
import type { NodeType, Orchestration, ManualTriggerConfig, OrchestrationTriggerType } from "@/shared/orchestrationTypes";
import { TRIGGER_TYPE_LABELS } from "@/shared/orchestrationTypes";
import { NodePropertiesPanel } from "./node-properties-panel";
import { ManualTriggerDialog } from "./manual-trigger-dialog";
import { ExecutionMonitor } from "./execution-monitor";
import { OrchestrationList } from "./orchestration-list";
import { isNodeCompatibleWithTrigger, getIncompatibilityReason } from "@/lib/orchestrations/node-compatibility";

type CompanyOption = { id: string; name: string };
type TargetAppOption = { id: string; name: string; companyId: string };

const NODE_CONFIGS: Array<{ type: NodeType; label: string; icon: string; color: string }> = [
  { type: "trigger", label: "Trigger", icon: "⚡", color: "#10b981" },
  { type: "workflow", label: "Workflow", icon: "🔄", color: "#3b82f6" },
  { type: "data_capture", label: "Data Capture", icon: "📋", color: "#0ea5e9" },
  { type: "ai_extraction", label: "AI Extraction", icon: "🤖", color: "#8b5cf6" },
  { type: "ai_decision", label: "AI Decision", icon: "🧠", color: "#a855f7" },
  { type: "condition", label: "Condition", icon: "❓", color: "#f59e0b" },
  { type: "human_approval", label: "Human Approval", icon: "✋", color: "#ec4899" },
  { type: "notification", label: "Notification", icon: "📧", color: "#06b6d4" },
  { type: "variable", label: "Variable", icon: "📊", color: "#14b8a6" },
  { type: "end", label: "End", icon: "🏁", color: "#ef4444" },
];

// Custom Node Component
const CustomNode = ({ data, id }: { data: any; id: string }) => {
  const config = NODE_CONFIGS.find((n) => n.type === data.nodeType);
  const isConditionNode = data.nodeType === 'condition';
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onDelete) {
      data.onDelete(id);
    }
  };
  
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
      
      {/* Condition node has two output handles: TRUE and FALSE */}
      {isConditionNode ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id="true"
            style={{ top: '35%' }}
            className="!h-3 !w-3 !border-2 !border-white !bg-green-600"
          />
          <Handle
            type="source"
            position={Position.Right}
            id="false"
            style={{ top: '65%' }}
            className="!h-3 !w-3 !border-2 !border-white !bg-red-600"
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-white !bg-slate-700"
        />
      )}
      
      <button
        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded bg-red-500 text-white hover:bg-red-600 transition-colors"
        onClick={handleDelete}
        title="Delete node"
        type="button"
      >
        <Trash2 className="h-2.5 w-2.5" />
      </button>
      <div className="flex items-center gap-2">
        <span className="text-xl">{config?.icon}</span>
        <div className="flex-1">
          <div className="text-xs font-semibold text-slate-500">{config?.label}</div>
          <div className="text-sm font-semibold text-slate-900">{data.label}</div>
        </div>
      </div>
      
      {/* Labels for condition handles */}
      {isConditionNode && (
        <div className="absolute -right-12 top-0 flex h-full flex-col justify-around text-xs font-semibold">
          <span className="text-green-600">TRUE</span>
          <span className="text-red-600">FALSE</span>
        </div>
      )}
    </div>
  );
};

// Node type mapping for React Flow - memoized to prevent recreation
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

export function OrchestrationDesigner({ companies, targetApps }: { companies: CompanyOption[]; targetApps: TargetAppOption[] }) {
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isManualTriggerOpen, setIsManualTriggerOpen] = useState(false);
  const [manualTriggerConfig, setManualTriggerConfig] = useState<ManualTriggerConfig | null>(null);
  const [executionMonitorId, setExecutionMonitorId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedSincePublish, setSavedSincePublish] = useState(false);
  const savedStateRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const previousTriggerTypeRef = useRef<OrchestrationTriggerType | undefined>(undefined);


  // Show toast notification
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Get current trigger type from trigger node
  const currentTriggerType = useMemo<OrchestrationTriggerType | undefined>(() => {
    const triggerNode = nodes.find(n => n.data.nodeType === "trigger");
    return triggerNode?.data.config?.triggerType;
  }, [nodes]);

  // Determine if Run button should be shown (only for manual triggers)
  const shouldShowRunButton = useMemo(() => {
    if (!orchestration) return false;
    return currentTriggerType === "manual";
  }, [orchestration, currentTriggerType]);

  // Check for incompatible nodes when trigger type changes
  useEffect(() => {
    if (!currentTriggerType || !orchestration) {
      previousTriggerTypeRef.current = currentTriggerType;
      return;
    }

    // Only check if trigger type actually changed (not on initial load)
    const previousTriggerType = previousTriggerTypeRef.current;
    if (previousTriggerType === currentTriggerType) return;
    
    // Skip check on initial load (when previous was undefined)
    if (previousTriggerType === undefined) {
      previousTriggerTypeRef.current = currentTriggerType;
      return;
    }

    // Update ref for next comparison
    previousTriggerTypeRef.current = currentTriggerType;

    const incompatibleNodes = nodes.filter(node => {
      const nodeType = node.data.nodeType;
      // Skip the trigger node itself
      if (nodeType === 'trigger') return false;
      return !isNodeCompatibleWithTrigger(nodeType, currentTriggerType);
    });

    if (incompatibleNodes.length > 0) {
      const incompatibleLabels = incompatibleNodes.map(n => `"${n.data.label}"`).join(', ');
      const triggerLabel = TRIGGER_TYPE_LABELS[currentTriggerType];
      
      setConfirmDialog({
        message: `${incompatibleNodes.length === 1 ? 'Node' : 'Nodes'} ${incompatibleLabels} ${incompatibleNodes.length === 1 ? 'is' : 'are'} not compatible with ${triggerLabel} trigger and will cause errors when saving. Remove ${incompatibleNodes.length === 1 ? 'it' : 'them'} from the canvas?`,
        onConfirm: () => {
          setConfirmDialog(null);
          // Remove incompatible nodes
          setNodes((nds) => nds.filter(node => {
            const nodeType = node.data.nodeType;
            if (nodeType === 'trigger') return true;
            return isNodeCompatibleWithTrigger(nodeType, currentTriggerType);
          }));
          // Also remove edges connected to those nodes
          const incompatibleIds = new Set(incompatibleNodes.map(n => n.id));
          setEdges((eds) => eds.filter(edge => 
            !incompatibleIds.has(edge.source) && !incompatibleIds.has(edge.target)
          ));
          showToast(`Removed ${incompatibleNodes.length} incompatible ${incompatibleNodes.length === 1 ? 'node' : 'nodes'}`, 'success');
        },
      });
    }
  }, [currentTriggerType, nodes, orchestration, setNodes, setEdges, showToast]);

  // Load orchestration data when orchestration changes
  useEffect(() => {
    if (!orchestration?.id) {
      savedStateRef.current = null;
      setHasUnsavedChanges(false);
      setSavedSincePublish(false);
      return;
    }

    // Reset state when loading new orchestration
    savedStateRef.current = null;
    setHasUnsavedChanges(false);
    setNodes([]);
    setEdges([]);
    
    // Check if orchestration has saved changes since last publish
    const hasSavedChangesSincePublish = Boolean(
      orchestration.status === "published" &&
      orchestration.publishedAt && 
      new Date(orchestration.updatedAt) > new Date(orchestration.publishedAt)
    );
    setSavedSincePublish(hasSavedChangesSincePublish);

    // Load nodes and edges sequentially to avoid race conditions in change detection
    const loadOrchestrationData = async () => {
      try {
        // Load nodes first
        const nodesResponse = await fetch(`/api/admin/orchestrations/nodes?orchestrationId=${orchestration.id}`);
        const nodesData = await nodesResponse.json();
        const flowNodes: Node[] = nodesData.nodes.map((node: any) => ({
          id: node.id,
          type: "custom",
          position: { x: node.positionX, y: node.positionY },
          data: {
            label: node.label,
            nodeType: node.nodeType,
            config: node.config,
            displayDescription: node.displayDescription,
            onDelete: deleteNode,
          },
        }));
        
        // Load edges second
        const edgesResponse = await fetch(`/api/admin/orchestrations/connections?orchestrationId=${orchestration.id}`);
        const edgesData = await edgesResponse.json();
        const flowEdges: Edge[] = edgesData.connections.map((conn: any) => ({
          id: conn.id,
          source: conn.sourceNodeId,
          target: conn.targetNodeId,
          sourceHandle: conn.sourceHandle,
          targetHandle: conn.targetHandle,
          markerEnd: { type: MarkerType.ArrowClosed },
          type: "smoothstep",
          deletable: true,
          focusable: true,
          updatable: true,
        }));
        
        // Update state atomically after both loads complete
        setNodes(flowNodes);
        setEdges(flowEdges);
        
        // Store as saved state AFTER state updates
        savedStateRef.current = {
          nodes: flowNodes,
          edges: flowEdges,
        };
        
        // Explicitly set no unsaved changes after load completes
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error('Error loading orchestration data:', error);
        showToast('Failed to load orchestration data', 'error');
      }
    };
    
    loadOrchestrationData();
  }, [orchestration?.id, setNodes, setEdges]);

  // Detect unsaved changes
  useEffect(() => {
    if (!orchestration?.id || !savedStateRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    const saved = savedStateRef.current;
    
    // Compare nodes (check count and positions only, NOT labels/configs)
    // Node property edits (label, config) don't count as "unsaved changes"
    // because they're saved when user clicks Save in the node properties panel
    if (nodes.length !== saved.nodes.length) {
      setHasUnsavedChanges(true);
      return;
    }

    // Helper to compare positions with tolerance for floating point precision
    const positionsEqual = (pos1: { x: number; y: number }, pos2: { x: number; y: number }) => {
      return Math.abs(pos1.x - pos2.x) < 0.01 && Math.abs(pos1.y - pos2.y) < 0.01;
    };

    // Check if any node positions changed (moving nodes on canvas)
    for (let i = 0; i < nodes.length; i++) {
      const current = nodes[i];
      const savedNode = saved.nodes.find(n => n.id === current.id);
      
      if (!savedNode || !positionsEqual(current.position, savedNode.position)) {
        setHasUnsavedChanges(true);
        return;
      }
    }

    // Compare edges (check count and connections)
    if (edges.length !== saved.edges.length) {
      setHasUnsavedChanges(true);
      return;
    }

    for (let i = 0; i < edges.length; i++) {
      const current = edges[i];
      const savedEdge = saved.edges.find(e => 
        e.source === current.source && 
        e.target === current.target &&
        e.sourceHandle === current.sourceHandle &&
        e.targetHandle === current.targetHandle
      );
      
      if (!savedEdge) {
        setHasUnsavedChanges(true);
        return;
      }
    }

    // No changes detected
    setHasUnsavedChanges(false);
  }, [nodes, edges, orchestration?.id]);

  // Warn user before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Delete node by ID
  const deleteNode = useCallback(
    (nodeId: string) => {
      setConfirmDialog({
        message: "Delete this node?",
        onConfirm: () => {
          setNodes((nds) => nds.filter((node) => node.id !== nodeId));
          setEdges((eds) => eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
          if (selectedNode?.id === nodeId) {
            setSelectedNode(null);
            setIsPropertiesOpen(false);
          }
          setConfirmDialog(null);
        },
      });
    },
    [selectedNode, setNodes, setEdges]
  );

  // Handle connection creation
  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge = {
        ...connection,
        id: `edge-${Date.now()}`,
        markerEnd: { 
          type: MarkerType.ArrowClosed,
          color: '#334155'
        },
        style: {
          stroke: '#334155',
          strokeWidth: 2
        },
        type: "smoothstep",
        deletable: true,
        focusable: true,
        updatable: true,
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
        showToast("Please create an orchestration first", 'error');
        return;
      }

      // Check node compatibility with trigger type
      if (!isNodeCompatibleWithTrigger(nodeType, currentTriggerType)) {
        const reason = getIncompatibilityReason(nodeType, currentTriggerType!);
        showToast(reason || "Node is not compatible with this trigger type", 'error');
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
          onDelete: deleteNode,
        },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [orchestration, currentTriggerType, setNodes, deleteNode, showToast]
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
  const saveOrchestration = async (): Promise<boolean> => {
    if (!orchestration || isSaving) return false;

    // Validate nodes are compatible with current trigger type before saving
    const incompatibleNodes = nodes.filter(node => {
      const nodeType = node.data.nodeType;
      return !isNodeCompatibleWithTrigger(nodeType, currentTriggerType);
    });

    if (incompatibleNodes.length > 0) {
      const incompatibleLabels = incompatibleNodes.map(n => `"${n.data.label}" (${n.data.nodeType})`).join(', ');
      const triggerLabel = currentTriggerType ? TRIGGER_TYPE_LABELS[currentTriggerType] : 'Unknown';
      showToast(
        `Cannot save: ${incompatibleNodes.length === 1 ? 'Node' : 'Nodes'} ${incompatibleLabels} ${incompatibleNodes.length === 1 ? 'is' : 'are'} not compatible with ${triggerLabel} trigger. Please remove ${incompatibleNodes.length === 1 ? 'it' : 'them'} from the canvas.`,
        'error'
      );
      return false;
    }

    setIsSaving(true);
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
            displayDescription: node.data.displayDescription,
          }),
        });
        
        if (!nodeResponse.ok) {
          const error = await nodeResponse.json();
          console.error(`Failed to save node ${node.data.label}:`, error);
          throw new Error(`Failed to save node ${node.data.label}: ${error.message || 'Unknown error'}`);
        }
        
        const savedNode = await nodeResponse.json();
        nodeIdMap.set(node.id, savedNode.node?.id || savedNode.id);
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

      // Update saved state reference
      savedStateRef.current = {
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
      };
      setHasUnsavedChanges(false);
      
      // Track that we saved but haven't published yet
      if (orchestration.status === "published") {
        setSavedSincePublish(true);
      }
      
      // Reload nodes and edges from database to get correct database IDs
      // This ensures that subsequent edits use the correct IDs
      try {
        const nodesResponse = await fetch(`/api/admin/orchestrations/nodes?orchestrationId=${orchestration.id}`);
        const nodesData = await nodesResponse.json();
        const flowNodes: Node[] = nodesData.nodes.map((node: any) => ({
          id: node.id,
          type: "custom",
          position: { x: node.positionX, y: node.positionY },
          data: {
            label: node.label,
            nodeType: node.nodeType,
            config: node.config,
            displayDescription: node.displayDescription,
            onDelete: deleteNode,
          },
        }));
        setNodes(flowNodes);
        
        const edgesResponse = await fetch(`/api/admin/orchestrations/connections?orchestrationId=${orchestration.id}`);
        const edgesData = await edgesResponse.json();
        const flowEdges: Edge[] = edgesData.connections.map((conn: any) => ({
          id: conn.id,
          source: conn.sourceNodeId,
          target: conn.targetNodeId,
          sourceHandle: conn.sourceHandle,
          targetHandle: conn.targetHandle,
          markerEnd: { 
            type: MarkerType.ArrowClosed,
            color: '#334155'
          },
          style: {
            stroke: '#334155',
            strokeWidth: 2
          },
          type: "smoothstep",
          deletable: true,
          focusable: true,
          updatable: true,
        }));
        setEdges(flowEdges);
        
        // Update saved state with reloaded data
        savedStateRef.current = {
          nodes: flowNodes,
          edges: flowEdges,
        };
        
        // Reset unsaved changes flag after successful reload
        setHasUnsavedChanges(false);
      } catch (reloadError) {
        console.error('Error reloading nodes after save:', reloadError);
        // Don't fail the save if reload fails
      }
      
      showToast("Orchestration saved successfully!", 'success');
      return true;
    } catch (error) {
      console.error("Error saving orchestration:", error);
      showToast(error instanceof Error ? error.message : "Failed to save orchestration", 'error');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  // Publish orchestration
  const publishOrchestration = async () => {
    if (!orchestration || isPublishing) return;

    // Validate that there's an end node
    const hasEndNode = nodes.some((node) => (node.data as any).nodeType === 'end');
    if (!hasEndNode) {
      showToast('Cannot publish: Orchestration must have an End node. Please add an End node to complete the workflow.', 'error');
      return;
    }

    // Validate that all nodes are connected (no orphaned nodes)
    const nodeIds = new Set(nodes.map(n => n.id));
    const connectedNodeIds = new Set<string>();
    
    edges.forEach(edge => {
      connectedNodeIds.add(edge.source);
      connectedNodeIds.add(edge.target);
    });

    const orphanedNodes = nodes.filter(node => !connectedNodeIds.has(node.id));
    
    // Allow trigger node to be unconnected only if it's the only node
    // Otherwise, all nodes must be connected
    if (orphanedNodes.length > 0) {
      const orphanedLabels = orphanedNodes.map(n => `"${n.data.label}"`).join(', ');
      showToast(`Cannot publish: ${orphanedNodes.length === 1 ? 'Node' : 'Nodes'} ${orphanedLabels} ${orphanedNodes.length === 1 ? 'is' : 'are'} not connected to the workflow.`, 'error');
      return;
    }

    // Validate that trigger node exists and is connected
    const triggerNode = nodes.find(n => (n.data as any).nodeType === 'trigger');
    if (!triggerNode) {
      showToast('Cannot publish: Orchestration must have a Trigger node.', 'error');
      return;
    }

    // Validate that end node is reachable from trigger (basic connectivity check)
    const endNode = nodes.find(n => (n.data as any).nodeType === 'end');
    if (nodes.length > 1) {
      // Check if end node has incoming connections
      const endNodeHasIncoming = edges.some(edge => edge.target === endNode?.id);
      if (!endNodeHasIncoming) {
        showToast('Cannot publish: End node must be connected to the workflow. It has no incoming connections.', 'error');
        return;
      }

      // Check if trigger node has outgoing connections
      const triggerHasOutgoing = edges.some(edge => edge.source === triggerNode.id);
      if (!triggerHasOutgoing) {
        showToast('Cannot publish: Trigger node must be connected to the workflow. It has no outgoing connections.', 'error');
        return;
      }
    }

    setConfirmDialog({
      message: "Publish this orchestration? This will make it available for execution.",
      onConfirm: async () => {
        setConfirmDialog(null);
        setIsPublishing(true);
        try {
          // First, save the orchestration to ensure database has latest nodes
          console.log("📝 Saving orchestration before publishing...");
          const saveSuccess = await saveOrchestration();
          
          if (!saveSuccess) {
            showToast("Cannot publish: Failed to save orchestration. Please fix errors and try again.", 'error');
            setIsPublishing(false);
            return;
          }
          
          console.log("📤 Publishing orchestration...");
          const response = await fetch("/api/admin/orchestrations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: orchestration.id,
          publish: true,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Failed to publish orchestration";
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (parseError) {
          // If JSON parsing fails, use status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setOrchestration(result.orchestration);
      setSavedSincePublish(false);
      showToast("Orchestration published successfully!", 'success');
        } catch (error) {
          console.error("Error publishing orchestration:", error);
          showToast(error instanceof Error ? error.message : "Failed to publish orchestration", 'error');
        } finally {
          setIsPublishing(false);
        }
      },
    });
  };

  // Execute orchestration via manual trigger
  const executeOrchestration = async () => {
    if (!orchestration) return;

    if (orchestration.status !== "published") {
      showToast("Please publish the orchestration before executing it.", 'error');
      return;
    }

    try {
      // Get trigger node configuration from canvas
      const triggerNode = nodes.find(n => n.data.nodeType === "trigger");
      
      if (!triggerNode) {
        showToast("This orchestration has no trigger node. Please add a trigger node first.", 'error');
        return;
      }

      const triggerNodeConfig = triggerNode.data.config || {};
      
      console.log("\n" + "█".repeat(60));
      console.log("🎯 EXECUTING ORCHESTRATION");
      console.log("█".repeat(60));
      console.log("Trigger node config:", triggerNodeConfig);
      console.log("Input fields:", triggerNodeConfig.inputFields || []);
      console.log("█".repeat(60) + "\n");

      // Use trigger node config directly (it has the latest inputFields)
      const triggerConfig: ManualTriggerConfig = {
        type: triggerNodeConfig.triggerType || "manual",
        inputFields: triggerNodeConfig.inputFields || [],
      };
      
      // Ensure trigger record exists in database (for logging/tracking)
      const response = await fetch(
        `/api/admin/orchestrations/triggers?orchestrationId=${orchestration.id}&triggerType=manual&status=active`
      );

      if (!response.ok) {
        throw new Error("Failed to get trigger configuration");
      }

      const data = await response.json();
      
      if (!data.triggers || data.triggers.length === 0) {
        // Create trigger record with the node's config
        const createResponse = await fetch("/api/admin/orchestrations/triggers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orchestrationId: orchestration.id,
            triggerType: "manual",
            name: "Manual Trigger",
            description: "Manually start this orchestration",
            config: triggerConfig,
          }),
        });

        if (!createResponse.ok) {
          throw new Error("Failed to create manual trigger");
        }
      }

      // Show manual trigger dialog with the node's config
      setManualTriggerConfig(triggerConfig);
      setIsManualTriggerOpen(true);
    } catch (error) {
      console.error("Error preparing manual trigger:", error);
      showToast(error instanceof Error ? error.message : "Failed to prepare manual trigger", 'error');
    }
  };

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-0 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setIsListOpen(true)}
            type="button"
          >
            <List className="h-4 w-4" />
            All Orchestrations
          </button>
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
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  hasUnsavedChanges
                    ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                onClick={saveOrchestration}
                disabled={isSaving || isPublishing}
                type="button"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : hasUnsavedChanges ? "Save Changes *" : "Save Draft"}
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={publishOrchestration}
                disabled={isSaving || isPublishing}
                type="button"
              >
                <Upload className="h-4 w-4" />
                {isPublishing ? "Publishing..." : "Publish"}
              </button>
              {shouldShowRunButton && (
                <button
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  onClick={executeOrchestration}
                  type="button"
                >
                  <Play className="h-4 w-4" />
                  Run
                </button>
              )}
            </>
          )}
        </div>

        {orchestration && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-700">
              {orchestration.name} <span className="text-xs text-slate-500">v{orchestration.version}</span>
            </span>
            {hasUnsavedChanges || savedSincePublish ? (
              <span className="ml-2 rounded-full px-2 py-1 text-xs font-semibold bg-amber-100 text-amber-700 border border-amber-200">
                Unpublished changes
              </span>
            ) : (
              <span className={`ml-2 rounded-full px-2 py-1 text-xs font-semibold ${
                orchestration.status === "published" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
              }`}>
                {orchestration.status}
              </span>
            )}
          </div>
        )}
      </div>

      {orchestration ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Sidebar Toggle Button */}
          <button
            className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-slate-300 rounded-r-lg p-1.5 shadow-md hover:bg-slate-50 transition-all"
            style={{ left: isSidebarCollapsed ? '0' : '14rem' }}
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            type="button"
            title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          >
            {isSidebarCollapsed ? (
              <ChevronRight className="h-4 w-4 text-slate-600" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            )}
          </button>

          {/* Node Toolbox */}
          <div 
            className="border-r border-slate-200 bg-white p-4 overflow-y-auto transition-all duration-300 ease-in-out"
            style={{ 
              width: isSidebarCollapsed ? '0' : '14rem',
              minWidth: isSidebarCollapsed ? '0' : '14rem',
              padding: isSidebarCollapsed ? '0' : '1rem',
              opacity: isSidebarCollapsed ? 0 : 1
            }}
          >
            <h3 className="mb-3 text-sm font-bold text-slate-900">Node Types</h3>
            <div className="space-y-2">
              {NODE_CONFIGS.map((nodeConfig) => {
                const isCompatible = isNodeCompatibleWithTrigger(nodeConfig.type, currentTriggerType);
                const reason = !isCompatible && currentTriggerType
                  ? getIncompatibilityReason(nodeConfig.type, currentTriggerType)
                  : null;

                return (
                  <button
                    key={nodeConfig.type}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm font-semibold transition-colors ${
                      isCompatible
                        ? "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 cursor-pointer"
                        : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60"
                    }`}
                    onClick={() => isCompatible && addNode(nodeConfig.type)}
                    disabled={!isCompatible}
                    title={reason || undefined}
                    type="button"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{nodeConfig.icon}</span>
                      <span>{nodeConfig.label}</span>
                      {!isCompatible && (
                        <span className="ml-auto text-xs">🚫</span>
                      )}
                    </div>
                    {!isCompatible && reason && (
                      <div className="mt-1 text-xs text-slate-500 leading-tight">
                        {reason.split('.')[0]}.
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-semibold mb-1">💡 Tips:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Click a node to add it</li>
                <li>Drag nodes to reposition</li>
                <li>Drag from node edge to connect</li>
                <li>Click edge and press Delete/Backspace to remove</li>
                <li>Drag edge handle to reconnect</li>
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
              edgesUpdatable={true}
              edgesFocusable={true}
              elementsSelectable={true}
              deleteKeyCode={["Backspace", "Delete"]}
              defaultEdgeOptions={{
                type: "smoothstep",
                markerEnd: { 
                  type: MarkerType.ArrowClosed,
                  color: '#334155'
                },
                style: {
                  stroke: '#334155',
                  strokeWidth: 2
                },
                deletable: true,
                focusable: true,
                updatable: true,
              }}
              proOptions={{ hideAttribution: true }}
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
              nodes={nodes}
              edges={edges}
              orchestrationId={orchestration?.id}
              companyId={orchestration?.companyId}
              targetAppId={orchestration?.targetAppId}
              onClose={() => setIsPropertiesOpen(false)}
              onUpdate={(updates) => updateSelectedNode(updates)}
              onDelete={deleteSelectedNode}
              onDatabaseSave={() => {
                // Mark as having saved changes since publish (for badge display)
                if (orchestration?.status === 'published') {
                  setSavedSincePublish(true);
                }
              }}
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
          targetApps={targetApps}
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
            setExecutionMonitorId(executionId);
          }}
        />
      )}

      {/* Execution Monitor */}
      {executionMonitorId && orchestration && (
        <ExecutionMonitor
          executionId={executionMonitorId}
          orchestrationName={orchestration.name}
          onClose={() => setExecutionMonitorId(null)}
        />
      )}

      {/* Orchestration List */}
      {isListOpen && (
        <OrchestrationList
          onLoad={(loadedOrchestration) => {
            setOrchestration(loadedOrchestration);
            // Nodes and edges will be loaded by the useEffect
          }}
          onClose={() => setIsListOpen(false)}
          currentOrchestrationId={orchestration?.id}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2 duration-300">
          <div className={`flex items-center gap-3 rounded-lg px-4 py-3 shadow-lg border ${
            toast.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <span className="text-lg">{toast.type === 'success' ? '✓' : '✕'}</span>
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="ml-2 rounded p-0.5 hover:bg-black/5 transition-colors"
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm">
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
    </div>
  );
}

function CreateOrchestrationDialog({
  companies,
  targetApps,
  onClose,
  onCreate,
}: {
  companies: CompanyOption[];
  targetApps: TargetAppOption[];
  onClose: () => void;
  onCreate: (orchestration: Orchestration) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [companyId, setCompanyId] = useState(companies[0]?.id || "");
  const [targetAppId, setTargetAppId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter target apps by selected company
  const companyTargetApps = targetApps.filter(app => app.companyId === companyId);

  // Update target app when company changes
  const handleCompanyChange = (newCompanyId: string) => {
    setCompanyId(newCompanyId);
    setTargetAppId(""); // Reset target app when company changes
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/admin/orchestrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          targetAppId,
          name,
          description,
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
      setError(error instanceof Error ? error.message : "Failed to create orchestration");
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
              onChange={(e) => handleCompanyChange(e.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600">Target App</label>
            <select
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={targetAppId}
              onChange={(e) => setTargetAppId(e.target.value)}
            >
              <option value="">Select target app...</option>
              {companyTargetApps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {error && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        )}
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
            disabled={!name || !companyId || !targetAppId || creating}
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
