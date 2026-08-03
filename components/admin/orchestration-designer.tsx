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

import { useState, useCallback, useMemo, useEffect, useRef, type ComponentType } from "react";
import { useSearchParams } from "next/navigation";
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
  useUpdateNodeInternals,
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
  ChevronDown,
  ChevronUp,
  Lightbulb,
  List,
  Database,
  Check,
  Ban,
  Info,
  Globe2,
  History,
} from "lucide-react";
import type { NodeType, Orchestration, ManualTriggerConfig, OrchestrationTriggerType } from "@/shared/orchestrationTypes";
import { TRIGGER_TYPE_LABELS } from "@/shared/orchestrationTypes";
import { NodePropertiesPanel } from "./node-properties-panel";
import { VersionedEnvironmentReleaseModal } from "./versioned-environment-release-modal";
import { VersionHistoryModal, formatVersion } from "./version-history-modal";
import { ManualTriggerDialog } from "./manual-trigger-dialog";
import { ExecutionMonitor } from "./execution-monitor";
import { OrchestrationList } from "./orchestration-list";
import { isNodeCompatibleWithTrigger, getIncompatibilityReason } from "@/lib/orchestrations/node-compatibility";
import { findUnreachableNodes } from "@/lib/orchestrations/graph-reachability";
import { useToast } from "./toast";

type TargetAppOption = { id: string; name: string; companyId: string };

const NODE_CONFIGS: Array<{ type: NodeType; label: string; icon: string | ComponentType<{ className?: string }>; color: string }> = [
  { type: "trigger", label: "Trigger", icon: "⚡", color: "#10b981" },
  { type: "workflow", label: "Workflow", icon: "🔄", color: "#3b82f6" },
  { type: "data_capture", label: "Data Capture", icon: "📋", color: "#0ea5e9" },
  { type: "ai_extraction", label: "AI Extraction", icon: "🤖", color: "#8b5cf6" },
  { type: "ai_task", label: "AI Task", icon: "🧠", color: "#a855f7" },
  { type: "knowledge_search", label: "Knowledge Search", icon: "🔍", color: "#0891b2" },
  { type: "condition", label: "Condition", icon: "❓", color: "#f59e0b" },
  { type: "switch", label: "Switch / Router", icon: "🔀", color: "#d97706" },
  { type: "human_approval", label: "Human Approval", icon: "✋", color: "#ec4899" },
  { type: "notification", label: "Notification", icon: "📧", color: "#06b6d4" },
  { type: "api_call", label: "API Call", icon: "🌐", color: "#f97316" },
  { type: "database", label: "Database", icon: Database, color: "#6366f1" },
  { type: "variable", label: "Variable", icon: "📊", color: "#14b8a6" },
  { type: "data_formatter", label: "Data Formatter", icon: "{}", color: "#0891b2" },
  { type: "file_parser", label: "File Parser", icon: "📄", color: "#7c3aed" },
  { type: "for_each", label: "For Each", icon: "🔁", color: "#0d9488" },
  { type: "ai_planner", label: "AI Planner", icon: "🧭", color: "#eab308" },
  { type: "end", label: "End", icon: "🏁", color: "#ef4444" },
];

// Capability-focused descriptions for the "Node guide" popup — enough for an
// admin to know which node to reach for, without listing every setting.
const NODE_DESCRIPTIONS: Record<NodeType, string> = {
  trigger:
    "Starts the orchestration and defines how it's launched — on a schedule, an incoming webhook, an email arriving, or a chat message from AI Planner. Every orchestration needs exactly one, as its first node.",
  workflow:
    "Runs another already-published orchestration as a reusable sub-step, passing data into it and picking up its result. Use this to avoid rebuilding the same sequence of steps in multiple orchestrations.",
  data_capture:
    "This node runs silently alongside a workflow and captures data from every field the workflow interacts with. The captured data can then be used to automatically populate fields in subsequent screens.",
  ai_extraction:
    "Uses AI to read unstructured text and pull out specific structured fields you define, e.g. turning a free-form message into name/date/amount values. Use this when the incoming data isn't already field-by-field.",
  ai_task:
    "Uses AI to generate, transform, or reason over text based on an instruction you write — summarizing a document, drafting a reply, deciding a category. Use this for open-ended language tasks that don't fit a fixed rule.",
  knowledge_search:
    "Searches the company's uploaded knowledge base (documents, FAQs, etc.) for passages relevant to a query. Use this before an AI Task when the answer should be grounded in your own content, not general knowledge.",
  condition:
    "Evaluates a rule against the data collected so far and sends the flow down one of two paths — TRUE or FALSE. Use this whenever the next step should differ depending on a value, e.g. \"if amount > 1000\".",
  switch:
    "Evaluates ordered routes from top to bottom and follows the first matching output. If nothing matches, it follows Default. Use this when one value can lead to three or more outcomes.",
  human_approval:
    "Pauses the flow and waits for a person to explicitly approve or reject it, branching down an APPROVED or REJECTED path. Use this for any step that needs a human sign-off, e.g. before a payment or a publish.",
  notification:
    "Sends an email (or other configured channel) to a recipient with a subject and body you define, optionally including data collected earlier. Use this whenever the orchestration needs to notify or deliver something.",
  api_call:
    "Calls an external API or webhook, sends the data you configure, and captures the response for later steps. Use this to integrate with a system outside Scout, e.g. a CRM, payment gateway, or other service.",
  database:
    "Formats a SELECT query based on the configured database schema. The generated query can then be passed to another client API for execution. This node only generates SELECT queries and never creates INSERT, UPDATE, or DELETE statements.",
  variable:
    "Sets, updates, or transforms a named variable's value that later steps can reference. Use this to carry a value forward, do a simple calculation, or rename data for clarity.",
  data_formatter:
    "Reshapes data from one structure or format into another, e.g. turning a JSON object into a plain-text summary or reformatting a date. Use this between two steps whose input/output shapes don't already match.",
  file_parser:
    "Extracts the text or structured content from an uploaded file — PDF, Word document, spreadsheet — so later steps can work with it. Use this whenever the trigger includes a file attachment you need to read.",
  for_each:
    "Repeats a group of steps once for every item in a list, e.g. sending a notification for each row in a dataset. Use this whenever the same action needs to run across multiple items instead of once.",
  ai_planner:
    "Lets end users describe a new automation in plain language from the chatbot; the request becomes a draft plan sent to Pending AI Plans for admin review. Use this only in orchestrations meant to power that entry point.",
  end:
    "Marks that a path through the flow is complete and optionally shows a final message to the user. Every branch of the orchestration should end with one of these.",
};

// Node types whose executor branches on a named output handle (see
// condition-node.ts's outputHandle and human-approval-node.ts's
// resumeAfterApproval outputHandle) get two labeled source handles instead
// of one generic one, so a branch can actually be wired to a distinct edge.
const BRANCH_HANDLES: Record<string, [string, string]> = {
  condition: ["true", "false"],
  human_approval: ["approved", "rejected"],
};
const BRANCH_HANDLE_LABELS: Record<string, [string, string]> = {
  condition: ["TRUE", "FALSE"],
  human_approval: ["APPROVED", "REJECTED"],
};

// Custom Node Component
const CustomNode = ({ data, id }: { data: any; id: string }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const config = NODE_CONFIGS.find((n) => n.type === data.nodeType);
  const branchHandles = BRANCH_HANDLES[data.nodeType as string];
  const branchLabels = BRANCH_HANDLE_LABELS[data.nodeType as string];
  const switchRoutes = data.nodeType === "switch"
    ? [
        ...(Array.isArray(data.config?.routes) ? data.config.routes : []).map((route: any) => ({
          id: String(route.id),
          label: String(route.name || "Route"),
          color: "#d97706",
        })),
        { id: "default", label: "DEFAULT", color: "#64748b" },
      ]
    : null;
  const switchRouteIds = switchRoutes?.map((route) => route.id).join("|") || "";

  useEffect(() => {
    if (data.nodeType !== "switch") return;
    const frame = window.requestAnimationFrame(() => updateNodeInternals(id));
    return () => window.cancelAnimationFrame(frame);
  }, [data.nodeType, id, switchRouteIds, updateNodeInternals]);

  const IconComponent = config?.icon;
  
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (data.onDelete) {
      data.onDelete(id);
    }
  };
  
  return (
    <div
      className="relative rounded-lg border-2 bg-white px-4 py-3 shadow-md"
      style={{ borderColor: config?.color || "#64748b", width: 190 }}
      title={data.displayDescription || undefined}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-white !bg-slate-700"
      />
      
      {/* Branching node types (condition, human_approval) get two named output handles */}
      {switchRoutes ? (
        <>
          {switchRoutes.map((route, index) => (
            <Handle
              key={route.id}
              type="source"
              position={Position.Right}
              id={route.id}
              style={{
                top: `${((index + 1) / (switchRoutes.length + 1)) * 100}%`,
                backgroundColor: route.color,
              }}
              className="!h-3 !w-3 !border-2 !border-white"
            />
          ))}
        </>
      ) : branchHandles ? (
        <>
          <Handle
            type="source"
            position={Position.Right}
            id={branchHandles[0]}
            style={{ top: '35%' }}
            className="!h-3 !w-3 !border-2 !border-white !bg-green-600"
          />
          <Handle
            type="source"
            position={Position.Right}
            id={branchHandles[1]}
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
        <span className="shrink-0 text-xl">{typeof IconComponent === "string" ? IconComponent : IconComponent ? <IconComponent className="h-5 w-5" /> : null}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-slate-500">{config?.label}</div>
          <div className="truncate text-sm font-semibold text-slate-900">{data.label}</div>
        </div>
      </div>
      
      {/* Labels for branch handles */}
      {branchLabels && (
        <div className="absolute -right-16 top-0 flex h-full flex-col justify-around text-xs font-semibold">
          <span className="text-green-600">{branchLabels[0]}</span>
          <span className="text-red-600">{branchLabels[1]}</span>
        </div>
      )}
      {switchRoutes ? (
        <div className="absolute -right-24 top-0 flex h-full w-20 flex-col justify-around text-[10px] font-semibold">
          {switchRoutes.map((route) => (
            <span className="truncate text-amber-700" key={route.id} title={route.label}>
              {route.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
};

// Node type mapping for React Flow - memoized to prevent recreation
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

export function OrchestrationDesigner({ selectedCompanyId, targetApps }: { selectedCompanyId: string; targetApps: TargetAppOption[] }) {
  const searchParams = useSearchParams();
  // Step 7b: when opened from the "Pending AI Plans" queue
  // (?orchestrationId=...&pendingRequestId=...), auto-load that
  // orchestration and show Approve/Reject in the toolbar instead of the
  // normal Publish/Run controls for this session.
  const requestedOrchestrationId = searchParams.get("orchestrationId");
  const pendingRequestId = searchParams.get("pendingRequestId");
  const [autoLoadAttemptedFor, setAutoLoadAttemptedFor] = useState<string | null>(null);
  const [isApprovingPendingRequest, setIsApprovingPendingRequest] = useState(false);
  const [isRejectingPendingRequest, setIsRejectingPendingRequest] = useState(false);
  // Step 9: "Allow [requester] to re-run this from chat" — checked by
  // default, per the roadmap. pendingRequesterExternalUserId is fetched
  // once so the checkbox label can name the actual requester.
  const [allowRerunFromChat, setAllowRerunFromChat] = useState(true);
  const [pendingRequesterExternalUserId, setPendingRequesterExternalUserId] = useState<string | null>(null);
  const [orchestration, setOrchestration] = useState<Orchestration | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isManualTriggerOpen, setIsManualTriggerOpen] = useState(false);
  const [manualTriggerConfig, setManualTriggerConfig] = useState<ManualTriggerConfig | null>(null);
  const [executionMonitorId, setExecutionMonitorId] = useState<string | null>(null);
  const [isListOpen, setIsListOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showEnvironmentModal, setShowEnvironmentModal] = useState(false);
  const [showVersionHistoryModal, setShowVersionHistoryModal] = useState(false);
  // Set when a past published version is pulled into the canvas via Version
  // history — distinct from orchestration.versionMajor/versionBuild (the
  // last published version) so the designer can show both at once. Cleared
  // on save (the canvas becomes the current draft again) or when switching
  // orchestrations.
  const [loadedVersion, setLoadedVersion] = useState<{ major: number; build: number } | null>(null);
  const [isNodePaletteCollapsed, setIsNodePaletteCollapsed] = useState(false);
  const [isTipsOpen, setIsTipsOpen] = useState(false);
  const [isNodeGuideOpen, setIsNodeGuideOpen] = useState(false);
  const { showToast } = useToast();
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedSincePublish, setSavedSincePublish] = useState(false);
  const savedStateRef = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null);
  const previousTriggerTypeRef = useRef<OrchestrationTriggerType | undefined>(undefined);

  // Step 7b: auto-load a specific orchestration when opened via
  // ?orchestrationId=... (e.g. from the Pending AI Plans queue). Runs once
  // per requested id; the existing "Load orchestration data when
  // orchestration changes" effect below picks up nodes/edges from there.
  useEffect(() => {
    if (!requestedOrchestrationId || requestedOrchestrationId === autoLoadAttemptedFor) return;
    setAutoLoadAttemptedFor(requestedOrchestrationId);

    (async () => {
      try {
        const response = await fetch(`/api/admin/orchestrations/${requestedOrchestrationId}`);
        if (!response.ok) {
          throw new Error("Unable to load the requested orchestration.");
        }
        const data = await response.json();
        setOrchestration(data.orchestration);
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to load the requested orchestration.", "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedOrchestrationId]);

  // Step 9: fetch the requester's external_user_id once, purely to label
  // the "Allow ... to re-run this from chat" checkbox meaningfully. Reuses
  // the same endpoint the Pending AI Plans list already calls before
  // navigating here; idempotent, so calling it again here is harmless.
  useEffect(() => {
    if (!pendingRequestId) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(`/api/admin/orchestrations/planner/pending/${pendingRequestId}`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setPendingRequesterExternalUserId(data?.pendingRequest?.externalUserId ?? null);
        }
      } catch {
        // Non-critical — the checkbox just falls back to a generic label.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingRequestId]);

  async function approvePendingRequest() {
    if (!pendingRequestId || !orchestration) return;
    if (hasUnsavedChanges) {
      const saved = await saveOrchestration();
      if (!saved) return;
    }
    setIsApprovingPendingRequest(true);
    try {
      const response = await fetch(`/api/admin/orchestrations/planner/pending/${pendingRequestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowRerunFromChat }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to approve this request.");
      }
      showToast("Approved, published, and the requester has been notified.", "success");
      window.location.href = "/control-panel/pending-ai-plans";
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to approve this request.", "error");
    } finally {
      setIsApprovingPendingRequest(false);
    }
  }

  async function rejectPendingRequest() {
    if (!pendingRequestId) return;
    const reason = window.prompt("Optional: add a reason for the requester (leave blank to skip).") ?? undefined;
    setIsRejectingPendingRequest(true);
    try {
      const response = await fetch(`/api/admin/orchestrations/planner/pending/${pendingRequestId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.message === "string" ? body.message : "Failed to reject this request.");
      }
      showToast("Rejected. The requester has been notified.", "success");
      window.location.href = "/control-panel/pending-ai-plans";
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to reject this request.", "error");
    } finally {
      setIsRejectingPendingRequest(false);
    }
  }

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
      setLoadedVersion(null);
      return;
    }

    // Reset state when loading new orchestration
    savedStateRef.current = null;
    setHasUnsavedChanges(false);
    setNodes([]);
    setEdges([]);
    setLoadedVersion(null);
    
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
  function deleteNode(nodeId: string) {
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
  }

  // Pulls a past published version's graph into the canvas — nothing is
  // persisted here, the admin still has to Save/Publish, which is what
  // creates a new latest version from it (see version-history-modal.tsx).
  // Node/connection ids from the snapshot are only used as local React Flow
  // keys during this editing session; Save always assigns fresh database
  // ids for every node/connection regardless of what id it's given here
  // (see the reload-from-database step inside saveOrchestration), so reusing
  // old ids here is safe.
  async function loadOrchestrationVersion(versionMajor: number, versionBuild: number) {
    if (!orchestration) return;

    const response = await fetch(`/api/admin/orchestrations/${orchestration.id}/versions/${versionMajor}/${versionBuild}`);
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      showToast(typeof body?.message === "string" ? body.message : "Unable to load version.", "error");
      return;
    }

    const flowNodes: Node[] = (body.nodes || []).map((node: any) => ({
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

    const flowEdges: Edge[] = (body.connections || []).map((conn: any) => ({
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

    setHasUnsavedChanges(true);
    setLoadedVersion({ major: versionMajor, build: versionBuild });
    setShowVersionHistoryModal(false);
    showToast(`Version v${versionMajor}.${String(versionBuild).padStart(3, "0")} loaded into the canvas — save or publish to make it current.`);
  }

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
          config: nodeType === "switch"
            ? {
                type: "switch",
                variable: "",
                routes: [
                  {
                    id: `route-${Date.now()}`,
                    name: "",
                    operator: "equals",
                    value: "",
                    valueType: "auto",
                    caseSensitive: false,
                  },
                ],
              }
            : {},
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

    const switchWithoutDefault = nodes.find((node) =>
      node.data.nodeType === "switch" &&
      !edges.some((edge) => edge.source === node.id && edge.sourceHandle === "default")
    );
    if (switchWithoutDefault) {
      showToast(`Cannot save: Switch / Router "${switchWithoutDefault.data.label}" must have its Default output connected.`, "error");
      return false;
    }

    for (const node of nodes) {
      if (node.data.nodeType !== "switch") continue;
      const routes = Array.isArray(node.data.config?.routes) ? node.data.config.routes : [];
      const unusedRoute = routes.find(
        (route: any) => !edges.some((edge) => edge.source === node.id && edge.sourceHandle === route.id)
      );
      if (unusedRoute) {
        showToast(`Cannot save: Switch / Router "${node.data.label}" has an unconnected route "${unusedRoute.name || "Untitled route"}". Connect it or remove it.`, "error");
        return false;
      }
    }

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
          let errorMessage = `HTTP ${nodeResponse.status}`;
          try {
            const contentType = nodeResponse.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
              const error = await nodeResponse.json();
              errorMessage = error?.message || errorMessage;
            }
          } catch (parseError) {
            console.error(`Failed to parse error response:`, parseError);
          }
          console.error(`Failed to save node ${node.data.label}:`, { status: nodeResponse.status, message: errorMessage });
          throw new Error(`Failed to save node ${node.data.label}: ${errorMessage}`);
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
      setLoadedVersion(null);

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

    // Validate that there's a terminal node — an End node, or an AI Planner
    // node (also a no-op terminal marker; see AiPlannerNodeConfig's doc
    // comment). Mirrors publishOrchestration()'s server-side check in
    // lib/orchestrations/db.ts.
    const hasEndNode = nodes.some((node) => (node.data as any).nodeType === 'end' || (node.data as any).nodeType === 'ai_planner');
    if (!hasEndNode) {
      showToast('Cannot publish: Orchestration must have an End node (or an AI Planner node). Please add one to complete the workflow.', 'error');
      return;
    }

    // Validate that trigger node exists
    const triggerNode = nodes.find(n => (n.data as any).nodeType === 'trigger');
    if (!triggerNode) {
      showToast('Cannot publish: Orchestration must have a Trigger node.', 'error');
      return;
    }

    // Validate every node is reachable from the trigger — not just "touched
    // by some edge" (a second island of nodes connected only to each other,
    // like an orphaned Switch / Router → Notification pair, previously slipped
    // through here and only got caught by the server's own check, surfacing as
    // a raw console-logged error instead of a clean validation message).
    // Mirrors publishOrchestration()'s server-side check in lib/orchestrations/db.ts.
    const unreachableNodes = findUnreachableNodes(
      nodes.map(n => ({ id: n.id, label: n.data.label })),
      edges.map(e => ({ sourceNodeId: e.source, targetNodeId: e.target })),
      [triggerNode.id]
    );
    if (unreachableNodes.length > 0) {
      const unreachableLabels = unreachableNodes.map(n => `"${n.label}"`).join(', ');
      showToast(`Cannot publish: ${unreachableNodes.length === 1 ? 'Node' : 'Nodes'} ${unreachableLabels} ${unreachableNodes.length === 1 ? 'is' : 'are'} not connected to the trigger. Every node must be part of a single flow starting from the trigger.`, 'error');
      return;
    }

    // Validate that the trigger has at least one outgoing connection (covers
    // the single-node-graph case the reachability check above trivially passes).
    if (nodes.length > 1) {
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
    <div className="relative flex h-[calc(100vh-8rem)] flex-col gap-0 overflow-hidden">
      <div className="relative z-30 shrink-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 py-2 shadow-sm sm:px-4 sm:py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setIsListOpen(true)}
            type="button"
          >
            <List className="h-4 w-4" />
            All Orchestrations
          </button>
          <button
              className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              onClick={() => setIsCreateDialogOpen(true)}
              type="button"
            >
              <Plus className="h-4 w-4" />
              New Orchestration
          </button>
          {orchestration ? (
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
              {pendingRequestId ? (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSaving || isApprovingPendingRequest || isRejectingPendingRequest}
                    onClick={approvePendingRequest}
                    type="button"
                  >
                    <Check className="h-4 w-4" />
                    {isApprovingPendingRequest ? "Approving..." : "Approve"}
                  </button>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isSaving || isApprovingPendingRequest || isRejectingPendingRequest}
                    onClick={rejectPendingRequest}
                    type="button"
                  >
                    <Ban className="h-4 w-4" />
                    {isRejectingPendingRequest ? "Rejecting..." : "Reject"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={publishOrchestration}
                    disabled={isSaving || isPublishing}
                    type="button"
                  >
                    <Upload className="h-4 w-4" />
                    {isPublishing ? "Publishing..." : "Publish"}
                  </button>
                  {orchestration ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => {
                        if (!orchestration.targetAppId) {
                          showToast("Assign a target app to this orchestration before releasing it to an environment.", "error");
                          return;
                        }
                        setShowEnvironmentModal(true);
                      }}
                      title="Publishing alone does not make this available to chat users — release it to an environment too"
                      type="button"
                    >
                      <Globe2 className="h-4 w-4" />
                      Environments
                    </button>
                  ) : null}
                  {orchestration ? (
                    <button
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => setShowVersionHistoryModal(true)}
                      title="Load an earlier published version's graph back into the canvas"
                      type="button"
                    >
                      <History className="h-4 w-4" />
                      Version history
                    </button>
                  ) : null}
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
            </>
          ) : null}
        </div>

        {orchestration && (
          <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
            <span className="truncate text-sm font-semibold text-slate-700">
              {orchestration.name} <span className="text-xs text-slate-500">Published: v{formatVersion(orchestration.versionMajor, orchestration.versionBuild)}</span>
            </span>
            {loadedVersion !== null ? (
              <span className="ml-2 rounded-full border border-indigo-200 bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                Loaded: v{formatVersion(loadedVersion.major, loadedVersion.build)}
              </span>
            ) : null}
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

      {pendingRequestId && orchestration ? (
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2 py-2 sm:px-4">
          <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
            <input
              checked={allowRerunFromChat}
              className="mt-0.5 h-4 w-4 rounded border-slate-300"
              onChange={(event) => setAllowRerunFromChat(event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="block font-medium">Make this available to AI Planner for future chat requests</span>
              <span className="block text-xs text-slate-500">
                Originally requested by {pendingRequesterExternalUserId || "this requester"} — once enabled, AI Planner can match
                and run it for anyone who asks something similar, not only {pendingRequesterExternalUserId || "this requester"}.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {orchestration && (
        <div className={`absolute left-0 right-0 top-full z-30 border-b border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm ${
          isNodePaletteCollapsed ? "px-3 py-1" : "p-3"
        }`}>
          {!isNodePaletteCollapsed && (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 sm:gap-2.5 lg:grid-cols-7 lg:gap-3">
            {NODE_CONFIGS.map((nodeConfig) => {
              const isCompatible = isNodeCompatibleWithTrigger(nodeConfig.type, currentTriggerType);
              const reason = !isCompatible && currentTriggerType
                ? getIncompatibilityReason(nodeConfig.type, currentTriggerType)
                : null;
              const NodeIcon = nodeConfig.icon;

              return (
                <button
                  key={nodeConfig.type}
                  className={`flex min-w-0 items-center justify-center gap-2 rounded-lg border px-3 py-3 text-sm font-semibold transition-colors ${
                    isCompatible
                      ? "cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-60"
                  }`}
                  onClick={() => isCompatible && addNode(nodeConfig.type)}
                  disabled={!isCompatible}
                  title={reason || `Add ${nodeConfig.label} node`}
                  type="button"
                >
                  <span className="shrink-0 text-lg">
                    {typeof NodeIcon === "string" ? NodeIcon : <NodeIcon className="h-5 w-5" />}
                  </span>
                  <span className="truncate">{nodeConfig.label}</span>
                </button>
              );
            })}
          </div>
          )}

          <div className={`flex items-center justify-between ${isNodePaletteCollapsed ? "" : "mt-1 border-t border-slate-100 pt-1"}`}>
            <div className="flex items-center gap-1">
              <div className="relative">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                  onClick={() => setIsTipsOpen((open) => !open)}
                  aria-expanded={isTipsOpen}
                >
                  <Lightbulb className="h-4 w-4" />
                  Tips
                </button>

                {isTipsOpen && (
                  <div className="absolute left-0 top-full z-40 mt-2 w-72 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-semibold text-slate-900">Designer tips</span>
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        onClick={() => setIsTipsOpen(false)}
                        aria-label="Close tips"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <ul className="list-inside list-disc space-y-1">
                      <li>Click a node type to add it</li>
                      <li>Drag nodes to reposition them</li>
                      <li>Drag from a node edge to connect nodes</li>
                      <li>Click an edge and press Delete or Backspace to remove it</li>
                      <li>Drag an edge handle to reconnect it</li>
                      <li>Click a node to edit its properties</li>
                    </ul>
                  </div>
                )}
              </div>

              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                onClick={() => setIsNodeGuideOpen(true)}
              >
                <Info className="h-4 w-4" />
                Node guide
              </button>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              onClick={() => {
                setIsNodePaletteCollapsed((collapsed) => !collapsed);
                setIsTipsOpen(false);
              }}
              title={isNodePaletteCollapsed ? "Expand node types" : "Collapse node types"}
            >
              {isNodePaletteCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
              {isNodePaletteCollapsed ? "Show node types" : "Hide node types"}
            </button>
          </div>
        </div>
      )}
      </div>

      {orchestration ? (
        <div className="flex flex-1 overflow-hidden relative">
          {/* Node Toolbox */}
          <div 
            className="hidden"
          >
            <h3 className="mb-3 text-sm font-bold text-slate-900">Node Types</h3>
            <div className="space-y-2">
              {NODE_CONFIGS.map((nodeConfig) => {
                const isCompatible = isNodeCompatibleWithTrigger(nodeConfig.type, currentTriggerType);
                const reason = !isCompatible && currentTriggerType
                  ? getIncompatibilityReason(nodeConfig.type, currentTriggerType)
                  : null;
                const NodeIcon = nodeConfig.icon;

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
                      <span className="text-lg">
                        {typeof NodeIcon === "string" ? NodeIcon : <NodeIcon className="h-5 w-5" />}
                      </span>
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
              <Panel
                position="top-right"
                className={`bg-white rounded-lg shadow-md p-2 text-xs text-slate-600 transition-transform ${
                  isNodePaletteCollapsed
                    ? "translate-y-9"
                    : "translate-y-44 sm:translate-y-36 lg:translate-y-30"
                }`}
              >
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
              isViewingHistoricalVersion={loadedVersion !== null}
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
          selectedCompanyId={selectedCompanyId}
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
          onOrchestrationUpdated={(updatedOrchestration) => {
            setOrchestration((current) =>
              current && current.id === updatedOrchestration.id
                ? updatedOrchestration
                : current
            );
          }}
          onClose={() => setIsListOpen(false)}
          currentOrchestrationId={orchestration?.id}
          selectedCompanyId={selectedCompanyId}
          targetApps={targetApps}
        />
      )}

      {/* Node Guide */}
      {isNodeGuideOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 p-4" onClick={() => setIsNodeGuideOpen(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">Node guide</h3>
              <button
                type="button"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setIsNodeGuideOpen(false)}
                aria-label="Close node guide"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="scrollbar-hairline space-y-1 overflow-y-auto p-2">
              {NODE_CONFIGS.map((nodeConfig) => {
                const NodeIcon = nodeConfig.icon;
                return (
                  <div key={nodeConfig.type} className="flex items-start gap-3 rounded-lg px-2 py-2">
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center text-base"
                      style={{ color: nodeConfig.color }}
                    >
                      {typeof NodeIcon === "string" ? NodeIcon : <NodeIcon className="h-5 w-5" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{nodeConfig.label}</p>
                      <p className="text-xs leading-relaxed text-slate-600">{NODE_DESCRIPTIONS[nodeConfig.type]}</p>
                    </div>
                  </div>
                );
              })}
            </div>
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
      {showEnvironmentModal && orchestration && orchestration.targetAppId ? (
        <VersionedEnvironmentReleaseModal
          apiUrl={`/api/admin/orchestrations/${orchestration.id}/environments`}
          onClose={() => setShowEnvironmentModal(false)}
          onError={(message) => showToast(message, "error")}
          onSaved={() => showToast("Environment releases updated.", "success")}
          title={orchestration.name}
        />
      ) : null}
      {showVersionHistoryModal && orchestration ? (
        <VersionHistoryModal
          listApiUrl={`/api/admin/orchestrations/${orchestration.id}/versions`}
          onClose={() => setShowVersionHistoryModal(false)}
          onError={(message) => showToast(message, "error")}
          onLoad={loadOrchestrationVersion}
          title={orchestration.name}
        />
      ) : null}
    </div>
  );
}

function CreateOrchestrationDialog({
  selectedCompanyId,
  targetApps,
  onClose,
  onCreate,
}: {
  selectedCompanyId: string;
  targetApps: TargetAppOption[];
  onClose: () => void;
  onCreate: (orchestration: Orchestration) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAppId, setTargetAppId] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter target apps by selected header company
  const companyTargetApps = targetApps.filter((app) => app.companyId === selectedCompanyId);

  useEffect(() => {
    if (!companyTargetApps.some((app) => app.id === targetAppId)) {
      setTargetAppId("");
    }
  }, [companyTargetApps, targetAppId]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/admin/orchestrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: selectedCompanyId,
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
            disabled={!name || !selectedCompanyId || !targetAppId || creating}
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
