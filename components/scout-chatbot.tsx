"use client";

import { cn } from "@/lib/utils";
import type { ChatbotLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import {
  Archive,
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Grip,
  History,
  MessageCircle,
  Network,
  Pencil,
  Play,
  RefreshCcw,
  RotateCcw,
  Zap,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Undo2,
  UserRound,
  X
} from "lucide-react";
import {
  CSSProperties,
  FormEvent,
  KeyboardEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type ScoutChatRole = "assistant" | "user";

export type ScoutChatProgressStage =
  | "understanding"
  | "conversation_context"
  | "knowledge_search"
  | "workflow_lookup"
  | "data_lookup"
  | "planning"
  | "workflow_execution"
  | "external_service"
  | "formatting"
  | "almost_done";

export type ScoutChatProgressEventDetail = {
  message?: string;
  requestId?: string;
  stage?: ScoutChatProgressStage;
};

export const SCOUT_CHAT_PROGRESS_EVENT = "scout-chatbot:progress";

export function reportScoutChatProgress(detail: ScoutChatProgressEventDetail) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SCOUT_CHAT_PROGRESS_EVENT, { detail }));
  }
}

export type ScoutChatMessage = {
  id?: string;
  role: ScoutChatRole;
  text: string;
  time?: string;
  queryId?: string;
  citations?: ScoutChatCitation[];
  noAnswer?: boolean;
  noAnswerReason?: string;
  feedback?: "up" | "down";
  workflowSuggestion?: ScoutWorkflowSession;
  workflowActionSuggestion?: ScoutWorkflowActionSuggestion;
  intentModeSuggestion?: ScoutIntentModeSuggestion;
  routerIntent?: string;
  matchedOrchestrationIds?: string[];
};

export type ScoutChatCitation = {
  document_id: string;
  document_name: string;
  folder_path: string;
  page_number: number;
  section_title: string;
  chunk_id: string;
  preview: string;
  citation_type?: "text" | "visual";
  visual_asset_type?: string;
  source_url?: string;
  download_available?: boolean;
};

export type ScoutWorkflowSession = {
  id: string;
  title: string;
  description: string;
  estimatedTime: string;
  steps: number;
  preWorkflowConfirmationHtml?: string;
  preWorkflowConfirmationEnabled?: boolean;
  topics?: ScoutWorkflowTopic[];
};

export type ScoutWorkflowActionSuggestion = {
  workflow: ScoutWorkflowSession;
  originalText: string;
  confidence: number;
  status?: "pending" | "running" | "resolved" | "error";
  errorMessage?: string;
  routedByClassifier?: boolean;
  intentDecisionId?: string;
};

export type ScoutIntentModeSuggestion = {
  originalText: string;
  confidence: number;
  intentDecisionId?: string;
  suggestedIntent: "action" | "chat";
  status?: "pending" | "resolved";
};

type ScoutOrchestrationNode = {
  id: string;
  label: string;
  nodeType: string;
  description: string;
};

type ScoutOrchestration = {
  id: string;
  name: string;
  description: string;
  nodes: ScoutOrchestrationNode[];
};

type PendingRouterConfirmation = {
  originalText: string;
  workflow: ScoutWorkflowSession;
};

type PendingWorkflowConfirmation = {
  messageId: string;
  suggestion: ScoutWorkflowActionSuggestion;
};

type PendingActionModeFallback = {
  originalText: string;
};

type IntentGateDecision = {
  decisionId?: string;
  intent: "action" | "chat";
  confidence: number;
  lowConfidence: boolean;
  promptModeChoice: boolean;
  reason?: string;
};

export type ScoutWorkflowTopic = {
  id: string;
  title: string;
  guideId: string;
  description: string;
  estimatedTime: string;
  steps: number;
  preWorkflowConfirmationHtml?: string;
  preWorkflowConfirmationEnabled?: boolean;
};

type PlayerGuide = {
  id: string;
  title: string;
  description: string;
  steps: Array<{ enabled?: boolean }>;
  preWorkflowConfirmationHtml?: string;
  preWorkflowConfirmationEnabled?: boolean;
};

type PlayerTrainingSession = {
  id: string;
  title: string;
  topics: PlayerTrainingTopic[];
};

type PlayerTrainingTopic = {
  id: string;
  title: string;
  guideId: string;
  description: string;
  status: "draft" | "published";
  actionsCount: number;
  steps: number;
  preWorkflowConfirmationHtml?: string;
  preWorkflowConfirmationEnabled?: boolean;
  updatedAt: string;
};

type ScoutAdoptionPlayerHandle = {
  version?: string;
  guides: unknown[];
  play(guideId?: string): void;
};

const SCOUT_PLAYER_VERSION = "20260701-tooltip-rect-guard";

declare global {
  interface Window {
    ScoutAdoptionPlayer?: {
      smartRuntime?: boolean;
      version?: string;
      init(config: { scoutBaseUrl?: string; targetAppId: string; autoShowLauncher?: boolean }): Promise<ScoutAdoptionPlayerHandle>;
    };
  }
}

export type ScoutChatTheme = {
  brandColor?: string;
  accentColor?: string;
  surfaceColor?: string;
};

export type ScoutChatLifecycleConfig = Partial<ChatbotLifecycleSettings> & {
  resetEventNames?: string[];
};

export type ScoutChatbotProps = {
  assistantName?: string;
  apiKey?: string;
  badge?: string;
  chatEndpoint?: string;
  className?: string;
  companyId?: string;
  conversationId?: string;
  defaultMinimized?: boolean;
  defaultOpen?: boolean;
  initialMessages?: ScoutChatMessage[];
  launcherLabel?: string;
  lifecycleConfig?: ScoutChatLifecycleConfig;
  modeNotice?: ReactNode;
  onConversationChange?: (conversationId: string) => void;
  onMoveBy?: (delta: { x: number; y: number }) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onRestoreLayout?: () => void;
  onSizeChange?: (size: { width: number; height: number }) => void;
  onSendMessage?: (message: string, history: ScoutChatMessage[]) => Promise<ScoutChatMessage | string | void>;
  onRunWorkflow?: (
    message: string,
    workflow: ScoutWorkflowSession,
    history: ScoutChatMessage[]
  ) => Promise<ScoutChatMessage | string | void>;
  onStartWorkflow?: (workflow: ScoutWorkflowSession) => Promise<void> | void;
  placeholder?: string;
  position?: "bottom-right" | "bottom-left";
  quickPrompts?: string[];
  showHeaderActions?: boolean;
  intentGateEndpoint?: string;
  workflowRouterEndpoint?: string;
  scoutBaseUrl?: string;
  subtitle?: string;
  targetAppId?: string;
  targetAppName?: string;
  theme?: ScoutChatTheme;
  hostSessionKey?: string;
  userId?: string;
  userLabel?: string;
  variant?: "floating" | "inline" | "embedded";
  welcomeMessage?: string;
};

type RenderedMessage = Required<Pick<ScoutChatMessage, "id" | "role" | "text" | "time">> & {
  queryId?: string;
  citations?: ScoutChatCitation[];
  noAnswer?: boolean;
  noAnswerReason?: string;
  feedback?: "up" | "down";
  workflowSuggestion?: ScoutWorkflowSession;
  workflowActionSuggestion?: ScoutWorkflowActionSuggestion;
  intentModeSuggestion?: ScoutIntentModeSuggestion;
};

type WidgetStyle = CSSProperties & {
  "--scout-brand": string;
  "--scout-accent": string;
  "--scout-surface": string;
  "--scout-focus": string;
};

type ChatSize = {
  width: number;
  height: number;
};

type ChatPosition = {
  left: number;
  top: number;
};

type ChatTab = "qa" | "workflows";

type ConversationStatus = "active" | "archived" | "deleted";

type ConversationListItem = {
  id: string;
  title: string;
  status: ConversationStatus;
  message_count: number;
  last_message_at: string | null;
  created_at: string;
};

type ConversationHistoryState = {
  active: ConversationListItem[];
  archived: ConversationListItem[];
  activePage: number;
  archivedPage: number;
  activePageCount: number;
  archivedPageCount: number;
  search: string;
  loading: boolean;
  error: string;
};

type HistoryActionState = {
  type: "idle" | "renaming" | "deleting" | "archiving" | "restoring" | "success" | "error";
  conversationId: string | null;
  message: string;
};

const defaultReplies = [
  "I am ready for your API. Pass an async onSendMessage handler and I will render the response inside this same polished widget.",
  "This component is portable: configure brand color, welcome copy, launcher position, quick prompts, and message handling from props.",
  "For a customer install, mount the component once near the root of their app and pass user or session context to your backend handler."
];

const PROGRESS_MESSAGES: Record<ScoutChatProgressStage, string> = {
  understanding: "Understanding your request...",
  conversation_context: "Analyzing conversation context...",
  knowledge_search: "Searching connected knowledge...",
  workflow_lookup: "Retrieving workflow information...",
  data_lookup: "Looking up relevant data...",
  planning: "Planning the best response...",
  workflow_execution: "Executing workflow...",
  external_service: "Calling external services...",
  formatting: "Formatting the response...",
  almost_done: "Almost done...",
};

const FALLBACK_PROGRESS_MESSAGES = [
  PROGRESS_MESSAGES.understanding,
  PROGRESS_MESSAGES.conversation_context,
  PROGRESS_MESSAGES.knowledge_search,
  PROGRESS_MESSAGES.data_lookup,
  PROGRESS_MESSAGES.planning,
  PROGRESS_MESSAGES.formatting,
  PROGRESS_MESSAGES.almost_done,
];

const initialChatSize: ChatSize = {
  width: 440,
  height: 680
};

const initialChatPosition: ChatPosition = {
  left: 20,
  top: 20
};

const launcherSize: ChatSize = {
  width: 56,
  height: 56
};

const defaultLifecycleSettings: ChatbotLifecycleSettings = {
  maxContextMessages: 20,
  maxContextTokens: 5000,
  inactivityTimeoutSeconds: 1800,
  resetOnLogoutEvent: true,
  resetOnUserChange: true,
  resetOnTargetAppChange: true
};

const defaultResetEventNames = [
  "scout:host-logout",
  "scout:session-expired",
  "SCOUT_HOST_LOGOUT",
  "SCOUT_SESSION_EXPIRED"
];

const workflowActionVerbs = [
  "create",
  "add",
  "update",
  "change",
  "edit",
  "submit",
  "approve",
  "reject",
  "start",
  "run",
  "launch",
  "open",
  "assign",
  "move",
  "close",
  "cancel",
  "reset",
  "invite",
  "onboard",
  "offboard",
  "request",
  "escalate",
  "approve",
  "deploy",
  "send",
  "notify",
  "email",
  "message",
  "alert",
  "forward",
  "reply",
  "compose",
  "dispatch",
  "deliver",
  "share"
];

const workflowBusinessHints = [
  "order",
  "workflow",
  "process",
  "approval",
  "request",
  "ticket",
  "case",
  "task",
  "onboarding",
  "offboarding",
  "reset password",
  "change password",
  "create rate",
  "vendor",
  "employee",
  "invoice",
  "contract",
  "meeting",
  "purchase order",
  "email",
  "notification",
  "send email",
  "send message",
  "send notification",
  "greeting",
  "reminder",
  "alert"
];

const ACTION_ROUTER_WORKFLOW_ID = "__action_router__";

function createActionRouterWorkflow(): ScoutWorkflowSession {
  return {
    id: ACTION_ROUTER_WORKFLOW_ID,
    title: "Action Router",
    description: "Route actionable requests to the best orchestration plan.",
    estimatedTime: "1-2 min",
    steps: 1,
  };
}

export function ScoutChatbot({
  assistantName = "Scout Assistant",
  apiKey,
  chatEndpoint = "/chat/query",
  className,
  companyId,
  conversationId,
  defaultOpen = true,
  initialMessages,
  launcherLabel = "Open chat",
  lifecycleConfig,
  hostSessionKey,
  onConversationChange,
  onMoveBy,
  onOpenChange,
  onRestoreLayout,
  onSizeChange,
  onSendMessage,
  onRunWorkflow,
  onStartWorkflow,
  placeholder = "Ask anything...",
  position = "bottom-right",
  showHeaderActions = true,
  intentGateEndpoint = "/api/chatbot/intent-gate",
  workflowRouterEndpoint,
  scoutBaseUrl = "",
  targetAppId,
  targetAppName,
  theme,
  userId,
  userLabel = "You",
  variant = "inline"
}: ScoutChatbotProps) {
  const [conversationSessionId, setConversationSessionId] = useState(() => conversationId ?? createConversationSessionId());
  const messageStorageKey = getMessageStorageKey({ companyId, conversationId: conversationSessionId, userId, variant });
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<RenderedMessage[]>(() =>
    readStoredMessages(messageStorageKey) ?? normalizeMessages(initialMessages ?? [])
  );
  const [activityVersion, setActivityVersion] = useState(0);
  const [resolvedLifecycleSettings, setResolvedLifecycleSettings] = useState<ChatbotLifecycleSettings>(mergeLifecycleSettings(defaultLifecycleSettings, lifecycleConfig));
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearchDraft, setHistorySearchDraft] = useState("");
  const [historyDeleteTarget, setHistoryDeleteTarget] = useState<ConversationListItem | null>(null);
  const [historyRenameTarget, setHistoryRenameTarget] = useState<ConversationListItem | null>(null);
  const [historyRenameValue, setHistoryRenameValue] = useState("");
  const [selectedConversationIds, setSelectedConversationIds] = useState<Set<string>>(() => new Set());
  const [historyActionState, setHistoryActionState] = useState<HistoryActionState>({
    type: "idle",
    conversationId: null,
    message: ""
  });
  const [historyState, setHistoryState] = useState<ConversationHistoryState>({
    active: [],
    archived: [],
    activePage: 1,
    archivedPage: 1,
    activePageCount: 1,
    archivedPageCount: 1,
    search: "",
    loading: false,
    error: ""
  });
  const [input, setInput] = useState("");
  const [actionModeArmed, setActionModeArmed] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [progressMessage, setProgressMessage] = useState("Understanding your request...");
  const progressRequestIdRef = useRef<string | null>(null);
  const lastProgressEventAtRef = useRef(0);
  const [activeTab, setActiveTab] = useState<ChatTab>("qa");
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<ScoutWorkflowSession | null>(null);
  const [workflowSessions, setWorkflowSessions] = useState<ScoutWorkflowSession[]>([]);
  const [expandedWorkflowSessions, setExpandedWorkflowSessions] = useState<Set<string>>(() => new Set());
  const [workflowsState, setWorkflowsState] = useState<{ status: "idle" | "loading" | "ready" | "error"; message: string }>({
    status: "idle",
    message: ""
  });
  const [orchestrationPanelOpen, setOrchestrationPanelOpen] = useState(false);
  const [orchestrations, setOrchestrations] = useState<ScoutOrchestration[]>([]);
  const [expandedOrchestrations, setExpandedOrchestrations] = useState<Set<string>>(() => new Set());
  const [orchestrationsState, setOrchestrationsState] = useState<{ status: "idle" | "loading" | "ready" | "error"; message: string }>({
    status: "idle",
    message: ""
  });
  const [authBlockedMessage, setAuthBlockedMessage] = useState<string | null>(null);
  const playerHandleRef = useRef<ScoutAdoptionPlayerHandle | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [panelSize, setPanelSize] = useState<ChatSize>(initialChatSize);
  const [panelPosition, setPanelPosition] = useState<ChatPosition>(initialChatPosition);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesViewportRef = useRef<HTMLDivElement>(null);
  const activeConversationId = useRef(conversationId ?? conversationSessionId);
  const lastActivityAtRef = useRef(Date.now());
  const scopeRef = useRef<string | null>(null);
  const pendingRouterConfirmationRef = useRef<PendingRouterConfirmation | null>(null);
  const pendingWorkflowConfirmationRef = useRef<PendingWorkflowConfirmation | null>(null);
  const pendingActionModeFallbackRef = useRef<PendingActionModeFallback | null>(null);

  const showProgress = useCallback((stage: ScoutChatProgressStage, requestId?: string) => {
    progressRequestIdRef.current = requestId || progressRequestIdRef.current || createProgressRequestId();
    lastProgressEventAtRef.current = Date.now();
    setProgressMessage(PROGRESS_MESSAGES[stage]);
    setIsTyping(true);
  }, []);

  useEffect(() => {
    if (!isTyping) {
      progressRequestIdRef.current = null;
      setProgressMessage(PROGRESS_MESSAGES.understanding);
      return;
    }

    if (!progressRequestIdRef.current) {
      progressRequestIdRef.current = createProgressRequestId();
    }

    let messageIndex = Math.max(0, FALLBACK_PROGRESS_MESSAGES.indexOf(progressMessage));
    let timeoutId: number | null = null;

    const scheduleNext = () => {
      const delayMs = messageIndex === 0 ? 3200 : 4300 + Math.floor(Math.random() * 1700);
      timeoutId = window.setTimeout(() => {
        if (Date.now() - lastProgressEventAtRef.current < 3000) {
          scheduleNext();
          return;
        }
        messageIndex = Math.min(messageIndex + 1, FALLBACK_PROGRESS_MESSAGES.length - 1);
        setProgressMessage(FALLBACK_PROGRESS_MESSAGES[messageIndex]);
        if (messageIndex < FALLBACK_PROGRESS_MESSAGES.length - 1) {
          scheduleNext();
        }
      }, delayMs);
    };

    scheduleNext();
    return () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isTyping]);

  useEffect(() => {
    const receiveProgress = (event: Event) => {
      const detail = (event as CustomEvent<ScoutChatProgressEventDetail>).detail;
      if (!detail || !isTyping) return;
      if (
        detail.requestId
        && progressRequestIdRef.current
        && detail.requestId !== progressRequestIdRef.current
      ) {
        return;
      }

      if (detail.message?.trim()) {
        lastProgressEventAtRef.current = Date.now();
        setProgressMessage(detail.message.trim());
      } else if (detail.stage) {
        lastProgressEventAtRef.current = Date.now();
        setProgressMessage(PROGRESS_MESSAGES[detail.stage]);
      }
    };

    window.addEventListener(SCOUT_CHAT_PROGRESS_EVENT, receiveProgress);
    return () => window.removeEventListener(SCOUT_CHAT_PROGRESS_EVENT, receiveProgress);
  }, [isTyping]);

  // Generate unique message ID using timestamp + random component
  const generateMessageId = () => {
    return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  function isApiKeyAuthFailure(status: number, message: string) {
    if (status !== 401) {
      return false;
    }

    const normalized = String(message || "").toLowerCase();
    return normalized.includes("api key")
      || normalized.includes("unauthorized")
      || normalized.includes("invalid");
  }

  function blockChatbotForInvalidKey() {
    const userFriendlyMessage = "This chatbot is currently unavailable because API access is no longer valid. Please contact your administrator to activate a valid API key.";
    setAuthBlockedMessage(userFriendlyMessage);
    clearOrchestrationState();
    setWorkflowSessions([]);
    setExpandedWorkflowSessions(new Set());
    setOrchestrations([]);
    setExpandedOrchestrations(new Set());
    setWorkflowsState({ status: "error", message: userFriendlyMessage });
    setOrchestrationsState({ status: "error", message: userFriendlyMessage });
  }

  const apiKeyHeaders = useMemo<Record<string, string>>(() => {
    const trimmed = String(apiKey || "").trim();
    const headers: Record<string, string> = {};
    if (trimmed) {
      headers["X-API-Key"] = trimmed;
    }
    return headers;
  }, [apiKey]);

  async function emitActionModeTelemetry(eventType: "action_mode_invoked" | "action_mode_auto_reset", metadata?: Record<string, unknown>) {
    if (!companyId || !userId) {
      return;
    }

    try {
      await fetch("/api/chatbot/action-mode-telemetry", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...apiKeyHeaders,
        },
        body: JSON.stringify({
          companyId,
          userId,
          targetAppId: targetAppId || undefined,
          conversationId: activeConversationId.current || conversationSessionId || undefined,
          eventType,
          metadata: metadata || {},
        }),
      });
    } catch {
      // Non-fatal telemetry
    }
  }

  function armActionMode(source: "button" | "keyboard") {
    setActionModeArmed(true);
    void emitActionModeTelemetry("action_mode_invoked", { source });
  }

  function autoResetActionMode(reason: string) {
    setActionModeArmed(false);
    void emitActionModeTelemetry("action_mode_auto_reset", { reason });
  }

  const cssVars: WidgetStyle = {
    "--scout-brand": theme?.brandColor ?? "#020617",
    "--scout-accent": theme?.accentColor ?? "#0ea5e9",
    "--scout-surface": theme?.surfaceColor ?? "#ffffff",
    "--scout-focus": `${theme?.accentColor ?? "#0ea5e9"}24`
  };

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
    setActivityVersion((current) => current + 1);
  }, []);

  const setOpen = useCallback((nextValue: boolean) => {
    markActivity();
    setIsOpen(nextValue);
    onOpenChange?.(nextValue);
  }, [markActivity, onOpenChange]);

  const resetConversationState = useCallback((options?: { preserveOpenState?: boolean }) => {
    const nextConversationId = createConversationSessionId();
    clearStoredMessages(messageStorageKey);
    clearOrchestrationState();
    activeConversationId.current = nextConversationId;
    setConversationSessionId(nextConversationId);
    setMessages(normalizeMessages(initialMessages ?? []));
    setInput("");
    setIsTyping(false);
    pendingRouterConfirmationRef.current = null;
    pendingWorkflowConfirmationRef.current = null;
    pendingActionModeFallbackRef.current = null;
    setActiveTab("qa");
    setActiveWorkflow(null);
    setHistoryOpen(false);
    setSelectedConversationIds(new Set());
    markActivity();
    onConversationChange?.(nextConversationId);

    if (!options?.preserveOpenState) {
      setOpen(true);
    }
  }, [initialMessages, markActivity, messageStorageKey, onConversationChange, setOpen]);

  function openFloatingChat() {
    setIsMinimizing(false);
    const nextSize = clampChatSize(panelSize);
    setPanelSize(nextSize);
    setPanelPosition(getBottomRightChatPosition(nextSize));
    setIsOpen(true);
  }

  const closeFloatingChat = useCallback(() => {
    if (variant === "floating" && isOpen) {
      setIsMinimizing(true);
      setPanelPosition(getBottomRightChatPosition(launcherSize));
      window.setTimeout(() => {
        setIsOpen(false);
        setIsMinimizing(false);
      }, 220);
      return;
    }

    setPanelPosition(getBottomRightChatPosition(launcherSize));
    setIsOpen(false);
  }, [isOpen, setIsOpen, variant]);

  function restoreFloatingLayout() {
    if (variant === "embedded") {
      const nextSize = { width: 480, height: 740 };
      setPanelSize(nextSize);
      onSizeChange?.(nextSize);
      onRestoreLayout?.();
      return;
    }

    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(getDefaultChatPosition(position, nextSize));
  }

  useEffect(() => {
    setHasMounted(true);

    if (variant !== "floating") {
      return;
    }

    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(defaultOpen ? getDefaultChatPosition(position, nextSize) : getBottomRightChatPosition(launcherSize));
  }, [defaultOpen, position, variant]);

  useEffect(() => {
    if (!companyId) {
      setResolvedLifecycleSettings(mergeLifecycleSettings(defaultLifecycleSettings, lifecycleConfig));
      return;
    }

    const controller = new AbortController();
    const safeCompanyId = companyId;
    const safeTargetAppId = targetAppId;

    async function loadLifecycleSettings() {
      try {
        const url = new URL("/api/chatbot/settings", window.location.origin);
        url.searchParams.set("company_id", safeCompanyId);
        if (safeTargetAppId) {
          url.searchParams.set("target_app_id", safeTargetAppId);
        }
        const response = await fetch(url.toString(), { signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(typeof body?.message === "string" ? body.message : "Unable to load chatbot lifecycle settings.");
        }

        setResolvedLifecycleSettings(mergeLifecycleSettings(body ?? defaultLifecycleSettings, lifecycleConfig));
      } catch {
        if (!controller.signal.aborted) {
          setResolvedLifecycleSettings(mergeLifecycleSettings(defaultLifecycleSettings, lifecycleConfig));
        }
      }
    }

    void loadLifecycleSettings();

    return () => controller.abort();
  }, [companyId, lifecycleConfig, targetAppId]);

  // Listen for minimize events from orchestration links
  useEffect(() => {
    const handleMinimize = () => {
      console.log('📩 Received SCOUT_MINIMIZE_CHATBOT event');
      if (variant === "floating") {
        closeFloatingChat();
      } else {
        setIsOpen(false);
      }
    };

    window.addEventListener('SCOUT_MINIMIZE_CHATBOT', handleMinimize);
    return () => window.removeEventListener('SCOUT_MINIMIZE_CHATBOT', handleMinimize);
  }, [closeFloatingChat, setIsOpen, variant]);

  useEffect(() => {
    writeStoredMessages(messageStorageKey, messages);
  }, [messageStorageKey, messages]);

  useEffect(() => {
    const stored = readStoredMessages(messageStorageKey);
    setMessages(stored ?? normalizeMessages(initialMessages ?? []));
    setInput("");
    setIsTyping(false);
  }, [initialMessages, messageStorageKey]);

  useEffect(() => {
    if (conversationId && conversationId !== activeConversationId.current) {
      activeConversationId.current = conversationId;
      setConversationSessionId(conversationId);
    }
  }, [conversationId]);

  const loadConversationHistory = useCallback(async (overrides?: { activePage?: number; archivedPage?: number; search?: string }) => {
    if (!companyId || !userId) {
      setHistoryState((current) => ({
        ...current,
        active: [],
        archived: [],
        activePage: 1,
        archivedPage: 1,
        activePageCount: 1,
        archivedPageCount: 1,
        loading: false,
        error: ""
      }));
      return;
    }

    const nextActivePage = overrides?.activePage ?? historyState.activePage;
    const nextArchivedPage = overrides?.archivedPage ?? historyState.archivedPage;
    const nextSearch = overrides?.search ?? historyState.search;

    setHistoryState((current) => ({ ...current, loading: true, error: "", search: nextSearch }));

    try {
      const buildUrl = (status: "active" | "archived", page: number) => {
        const url = new URL("/conversations", window.location.origin);
        url.searchParams.set("company_id", companyId);
        url.searchParams.set("user_id", userId);
        url.searchParams.set("status", status);
        url.searchParams.set("page", String(page));
        url.searchParams.set("pageSize", "20");
        if (nextSearch) {
          url.searchParams.set("search", nextSearch);
        }
        return url.toString();
      };

      const [activeResponse, archivedResponse] = await Promise.all([
        fetch(buildUrl("active", nextActivePage)),
        fetch(buildUrl("archived", nextArchivedPage))
      ]);

      const [activeBody, archivedBody] = await Promise.all([
        activeResponse.json().catch(() => null),
        archivedResponse.json().catch(() => null)
      ]);

      if (!activeResponse.ok || !archivedResponse.ok) {
        throw new Error(
          typeof activeBody?.message === "string"
            ? activeBody.message
            : typeof archivedBody?.message === "string"
            ? archivedBody.message
            : "Unable to load conversation history."
        );
      }

      setHistoryState({
        active: Array.isArray(activeBody?.conversations) ? activeBody.conversations : [],
        archived: Array.isArray(archivedBody?.conversations) ? archivedBody.conversations : [],
        activePage: Number(activeBody?.page ?? nextActivePage),
        archivedPage: Number(archivedBody?.page ?? nextArchivedPage),
        activePageCount: Number(activeBody?.pageCount ?? 1),
        archivedPageCount: Number(archivedBody?.pageCount ?? 1),
        search: nextSearch,
        loading: false,
        error: ""
      });
    } catch (error) {
      setHistoryState((current) => ({
        ...current,
        active: [],
        archived: [],
        activePageCount: 1,
        archivedPageCount: 1,
        loading: false,
        error: error instanceof Error ? error.message : "Unable to load conversation history."
      }));
    }
  }, [companyId, historyState.activePage, historyState.archivedPage, historyState.search, userId]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void loadConversationHistory({ activePage: 1, archivedPage: 1, search: historySearchDraft });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [historyOpen, historySearchDraft, loadConversationHistory]);

  useEffect(() => {
    if (!["success", "error"].includes(historyActionState.type)) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHistoryActionState({ type: "idle", conversationId: null, message: "" });
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [historyActionState]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    void loadConversationHistory();
  }, [historyOpen, loadConversationHistory, conversationSessionId, messages.length]);

  useEffect(() => {
    const scopeKey = [companyId || "", userId || "", targetAppId || "", hostSessionKey || ""].join(":");
    if (scopeRef.current === null) {
      scopeRef.current = scopeKey;
      return;
    }

    if (scopeRef.current === scopeKey) {
      return;
    }

    const companyOrUserChanged = scopeRef.current.split(":").slice(0, 2).join(":") !== scopeKey.split(":").slice(0, 2).join(":");
    const targetChanged = scopeRef.current.split(":")[2] !== scopeKey.split(":")[2];

    scopeRef.current = scopeKey;

    if ((companyOrUserChanged && resolvedLifecycleSettings.resetOnUserChange) || (targetChanged && resolvedLifecycleSettings.resetOnTargetAppChange)) {
      resetConversationState({ preserveOpenState: true });
    }
  }, [companyId, hostSessionKey, resetConversationState, resolvedLifecycleSettings.resetOnTargetAppChange, resolvedLifecycleSettings.resetOnUserChange, targetAppId, userId]);

  useEffect(() => {
    const eventNames = lifecycleConfig?.resetEventNames ?? defaultResetEventNames;

    if (!resolvedLifecycleSettings.resetOnLogoutEvent) {
      return;
    }

    const handler = () => resetConversationState({ preserveOpenState: true });
    eventNames.forEach((name) => window.addEventListener(name, handler));

    return () => {
      eventNames.forEach((name) => window.removeEventListener(name, handler));
    };
  }, [lifecycleConfig?.resetEventNames, resetConversationState, resolvedLifecycleSettings.resetOnLogoutEvent]);

  useEffect(() => {
    const timeoutMs = resolvedLifecycleSettings.inactivityTimeoutSeconds * 1000;
    const timer = window.setTimeout(() => {
      resetConversationState({ preserveOpenState: true });
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [activityVersion, conversationSessionId, resetConversationState, resolvedLifecycleSettings.inactivityTimeoutSeconds]);

  useEffect(() => {
    if (!isOpen || activeTab !== "qa") {
      return;
    }

    const viewport = messagesViewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = viewport.scrollHeight;
  }, [activeTab, isOpen, isTyping, messages]);

  useEffect(() => {
    if (authBlockedMessage) {
      setWorkflowSessions([]);
      setExpandedWorkflowSessions(new Set());
      setWorkflowsState({ status: "error", message: authBlockedMessage });
      return;
    }

    if (!targetAppId || !companyId || !userId) {
      setWorkflowSessions([]);
      setWorkflowsState({ status: "idle", message: "Select an authorized target application to view guided workflows." });
      return;
    }

    const workflowTargetAppId = targetAppId;
    const workflowCompanyId = companyId;
    const workflowUserId = userId;
    let ignore = false;
    const controller = new AbortController();

    async function loadWorkflows() {
      setWorkflowsState({ status: "loading", message: "" });

      try {
        const url = new URL("/api/guided-workflow-player/guides", scoutBaseUrl || window.location.origin);
        url.searchParams.set("targetAppId", workflowTargetAppId);
        url.searchParams.set("companyId", workflowCompanyId);
        url.searchParams.set("userId", workflowUserId);
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: apiKeyHeaders,
        });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          const message = typeof body?.message === "string" ? body.message : "Unable to load guided workflows.";
          if (isApiKeyAuthFailure(response.status, message)) {
            blockChatbotForInvalidKey();
          }
          throw new Error(message);
        }

        const guides = Array.isArray(body?.guides) ? body.guides as PlayerGuide[] : [];
        const sessions = Array.isArray(body?.sessions) ? body.sessions as PlayerTrainingSession[] : [];

        if (!ignore) {
          setWorkflowSessions(sessions.length > 0 ? sessions.map(workflowSessionFromPlayerSession) : guides.map(workflowFromGuide));
          setExpandedWorkflowSessions(new Set());
          setWorkflowsState({
            status: "ready",
            message: sessions.length === 0 && guides.length === 0 ? `No published guided workflows found${targetAppName ? ` for ${targetAppName}` : ""}.` : ""
          });
          void getPlayerHandle({ scoutBaseUrl, targetAppId: workflowTargetAppId }, playerHandleRef).catch(() => undefined);
        }
      } catch (error) {
        if (controller.signal.aborted || ignore) {
          return;
        }

        setWorkflowSessions([]);
        setWorkflowsState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to load guided workflows."
        });
      }
    }

    void loadWorkflows();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [apiKeyHeaders, authBlockedMessage, companyId, scoutBaseUrl, targetAppId, targetAppName, userId]);

  useEffect(() => {
    if (authBlockedMessage) {
      setOrchestrations([]);
      setExpandedOrchestrations(new Set());
      setOrchestrationsState({ status: "error", message: authBlockedMessage });
      return;
    }

    if (!companyId || !userId || !targetAppId) {
      setOrchestrations([]);
      setOrchestrationsState({ status: "idle", message: "Select an authorized target application to view orchestrations." });
      return;
    }

    const controller = new AbortController();
    let ignore = false;

    async function loadOrchestrations() {
      setOrchestrationsState({ status: "loading", message: "" });
      try {
        const url = new URL("/api/chatbot/orchestrations", scoutBaseUrl || window.location.origin);
        url.searchParams.set("companyId", companyId!);
        url.searchParams.set("userId", userId!);
        url.searchParams.set("targetAppId", targetAppId!);
        const response = await fetch(url.toString(), {
          signal: controller.signal,
          headers: apiKeyHeaders,
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof body?.message === "string" ? body.message : "Unable to load orchestrations.";
          if (isApiKeyAuthFailure(response.status, message)) {
            blockChatbotForInvalidKey();
          }
          throw new Error(message);
        }
        if (!ignore) {
          const scopedOrchestrations = Array.isArray(body?.orchestrations) ? body.orchestrations as ScoutOrchestration[] : [];
          setOrchestrations(scopedOrchestrations);
          setExpandedOrchestrations(new Set());
          setOrchestrationsState({
            status: "ready",
            message: scopedOrchestrations.length === 0 ? `No published orchestrations found${targetAppName ? ` for ${targetAppName}` : ""}.` : ""
          });
        }
      } catch (error) {
        if (!controller.signal.aborted && !ignore) {
          setOrchestrations([]);
          setOrchestrationsState({
            status: "error",
            message: error instanceof Error ? error.message : "Unable to load orchestrations."
          });
        }
      }
    }

    void loadOrchestrations();
    return () => {
      ignore = true;
      controller.abort();
    };
  }, [apiKeyHeaders, authBlockedMessage, companyId, scoutBaseUrl, targetAppId, targetAppName, userId]);

  const resumeConversation = useCallback(async (targetConversationId: string) => {
    if (!companyId || !userId || !targetConversationId) {
      return;
    }

    const url = new URL(`/conversations/${encodeURIComponent(targetConversationId)}`, window.location.origin);
    url.searchParams.set("company_id", companyId);
    url.searchParams.set("user_id", userId);
    url.searchParams.set("pageSize", "200");

    const response = await fetch(url.toString());
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to resume conversation.");
    }

    const serverMessages = Array.isArray(body?.messages?.messages) ? body.messages.messages : [];
    const renderedMessages = normalizeMessages(serverMessages.map((message: { id: string; sender: string; content: string; citations_json?: ScoutChatCitation[]; created_at?: string }) => ({
      id: message.id,
      role: message.sender === "user" ? "user" : "assistant",
      text: message.content,
      time: formatTimeFromDate(message.created_at),
      citations: Array.isArray(message.citations_json) ? message.citations_json : []
    })));

    activeConversationId.current = targetConversationId;
    setConversationSessionId(targetConversationId);
    setMessages(renderedMessages);
    setActiveTab("qa");
    setHistoryOpen(false);
    markActivity();
    onConversationChange?.(targetConversationId);
  }, [companyId, markActivity, onConversationChange, userId]);

  const updateConversationStatus = useCallback(async (targetConversationId: string, status: "active" | "archived") => {
    if (!companyId || !userId || !targetConversationId) {
      return;
    }

    setHistoryActionState({
      type: status === "archived" ? "archiving" : "restoring",
      conversationId: targetConversationId,
      message: status === "archived" ? "Archiving conversation..." : "Restoring conversation..."
    });

    const response = await fetch(`/conversations/${encodeURIComponent(targetConversationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        user_id: userId,
        status
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setHistoryActionState({
        type: "error",
        conversationId: targetConversationId,
        message: typeof body?.message === "string" ? body.message : "Unable to update conversation."
      });
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to update conversation.");
    }

    if (status === "archived" && targetConversationId === conversationSessionId) {
      resetConversationState({ preserveOpenState: true });
    }

    await loadConversationHistory();
    setHistoryActionState({
      type: "success",
      conversationId: targetConversationId,
      message: status === "archived" ? "Conversation archived." : "Conversation restored."
    });
  }, [companyId, conversationSessionId, loadConversationHistory, resetConversationState, userId]);

  const renameConversation = useCallback(async () => {
    if (!companyId || !userId || !historyRenameTarget || !historyRenameValue.trim()) {
      return;
    }

    setHistoryActionState({
      type: "renaming",
      conversationId: historyRenameTarget.id,
      message: "Saving conversation title..."
    });

    const response = await fetch(`/conversations/${encodeURIComponent(historyRenameTarget.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        user_id: userId,
        title: historyRenameValue.trim()
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setHistoryActionState({
        type: "error",
        conversationId: historyRenameTarget.id,
        message: typeof body?.message === "string" ? body.message : "Unable to rename conversation."
      });
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to rename conversation.");
    }

    setHistoryRenameTarget(null);
    setHistoryRenameValue("");
    await loadConversationHistory();
    setHistoryActionState({
      type: "success",
      conversationId: null,
      message: "Conversation renamed."
    });
  }, [companyId, historyRenameTarget, historyRenameValue, loadConversationHistory, userId]);

  const toggleConversationSelection = useCallback((conversationIdToToggle: string) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationIdToToggle)) {
        next.delete(conversationIdToToggle);
      } else {
        next.add(conversationIdToToggle);
      }
      return next;
    });
  }, []);

  const setSectionSelection = useCallback((items: ConversationListItem[], shouldSelect: boolean) => {
    setSelectedConversationIds((current) => {
      const next = new Set(current);
      items.forEach((item) => {
        if (shouldSelect) {
          next.add(item.id);
        } else {
          next.delete(item.id);
        }
      });
      return next;
    });
  }, []);

  const clearConversationSelection = useCallback(() => {
    setSelectedConversationIds(new Set());
  }, []);

  const bulkUpdateConversationStatus = useCallback(async (items: ConversationListItem[], status: "active" | "archived") => {
    const selectedItems = items.filter((item) => selectedConversationIds.has(item.id));
    if (!companyId || !userId || selectedItems.length === 0) {
      return;
    }

    setHistoryActionState({
      type: status === "archived" ? "archiving" : "restoring",
      conversationId: null,
      message: status === "archived"
        ? `Archiving ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}...`
        : `Restoring ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}...`
    });

    await Promise.all(selectedItems.map(async (item) => {
      const response = await fetch(`/conversations/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          user_id: userId,
          status
        })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof body?.message === "string" ? body.message : "Unable to update one or more conversations.");
      }
    }));

    if (status === "archived" && selectedItems.some((item) => item.id === conversationSessionId)) {
      resetConversationState({ preserveOpenState: true });
    }

    clearConversationSelection();
    await loadConversationHistory();
    setHistoryActionState({
      type: "success",
      conversationId: null,
      message: status === "archived"
        ? `Archived ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}.`
        : `Restored ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}.`
    });
  }, [clearConversationSelection, companyId, conversationSessionId, loadConversationHistory, resetConversationState, selectedConversationIds, userId]);

  const bulkDeleteConversations = useCallback(async (items: ConversationListItem[]) => {
    const selectedItems = items.filter((item) => selectedConversationIds.has(item.id));
    if (!companyId || !userId || selectedItems.length === 0) {
      return;
    }

    setHistoryActionState({
      type: "deleting",
      conversationId: null,
      message: `Deleting ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}...`
    });

    await Promise.all(selectedItems.map(async (item) => {
      const response = await fetch(`/conversations/${encodeURIComponent(item.id)}?company_id=${encodeURIComponent(companyId)}&user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE"
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(typeof body?.message === "string" ? body.message : "Unable to delete one or more conversations.");
      }
    }));

    if (selectedItems.some((item) => item.id === conversationSessionId)) {
      resetConversationState({ preserveOpenState: true });
    }

    clearConversationSelection();
    await loadConversationHistory();
    setHistoryActionState({
      type: "success",
      conversationId: null,
      message: `Deleted ${selectedItems.length} conversation${selectedItems.length === 1 ? "" : "s"}.`
    });
  }, [clearConversationSelection, companyId, conversationSessionId, loadConversationHistory, resetConversationState, selectedConversationIds, userId]);

  const deleteConversation = useCallback(async () => {
    if (!companyId || !userId || !historyDeleteTarget) {
      return;
    }

    if (historyDeleteTarget.id === "__bulk__") {
      await bulkDeleteConversations([...historyState.active, ...historyState.archived]);
      setHistoryDeleteTarget(null);
      return;
    }

    setHistoryActionState({
      type: "deleting",
      conversationId: historyDeleteTarget.id,
      message: "Deleting conversation..."
    });

    const response = await fetch(`/conversations/${encodeURIComponent(historyDeleteTarget.id)}?company_id=${encodeURIComponent(companyId)}&user_id=${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      setHistoryActionState({
        type: "error",
        conversationId: historyDeleteTarget.id,
        message: typeof body?.message === "string" ? body.message : "Unable to delete conversation."
      });
      throw new Error(typeof body?.message === "string" ? body.message : "Unable to delete conversation.");
    }

    const deletingCurrent = historyDeleteTarget.id === conversationSessionId;
    setHistoryDeleteTarget(null);

    if (deletingCurrent) {
      resetConversationState({ preserveOpenState: true });
    }

    await loadConversationHistory();
    setHistoryActionState({
      type: "success",
      conversationId: null,
      message: "Conversation deleted."
    });
  }, [bulkDeleteConversations, companyId, conversationSessionId, historyDeleteTarget, historyState.active, historyState.archived, loadConversationHistory, resetConversationState, userId]);

  function toggleWorkflowSession(sessionId: string) {
    setExpandedWorkflowSessions((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  }

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if ((variant !== "floating" && variant !== "embedded") || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    let previousScreenX = event.screenX;
    let previousScreenY = event.screenY;
    const startPosition = clampChatPosition(panelPosition, panelSize);
    document.body.classList.add("select-none");

    function move(moveEvent: PointerEvent) {
      if (variant === "embedded") {
        onMoveBy?.({ x: moveEvent.screenX - previousScreenX, y: moveEvent.screenY - previousScreenY });
        previousScreenX = moveEvent.screenX;
        previousScreenY = moveEvent.screenY;
        return;
      }

      setPanelPosition(
        clampChatPosition(
          {
            left: startPosition.left + moveEvent.clientX - startX,
            top: startPosition.top + moveEvent.clientY - startY
          },
          panelSize
        )
      );
    }

    function stop() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.body.classList.remove("select-none");
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  function handleResizePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (variant !== "floating" && variant !== "embedded") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = variant === "embedded"
      ? { width: window.innerWidth, height: window.innerHeight }
      : panelSize;
    document.body.classList.add("select-none");

    function move(moveEvent: PointerEvent) {
      const requestedSize = {
        width: startSize.width + moveEvent.clientX - startX,
        height: startSize.height + moveEvent.clientY - startY
      };
      const nextSize = variant === "embedded"
        ? {
            width: Math.min(Math.max(requestedSize.width, 340), 960),
            height: Math.min(Math.max(requestedSize.height, 440), 960)
          }
        : clampChatSize(requestedSize);

      setPanelSize(nextSize);
      if (variant === "embedded") {
        onSizeChange?.(nextSize);
      } else {
        setPanelPosition((current) => clampChatPosition(current, nextSize));
      }
    }

    function stop() {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", stop);
      document.body.classList.remove("select-none");
    }

    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stop);
  }

  async function sendMessage(text: string) {
    const trimmed = text.trim();

    if (authBlockedMessage) {
      setMessages((current) => [
        ...current,
        createRenderedMessage({
          id: generateMessageId(),
          role: "assistant",
          text: authBlockedMessage,
          time: formatTime(),
        }),
      ]);
      return;
    }

    if (!trimmed || isTyping) {
      return;
    }

    const userMessage = createRenderedMessage({
      id: generateMessageId(),
      role: "user",
      text: trimmed,
      time: formatTime()
    });

    const nextHistory = [...messages, userMessage];
    const contextWindow = trimMessagesForLifecycle(nextHistory, resolvedLifecycleSettings);

    if (pendingActionModeFallbackRef.current) {
      const pending = pendingActionModeFallbackRef.current;

      if (isAffirmativeResponse(trimmed)) {
        pendingActionModeFallbackRef.current = null;
        setMessages(nextHistory);
        setInput("");
        markActivity();
        await completeChatResponse(pending.originalText, contextWindow);
        return;
      }

      if (isNegativeResponse(trimmed)) {
        pendingActionModeFallbackRef.current = null;
        setMessages((current) => [
          ...current,
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: "Okay, no problem. I will not send this to chat.",
            time: formatTime(),
          }),
        ]);
        setInput("");
        markActivity();
        inputRef.current?.focus();
        return;
      }
    }

    if (pendingRouterConfirmationRef.current) {
      const pending = pendingRouterConfirmationRef.current;

      if (isAffirmativeResponse(trimmed)) {
        setMessages(nextHistory);
        setInput("");
        markActivity();
        showProgress("workflow_execution");

        try {
          const workflowReply = await runWorkflowRouter(
            pending.originalText,
            pending.workflow,
            contextWindow,
            { allowDraftPlan: true, forceActionMode: true }
          );
          const assistantReply = resolveReply(workflowReply);

          setMessages((current) => [
            ...current,
            createRenderedMessage({
              ...assistantReply,
              id: assistantReply.id ?? generateMessageId(),
              role: "assistant",
              time: assistantReply.time ?? formatTime()
            })
          ]);
        } catch (error) {
          setMessages((current) => [
            ...current,
            createRenderedMessage({
              id: generateMessageId(),
              role: "assistant",
              text: error instanceof Error ? error.message : "I could not complete that action request right now.",
              time: formatTime()
            })
          ]);
        } finally {
          setIsTyping(false);
          markActivity();
          inputRef.current?.focus();
        }

        return;
      }

      if (isNegativeResponse(trimmed)) {
        pendingRouterConfirmationRef.current = null;
        setMessages([
          ...nextHistory,
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: `Okay, I won’t run ${pending.workflow.title}.`,
            time: formatTime(),
          }),
        ]);
        setInput("");
        markActivity();
        inputRef.current?.focus();
        return;
      }

      if (isAmbiguousShortResponse(trimmed)) {
        setMessages([
          ...nextHistory,
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: `Would you like me to run ${pending.workflow.title}, or cancel it?`,
            time: formatTime(),
          }),
        ]);
        setInput("");
        markActivity();
        inputRef.current?.focus();
        return;
      }
    }

    const pendingWorkflow = pendingWorkflowConfirmationRef.current
      ?? findPendingWorkflowConfirmation(messages);
    if (pendingWorkflow) {
      pendingWorkflowConfirmationRef.current = pendingWorkflow;

      if (isAffirmativeResponse(trimmed)) {
        setMessages(nextHistory);
        setInput("");
        await runWorkflowAction(pendingWorkflow.messageId, pendingWorkflow.suggestion);
        return;
      }

      if (isNegativeResponse(trimmed)) {
        pendingWorkflowConfirmationRef.current = null;
        setMessages([
          ...nextHistory.map((message) => (
            message.id === pendingWorkflow.messageId
              ? {
                  ...message,
                  workflowActionSuggestion: message.workflowActionSuggestion
                    ? { ...message.workflowActionSuggestion, status: "resolved" as const }
                    : undefined,
                }
              : message
          )),
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: `Okay, I won’t run ${pendingWorkflow.suggestion.workflow.title}.`,
            time: formatTime(),
          }),
        ]);
        setInput("");
        markActivity();
        inputRef.current?.focus();
        return;
      }

      if (isAmbiguousShortResponse(trimmed)) {
        setMessages([
          ...nextHistory,
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: `Do you want me to run ${pendingWorkflow.suggestion.workflow.title}, or cancel it?`,
            time: formatTime(),
          }),
        ]);
        setInput("");
        markActivity();
        inputRef.current?.focus();
        return;
      }
    }

    showProgress("conversation_context");
    try {
      const continuationReply = await runWorkflowRouter(
        trimmed,
        createActionRouterWorkflow(),
        contextWindow,
        { continuationOnly: true }
      );

      if (continuationReply.routerIntent && continuationReply.routerIntent !== "fallback") {
        setIsTyping(false);
        setMessages(nextHistory);
        setInput("");
        const assistantReply = resolveReply(continuationReply);
        setMessages((current) => [
          ...current,
          createRenderedMessage({
            ...assistantReply,
            id: assistantReply.id ?? generateMessageId(),
            role: "assistant",
            time: assistantReply.time ?? formatTime(),
          }),
        ]);
        markActivity();
        inputRef.current?.focus();
        return;
      }
    } catch {
      // Continue through normal intent routing when no paused workflow can be resumed.
    }

    if (actionModeArmed) {
      autoResetActionMode("message_sent");
      setMessages(nextHistory);
      setInput("");
      markActivity();
      showProgress("workflow_lookup");

      try {
        const workflowReply = await runWorkflowRouter(
          trimmed,
          createActionRouterWorkflow(),
          contextWindow,
          { allowDraftPlan: true, forceActionMode: true }
        );

        if (workflowReply.routerIntent === "fallback") {
          pendingActionModeFallbackRef.current = { originalText: trimmed };
          setMessages((current) => [
            ...current,
            createRenderedMessage({
              id: generateMessageId(),
              role: "assistant",
              text: "I could not find a matching action workflow. Do you want me to continue this as normal chat?",
              time: formatTime(),
            }),
          ]);
          return;
        }

        const assistantReply = resolveReply(workflowReply);
        setMessages((current) => [
          ...current,
          createRenderedMessage({
            ...assistantReply,
            id: assistantReply.id ?? generateMessageId(),
            role: "assistant",
            time: assistantReply.time ?? formatTime(),
          }),
        ]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          createRenderedMessage({
            id: generateMessageId(),
            role: "assistant",
            text: error instanceof Error ? error.message : "I could not complete that action request right now.",
            time: formatTime(),
          }),
        ]);
      } finally {
        setIsTyping(false);
        markActivity();
        inputRef.current?.focus();
      }

      return;
    }

    setProgressMessage(PROGRESS_MESSAGES.understanding);
    const intentDecision = await classifyIntentWithHybridGate(trimmed, contextWindow);

    setMessages(nextHistory);
    setInput("");
    markActivity();

    if (intentDecision.promptModeChoice) {
      setIsTyping(false);
      const contextualShortReply = isAmbiguousShortResponse(trimmed)
        && contextWindow.some((message) => message.role === "assistant");
      const modePrompt = createRenderedMessage({
        id: generateMessageId(),
        role: "assistant",
        text: contextualShortReply
          ? "Could you clarify what you’d like me to do next?"
          : "I am not fully certain. Do you want Action Mode or Chat Mode for this request?",
        time: formatTime(),
        intentModeSuggestion: contextualShortReply ? undefined : {
          originalText: trimmed,
          confidence: intentDecision.confidence,
          intentDecisionId: intentDecision.decisionId,
          suggestedIntent: intentDecision.intent,
          status: "pending",
        },
      });

      setMessages((current) => [...current, modePrompt]);
      inputRef.current?.focus();
      return;
    }

    const workflowAction = intentDecision.intent === "action"
      ? (classifyWorkflowAction(trimmed, workflowSessions) ?? {
          workflow: createActionRouterWorkflow(),
          confidence: Math.max(0.55, intentDecision.confidence),
        })
      : null;

    if (workflowAction) {
      setIsTyping(false);
      const isGenericRouterAction = workflowAction.workflow.id === ACTION_ROUTER_WORKFLOW_ID;
      const actionMessage = createRenderedMessage({
        id: generateMessageId(),
        role: "assistant",
        text: isGenericRouterAction
          ? "This looks like an actionable request. I can route it to the right workflow for you."
          : `I found a workflow that can perform this action: ${workflowAction.workflow.title}.`,
        time: formatTime(),
        workflowActionSuggestion: {
          workflow: workflowAction.workflow,
          originalText: trimmed,
          confidence: workflowAction.confidence,
          status: "pending",
          routedByClassifier: isGenericRouterAction,
          intentDecisionId: intentDecision.decisionId,
        }
      });

      pendingWorkflowConfirmationRef.current = {
        messageId: actionMessage.id,
        suggestion: actionMessage.workflowActionSuggestion!,
      };
      setMessages((current) => [...current, actionMessage]);
      inputRef.current?.focus();
      return;
    }

    if (intentDecision.intent === "chat" && shouldTryWorkflowRouterForChatIntent(trimmed)) {
      showProgress("workflow_lookup");
      try {
        const routerReply = await runWorkflowRouter(
          trimmed,
          createActionRouterWorkflow(),
          contextWindow,
          { forceActionMode: false }
        );

        if (routerReply.routerIntent && routerReply.routerIntent !== "fallback") {
          const assistantReply = resolveReply(routerReply);
          setMessages((current) => [
            ...current,
            createRenderedMessage({
              ...assistantReply,
              id: assistantReply.id ?? generateMessageId(),
              role: "assistant",
              time: assistantReply.time ?? formatTime()
            })
          ]);
          setIsTyping(false);
          markActivity();
          inputRef.current?.focus();
          return;
        }
      } catch {
        // Continue with standard chat flow when router check fails.
      } finally {
        setIsTyping(false);
      }
    }

    await completeChatResponse(trimmed, contextWindow);
  }

  async function completeChatResponse(question: string, contextWindow: ScoutChatMessage[]) {
    showProgress("knowledge_search");

    try {
      const customReply = onSendMessage
        ? await onSendMessage(question, contextWindow)
        : await sendChatQuery(question); // Always use real API, skip mock workflows
      const assistantReply = resolveReply(customReply);

      setIsTyping(false);
      setMessages((current) => [
        ...current,
        createRenderedMessage({
          ...assistantReply,
          id: assistantReply.id ?? generateMessageId(),
          role: "assistant",
          time: assistantReply.time ?? formatTime()
        })
      ]);
      markActivity();
      inputRef.current?.focus();
    } catch (error) {
      const failureMessage = error instanceof Error ? error.message : "I could not reach the assistant service. Please try again in a moment.";
      if (isApiKeyAuthFailure(401, failureMessage)) {
        blockChatbotForInvalidKey();
      }
      setMessages((current) => [
        ...current,
        createRenderedMessage({
          id: generateMessageId(),
          role: "assistant",
          text: failureMessage,
          time: formatTime()
        })
      ]);
      setIsTyping(false);
      markActivity();
    }
  }

  async function classifyIntentWithHybridGate(message: string, contextWindow: ScoutChatMessage[]): Promise<IntentGateDecision> {
    const fallbackAction = classifyWorkflowAction(message, workflowSessions);
    const fallback: IntentGateDecision = fallbackAction
      ? {
          intent: "action",
          confidence: fallbackAction.confidence,
          lowConfidence: fallbackAction.confidence < 0.66,
          promptModeChoice: false,
          reason: "client_fallback_action",
        }
      : {
          intent: "chat",
          confidence: 0.82,
          lowConfidence: false,
          promptModeChoice: false,
          reason: "client_fallback_chat",
        };

    if (!companyId || !userId) {
      return fallback;
    }

    try {
      const pendingRouterAction = pendingRouterConfirmationRef.current;
      const pendingWorkflowAction = pendingWorkflowConfirmationRef.current
        ?? findPendingWorkflowConfirmation(messages);
      const pendingAction = pendingRouterAction
        ? {
            type: "action_confirmation",
            description: `Run ${pendingRouterAction.workflow.title}`,
            workflowId: pendingRouterAction.workflow.id,
            workflowTitle: pendingRouterAction.workflow.title,
          }
        : pendingWorkflowAction
          ? {
              type: "action_confirmation",
              description: `Run ${pendingWorkflowAction.suggestion.workflow.title}`,
              workflowId: pendingWorkflowAction.suggestion.workflow.id,
              workflowTitle: pendingWorkflowAction.suggestion.workflow.title,
            }
          : null;

      const response = await fetch(intentGateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          userId,
          targetAppId: targetAppId || undefined,
          conversationId: activeConversationId.current || conversationSessionId || undefined,
          message,
          history: contextWindow.slice(-10).map((item) => ({ role: item.role, text: item.text })),
          pendingAction,
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        return fallback;
      }

      return {
        decisionId: typeof body?.decisionId === "string" ? body.decisionId : undefined,
        intent: body?.intent === "action" ? "action" : "chat",
        confidence: typeof body?.confidence === "number" ? body.confidence : fallback.confidence,
        lowConfidence: body?.lowConfidence === true,
        promptModeChoice: body?.promptModeChoice === true,
        reason: typeof body?.reason === "string" ? body.reason : undefined,
      };
    } catch {
      return fallback;
    }
  }

  async function submitIntentFeedback(input: {
    decisionId?: string;
    feedbackType:
      | "true_positive"
      | "false_positive"
      | "false_negative"
      | "true_negative"
      | "user_override_action"
      | "user_override_chat";
    userChoice: "action" | "chat" | "run_workflow" | "continue_chat";
    notes?: string;
  }) {
    if (!input.decisionId || !companyId || !userId) {
      return;
    }

    try {
      await fetch(intentGateEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionId: input.decisionId,
          companyId,
          userId,
          targetAppId: targetAppId || undefined,
          feedbackType: input.feedbackType,
          userChoice: input.userChoice,
          notes: input.notes,
        }),
      });
    } catch {
      // Intentionally ignore telemetry failures in user flow.
    }
  }

  async function chooseIntentModeAction(messageId: string, suggestion: ScoutIntentModeSuggestion) {
    const workflowAction = classifyWorkflowAction(suggestion.originalText, workflowSessions) ?? {
      workflow: createActionRouterWorkflow(),
      confidence: Math.max(0.55, suggestion.confidence),
    };

    setMessages((current) => [
      ...current.map((message) => (
        message.id === messageId
          ? {
              ...message,
              intentModeSuggestion: {
                ...suggestion,
                status: "resolved" as const,
              },
            }
          : message
      )),
      createRenderedMessage({
        id: generateMessageId(),
        role: "assistant",
        text: workflowAction.workflow.id === ACTION_ROUTER_WORKFLOW_ID
          ? "Thanks. I will treat this as Action Mode and route it to the best workflow."
          : `Thanks. I will treat this as Action Mode and use ${workflowAction.workflow.title}.`,
        time: formatTime(),
        workflowActionSuggestion: {
          workflow: workflowAction.workflow,
          originalText: suggestion.originalText,
          confidence: workflowAction.confidence,
          status: "pending",
          routedByClassifier: workflowAction.workflow.id === ACTION_ROUTER_WORKFLOW_ID,
          intentDecisionId: suggestion.intentDecisionId,
        },
      }),
    ]);

    await submitIntentFeedback({
      decisionId: suggestion.intentDecisionId,
      feedbackType: suggestion.suggestedIntent === "chat" ? "false_negative" : "true_positive",
      userChoice: "action",
    });
  }

  async function chooseIntentModeChat(messageId: string, suggestion: ScoutIntentModeSuggestion) {
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
            ...message,
            intentModeSuggestion: {
              ...suggestion,
              status: "resolved" as const,
            },
          }
        : message
    )));

    await submitIntentFeedback({
      decisionId: suggestion.intentDecisionId,
      feedbackType: suggestion.suggestedIntent === "action" ? "false_positive" : "true_negative",
      userChoice: "chat",
    });

    const nextHistory = trimMessagesForLifecycle(messages, resolvedLifecycleSettings);
    await completeChatResponse(suggestion.originalText, nextHistory);
  }

  async function continueAsChat(messageId: string, suggestion: ScoutWorkflowActionSuggestion) {
    pendingWorkflowConfirmationRef.current = null;
    await submitIntentFeedback({
      decisionId: suggestion.intentDecisionId,
      feedbackType: "false_positive",
      userChoice: "continue_chat",
    });

    const nextHistory = updateWorkflowActionSuggestion(messageId, {
      ...suggestion,
      status: "resolved" as const,
      errorMessage: undefined
    });
    await completeChatResponse(suggestion.originalText, nextHistory);
  }

  async function runWorkflowAction(messageId: string, suggestion: ScoutWorkflowActionSuggestion) {
    pendingWorkflowConfirmationRef.current = null;
    if (authBlockedMessage) {
      setMessages((current) => current.map((item) => (
        item.id === messageId
          ? {
              ...item,
              workflowActionSuggestion: {
                ...suggestion,
                status: "error" as const,
                errorMessage: authBlockedMessage,
              } as ScoutWorkflowActionSuggestion,
            }
          : item
      )));
      return;
    }

    if (suggestion.status === "running") {
      return;
    }

    await submitIntentFeedback({
      decisionId: suggestion.intentDecisionId,
      feedbackType: "true_positive",
      userChoice: "run_workflow",
    });

    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
            ...message,
            workflowActionSuggestion: {
              ...suggestion,
              status: "running",
              errorMessage: undefined
            }
          }
        : message
    )));
    showProgress("workflow_execution");
    markActivity();

    const workflowHistory = trimMessagesForLifecycle([...messages], resolvedLifecycleSettings);

    try {
      const workflowReply = onRunWorkflow
        ? await onRunWorkflow(suggestion.originalText, suggestion.workflow, workflowHistory)
        : await runWorkflowRouter(suggestion.originalText, suggestion.workflow, workflowHistory, { forceActionMode: true });

      const assistantReply = resolveReply(workflowReply);

      setMessages((current) => [
        ...current.map((message) => (
          message.id === messageId
            ? {
                ...message,
                workflowActionSuggestion: {
                  ...suggestion,
                  status: "resolved" as const,
                  errorMessage: undefined
                } as ScoutWorkflowActionSuggestion
              }
            : message
        )),
        createRenderedMessage({
          ...assistantReply,
          id: assistantReply.id ?? generateMessageId(),
          role: "assistant",
          time: assistantReply.time ?? formatTime()
        })
      ]);

      setIsTyping(false);
      markActivity();
      inputRef.current?.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "I could not start the workflow right now.";
      setMessages((current) => current.map((item) => (
        item.id === messageId
          ? {
              ...item,
              workflowActionSuggestion: {
                ...suggestion,
                status: "error" as const,
                errorMessage: message
              } as ScoutWorkflowActionSuggestion
            }
          : item
      )));
      setIsTyping(false);
      markActivity();
    }
  }

  async function startWorkflow(workflow: ScoutWorkflowSession) {
    if (authBlockedMessage) {
      setWorkflowsState({ status: "error", message: authBlockedMessage });
      return;
    }

    setActiveWorkflow(workflow);
    setActiveTab("workflows");
    const hasPreWorkflowConfirmation = Boolean(workflow.preWorkflowConfirmationEnabled && workflow.preWorkflowConfirmationHtml?.trim());

    if (!hasPreWorkflowConfirmation) {
      await delay(1300);
    }

    if (variant === "floating") {
      closeFloatingChat();
    } else {
      setOpen(false);
    }

    if (onStartWorkflow) {
      try {
        await onStartWorkflow(workflow);
      } catch (error) {
        setWorkflowsState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to start guided workflow player."
        });
      }
    } else if (targetAppId) {
      try {
        const player = await getPlayerHandle({ scoutBaseUrl, targetAppId }, playerHandleRef);
        player.play(workflow.id);
      } catch (error) {
        setWorkflowsState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to start guided workflow player."
        });
      }
    }
  }

  async function startWorkflowTopic(topic: ScoutWorkflowTopic) {
    await startWorkflow({
      id: topic.guideId,
      title: topic.title,
      description: topic.description,
      estimatedTime: topic.estimatedTime,
      steps: topic.steps
    });
  }

  async function sendChatQuery(question: string): Promise<ScoutChatMessage | undefined> {
    if (!companyId || !userId) {
      return undefined;
    }

    const requestId = progressRequestIdRef.current || createProgressRequestId();
    progressRequestIdRef.current = requestId;

    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify({
        company_id: companyId,
        user_id: userId,
        question,
        target_app_id: targetAppId || undefined,
        conversation_id: activeConversationId.current || conversationSessionId || undefined
      })
    });
    const body = await response.json().catch(() => null);

    console.log('📥 Chat API Response:', body);
    console.log('🔍 Has orchestration_trigger?:', !!body?.orchestration_trigger);
    console.log('🔍 Trigger data:', body?.orchestration_trigger);

    if (!response.ok) {
      const serverRequestId = typeof body?.requestId === "string"
        ? body.requestId
        : response.headers.get("x-request-id") || requestId;
      const message = typeof body?.message === "string" ? body.message : "Chat query failed.";
      if (isApiKeyAuthFailure(response.status, message)) {
        blockChatbotForInvalidKey();
      }
      throw new Error(`${message} (requestId: ${serverRequestId})`);
    }

    if (typeof body?.conversation_id === "string") {
      activeConversationId.current = body.conversation_id;
      setConversationSessionId(body.conversation_id);
      onConversationChange?.(body.conversation_id);
    }

    // Check for orchestration trigger (store for link click)
    // The orchestration info is included in the answer text with a clickable link
    if (body?.orchestration_trigger) {
      const trigger = body.orchestration_trigger;
      console.log('🎯 Orchestration option available:', trigger);
      console.log("Received executionId:", trigger.executionId);
      console.log('💡 User can click the orchestration link in the message to execute');
      
      if (!trigger.executionId) {
        console.error('❌ ERROR: orchestration_trigger received without executionId!');
        console.error('   Full trigger object:', trigger);
        console.error('   Full body:', body);
      }
      
      // Initialize storage Map if needed
      if (!(window as any).__orchestrationExecutions) {
        // Try to load from sessionStorage first
        try {
          const stored = sessionStorage.getItem('scout-orchestration-executions');
          (window as any).__orchestrationExecutions = stored ? JSON.parse(stored) : {};
        } catch {
          (window as any).__orchestrationExecutions = {};
        }
      }
      
      // Store by executionId (supports multiple pending orchestrations)
      const orchestrationData = {
        executionId: trigger.executionId,
        orchestrationId: trigger.orchestrationId,
        orchestrationName: trigger.orchestrationName,
        targetAppId: targetAppId || 'default-app',
        scoutBaseUrl: scoutBaseUrl || window.location.origin,
        triggerData: {
          triggerId: trigger.triggerId,
          confidence: trigger.confidence,
          matchedPhrase: body.matchedPhrase,
          matchedIntent: body.matchedIntent,
        },
        context: {},
      };
      
      (window as any).__orchestrationExecutions[trigger.executionId] = orchestrationData;
      
      // Persist to sessionStorage
      try {
        sessionStorage.setItem('scout-orchestration-executions', JSON.stringify((window as any).__orchestrationExecutions));
      } catch (e) {
        console.warn('Failed to store orchestration in sessionStorage:', e);
      }
      
      console.log('✅ Stored orchestration execution:', orchestrationData);
      console.log('🔑 Stored executionId:', trigger.executionId);
      console.log('📚 Total executions stored:', Object.keys((window as any).__orchestrationExecutions).length);
    }

    if (typeof body?.answer !== "string") {
      return undefined;
    }

    return {
      role: "assistant",
      text: body.answer,
      queryId: typeof body?.query_id === "string" ? body.query_id : undefined,
      citations: Array.isArray(body?.citations) ? body.citations : [],
      noAnswer: body?.no_answer === true,
      noAnswerReason: typeof body?.no_answer_reason === "string" ? body.no_answer_reason : undefined,
    };
  }

  async function runWorkflowRouter(
    message: string,
    workflow: ScoutWorkflowSession,
    history: ScoutChatMessage[],
    options?: { allowDraftPlan?: boolean; forceActionMode?: boolean; continuationOnly?: boolean }
  ) {
    const endpoint = workflowRouterEndpoint || "/api/chatbot/workflow-router";
    const requestId = progressRequestIdRef.current || createProgressRequestId();
    progressRequestIdRef.current = requestId;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
        ...apiKeyHeaders,
      },
      body: JSON.stringify({
        message,
        workflow,
        history,
        allowDraftPlan: options?.allowDraftPlan === true,
        forceActionMode: options?.forceActionMode === true,
        continuationOnly: options?.continuationOnly === true,
        companyId,
        userId,
        targetAppId: targetAppId || undefined,
        conversationId: activeConversationId.current || conversationSessionId || undefined
      })
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const message = typeof body?.message === "string" ? body.message : "Workflow router request failed.";
      if (isApiKeyAuthFailure(response.status, message)) {
        blockChatbotForInvalidKey();
      }
      throw new Error(message);
    }

    if (typeof body?.conversationId === "string") {
      activeConversationId.current = body.conversationId;
      setConversationSessionId(body.conversationId);
      onConversationChange?.(body.conversationId);
    }

    if (body?.metadata?.awaitingDraftPlanPermission === true) {
      pendingRouterConfirmationRef.current = {
        originalText: message,
        workflow,
      };
    } else {
      pendingRouterConfirmationRef.current = null;
    }

    if (typeof body?.answer === "string" || typeof body?.message === "string") {
      return {
        role: "assistant",
        text: typeof body?.answer === "string" ? body.answer : String(body.message),
        queryId: typeof body?.queryId === "string" ? body.queryId : undefined,
        citations: Array.isArray(body?.citations) ? body.citations : [],
        noAnswer: body?.noAnswer === true,
        noAnswerReason: typeof body?.noAnswerReason === "string" ? body.noAnswerReason : undefined,
        routerIntent: typeof body?.intent === "string" ? body.intent : undefined,
        matchedOrchestrationIds: Array.isArray(body?.matchedOrchestrationIds)
          ? body.matchedOrchestrationIds.filter((id: unknown): id is string => typeof id === "string")
          : undefined,
      } satisfies ScoutChatMessage;
    }

    return {
      role: "assistant",
      text: `I started the workflow router flow for ${workflow.title}.`,
      time: formatTime()
    } satisfies ScoutChatMessage;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      if (actionModeArmed) {
        autoResetActionMode("keyboard_toggle_off");
      } else {
        armActionMode("keyboard");
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  }

  function updateWorkflowActionSuggestion(messageId: string, suggestion: ScoutWorkflowActionSuggestion) {
    setMessages((current) => current.map((message) => (
      message.id === messageId
        ? {
            ...message,
            workflowActionSuggestion: suggestion
          }
        : message
    )));
    return trimMessagesForLifecycle(messages.map((message) => (
      message.id === messageId
        ? {
            ...message,
            workflowActionSuggestion: suggestion
          }
        : message
    )), resolvedLifecycleSettings);
  }

  function classifyWorkflowAction(message: string, workflows: ScoutWorkflowSession[]) {
    // This function runs client-side as a fallback when the server intent gate is unavailable.
    // It finds a matching workflow OR produces a generic action router result.
    // Heavy domain classification is intentionally left to the server-side LLM.
    const normalized = message.toLowerCase();
    const matchedWorkflow = findWorkflowForMessage(normalized, workflows) ?? findWorkflowByActionKeywords(normalized, workflows);

    if (matchedWorkflow) {
      return { workflow: matchedWorkflow, confidence: 0.85 };
    }

    // Generic signals only — no domain-specific keyword lists.
    const hasActionVerb = /\b(create|add|update|change|edit|submit|approve|reject|start|run|launch|assign|cancel|schedule|trigger|process|send|notify|email|message|forward|reply|draft|book|register|delete|remove|archive|publish|generate)\b/i.test(normalized);
    const asksQuestion = /^(what|how|why|where|when|who|tell me|explain|describe)\b/i.test(normalized);
    const hasSpecificTarget = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/.test(normalized)
      || /\b\w[\s#\-]?\d{4,}\b/.test(normalized);

    if (asksQuestion && !hasActionVerb) return null;
    if (!hasActionVerb && !hasSpecificTarget) return null;

    const confidence = Math.min(0.99, 0.55 + (hasSpecificTarget ? 0.25 : 0) + (hasActionVerb ? 0.15 : 0));
    return { workflow: createActionRouterWorkflow(), confidence };
  }

  const launcher = (
    <button
      aria-label={launcherLabel}
      className="group flex h-14 w-14 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white shadow-chat-panel transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
      onClick={variant === "floating" ? openFloatingChat : () => setOpen(true)}
      style={cssVars}
      type="button"
    >
      <MessageCircle className="h-6 w-6 transition group-hover:scale-105" />
    </button>
  );

  if (!isOpen && !isMinimizing) {
    const launcherPosition = hasMounted ? getBottomRightChatPosition(launcherSize) : initialChatPosition;

    return variant === "floating" ? (
      <div
        className="fixed z-50"
        style={{
          left: launcherPosition.left,
          top: launcherPosition.top,
          width: launcherSize.width,
          height: launcherSize.height
        }}
      >
        {launcher}
      </div>
    ) : (
      launcher
    );
  }

  const floatingSize = isMinimizing ? launcherSize : panelSize;
  const floatingPosition = hasMounted ? clampChatPosition(panelPosition, floatingSize) : panelPosition;

  const panel = (
    <section
      aria-label={`${assistantName} chat widget`}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-[var(--scout-surface)] shadow-chat-panel ring-1 ring-slate-950/5 animate-slide-up transition duration-200 ease-out",
        isMinimizing && "scale-75 opacity-0",
        variant === "inline" ? "max-w-[440px] min-h-[680px]" : "h-full min-h-0 max-w-none",
        className
      )}
      style={cssVars}
    >
      <header
        className={cn(
          "border-b border-slate-100 bg-[var(--scout-brand)] px-4 py-2 text-white",
          (variant === "floating" || variant === "embedded") && "cursor-move touch-none"
        )}
        onPointerDown={handleHeaderPointerDown}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex h-7 min-w-0 flex-1 items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/15">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              <span className="h-1.5 w-6 rounded-full bg-white/30" />
              <span className="h-1.5 w-3 rounded-full bg-emerald-300" />
            </div>
          </div>

          <div className="flex items-center gap-1">
            <IconButton label="Conversation history" onClick={() => { setOrchestrationPanelOpen(false); setHistoryOpen((current) => !current); }}>
              <History className="h-4 w-4" />
            </IconButton>
            <IconButton label="Start new conversation" onClick={() => setConfirmResetOpen(true)}>
              <RefreshCcw className="h-4 w-4" />
            </IconButton>
            {showHeaderActions && (variant === "floating" || variant === "embedded") && (
              <IconButton label="Restore size and position" onClick={restoreFloatingLayout}>
                <Undo2 className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton label="Close chat" onClick={variant === "floating" ? closeFloatingChat : () => setOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </header>

      <>
          {historyOpen ? (
            <aside className="absolute inset-x-0 bottom-0 top-11 z-20 flex min-h-0 w-full flex-col overflow-hidden bg-white shadow-[0_-1px_0_rgba(15,23,42,0.08)]">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">Conversation history</p>
                  <p className="truncate text-xs text-slate-500">Find, resume, archive, or remove a conversation.</p>
                </div>
                <button aria-label="Close conversation history" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-sky-100" onClick={() => setHistoryOpen(false)} title="Close history" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                <div className="mb-3">
                  <input
                    aria-label="Search conversations"
                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                    onChange={(event) => setHistorySearchDraft(event.target.value)}
                    placeholder="Search conversations"
                    value={historySearchDraft}
                  />
                </div>
                {historyActionState.message ? (
                  <p className={cn(
                    "mb-4 rounded-xl border px-3 py-2 text-sm",
                    historyActionState.type === "error"
                      ? "border-red-100 bg-red-50 text-red-700"
                      : historyActionState.type === "success"
                      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-600"
                  )}>
                    {historyActionState.message}
                  </p>
                ) : null}
                {selectedConversationIds.size > 0 ? (
                  <div className="mb-3 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{selectedConversationIds.size} selected</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <HistoryActionButton label="Clear selection" onClick={clearConversationSelection}>
                        <X className="h-4 w-4" />
                      </HistoryActionButton>
                      <button
                        aria-label="Archive selected conversations"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={historyActionState.type === "archiving" || historyActionState.type === "deleting" || historyActionState.type === "restoring"}
                        onClick={() => void bulkUpdateConversationStatus(historyState.active, "archived")}
                        title="Archive selected"
                        type="button"
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Restore selected conversations"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-white hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-sky-100 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={historyActionState.type === "archiving" || historyActionState.type === "deleting" || historyActionState.type === "restoring"}
                        onClick={() => void bulkUpdateConversationStatus(historyState.archived, "active")}
                        title="Restore selected"
                        type="button"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                      <button
                        aria-label="Delete selected conversations"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-red-600 transition hover:bg-red-50 hover:text-red-700 focus:outline-none focus:ring-4 focus:ring-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={historyActionState.type === "archiving" || historyActionState.type === "deleting" || historyActionState.type === "restoring"}
                        onClick={() => setHistoryDeleteTarget({
                          id: "__bulk__",
                          title: `${selectedConversationIds.size} selected conversations`,
                          status: "active",
                          message_count: 0,
                          last_message_at: null,
                          created_at: new Date().toISOString()
                        })}
                        title="Delete selected"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : null}
                {historyState.loading ? <p className="text-sm text-slate-500">Loading conversations...</p> : null}
                {historyState.error ? <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{historyState.error}</p> : null}
                {!historyState.loading && !historyState.error ? (
                  <div className="space-y-5">
                    <ConversationHistorySection
                      actionState={historyActionState}
                      currentPage={historyState.activePage}
                      emptyMessage="No active saved conversations yet."
                      items={historyState.active}
                      onArchive={(id) => void updateConversationStatus(id, "archived")}
                      onDelete={(item) => setHistoryDeleteTarget(item)}
                      onNextPage={historyState.activePage < historyState.activePageCount ? () => void loadConversationHistory({ activePage: historyState.activePage + 1 }) : undefined}
                      onPreviousPage={historyState.activePage > 1 ? () => void loadConversationHistory({ activePage: historyState.activePage - 1 }) : undefined}
                      onRename={(item) => {
                        setHistoryRenameTarget(item);
                        setHistoryRenameValue(item.title);
                      }}
                      onResume={(id) => void resumeConversation(id)}
                      onSelectAll={(checked) => setSectionSelection(historyState.active, checked)}
                      onToggleSelection={(id) => toggleConversationSelection(id)}
                      pageCount={historyState.activePageCount}
                      sectionStatus="active"
                      selectedConversationIds={selectedConversationIds}
                      title="Active"
                      currentConversationId={conversationSessionId}
                    />
                    <ConversationHistorySection
                      actionLabel="Restore"
                      actionState={historyActionState}
                      currentPage={historyState.archivedPage}
                      emptyMessage="No archived conversations."
                      items={historyState.archived}
                      onArchive={(id) => void updateConversationStatus(id, "active")}
                      onDelete={(item) => setHistoryDeleteTarget(item)}
                      onNextPage={historyState.archivedPage < historyState.archivedPageCount ? () => void loadConversationHistory({ archivedPage: historyState.archivedPage + 1 }) : undefined}
                      onPreviousPage={historyState.archivedPage > 1 ? () => void loadConversationHistory({ archivedPage: historyState.archivedPage - 1 }) : undefined}
                      onRename={(item) => {
                        setHistoryRenameTarget(item);
                        setHistoryRenameValue(item.title);
                      }}
                      onResume={(id) => void resumeConversation(id)}
                      onSelectAll={(checked) => setSectionSelection(historyState.archived, checked)}
                      onToggleSelection={(id) => toggleConversationSelection(id)}
                      pageCount={historyState.archivedPageCount}
                      sectionStatus="archived"
                      selectedConversationIds={selectedConversationIds}
                      title="Archived"
                      currentConversationId={conversationSessionId}
                    />
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}

          {activeTab === "workflows" && orchestrationPanelOpen ? (
            <aside className="absolute inset-x-0 bottom-0 top-[88px] z-20 flex min-h-0 w-full flex-col overflow-hidden bg-white shadow-[0_-1px_0_rgba(15,23,42,0.08)]">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100">
                    <Network className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">Orchestrations</p>
                    <p className="truncate text-xs text-slate-500">Published for {targetAppName || "this application"}</p>
                  </div>
                </div>
                <button aria-label="Close orchestrations" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-violet-100" onClick={() => setOrchestrationPanelOpen(false)} title="Close orchestrations" type="button">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
                {authBlockedMessage ? (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {authBlockedMessage}
                  </div>
                ) : null}

                {orchestrationsState.status === "loading" ? (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">Loading orchestrations...</p>
                ) : orchestrationsState.message ? (
                  <p className={cn(
                    "rounded-xl border px-3 py-3 text-sm",
                    orchestrationsState.status === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-slate-100 bg-slate-50 text-slate-500"
                  )}>{orchestrationsState.message}</p>
                ) : (
                  <div className="space-y-2">
                    {orchestrations.map((orchestration) => {
                      const expanded = expandedOrchestrations.has(orchestration.id);
                      return (
                        <section className="overflow-visible rounded-xl border border-slate-200 bg-white" key={orchestration.id}>
                          <button
                            aria-expanded={expanded}
                            className="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-violet-100"
                            onClick={() => setExpandedOrchestrations((current) => toggleSetValue(current, orchestration.id))}
                            type="button"
                          >
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-slate-900">{orchestration.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-slate-500">{orchestration.description || `${orchestration.nodes.length} nodes`}</span>
                            </span>
                            <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500">
                              {orchestration.nodes.length}
                              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </span>
                          </button>
                          {expanded ? (
                            <div className="space-y-1 border-t border-slate-100 bg-slate-50/70 p-2">
                              {orchestration.nodes.length > 0 ? orchestration.nodes.map((node, index) => (
                                <div className="group relative flex min-h-10 items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-200" key={node.id} tabIndex={0}>
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[11px] font-bold text-violet-700">{index + 1}</span>
                                  <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{node.label}</span>
                                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">{formatNodeType(node.nodeType)}</span>
                                  <span className="pointer-events-none absolute left-3 right-3 top-[calc(100%+6px)] z-30 invisible rounded-xl bg-slate-950 px-3 py-2.5 text-xs font-normal leading-5 text-white opacity-0 shadow-xl transition group-hover:visible group-hover:opacity-100 group-focus:visible group-focus:opacity-100 whitespace-normal break-words">
                                    {node.description || `${node.label} (${formatNodeType(node.nodeType)})`}
                                  </span>
                                </div>
                              )) : (
                                <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500">No nodes are configured.</p>
                              )}
                            </div>
                          ) : null}
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          ) : null}

          <div className="grid grid-cols-2 border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500">
            <button
              aria-selected={activeTab === "qa"}
              className={cn(
                "h-11 border-b-2 transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                activeTab === "qa" ? "border-[var(--scout-brand)] bg-white text-slate-950" : "border-transparent hover:bg-white/70 hover:text-slate-800"
              )}
              onClick={() => { setOrchestrationPanelOpen(false); setActiveTab("qa"); }}
              role="tab"
              type="button"
            >
              Q&A
            </button>
            <button
              aria-selected={activeTab === "workflows"}
              className={cn(
                "h-11 border-b-2 transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                activeTab === "workflows" ? "border-[var(--scout-brand)] bg-white text-slate-950" : "border-transparent hover:bg-white/70 hover:text-slate-800"
              )}
              onClick={() => setActiveTab("workflows")}
              role="tab"
              type="button"
            >
              Guided workflows
            </button>
          </div>

          {activeTab === "qa" ? (
            <>
              <div ref={messagesViewportRef} className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-white px-5 py-5">
                {authBlockedMessage ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {authBlockedMessage}
                  </div>
                ) : null}

                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    onChooseIntentModeAction={chooseIntentModeAction}
                    onChooseIntentModeChat={chooseIntentModeChat}
                    onContinueAsChat={continueAsChat}
                    onRunWorkflowAction={runWorkflowAction}
                    onStartWorkflow={startWorkflow}
                    userLabel={userLabel}
                    companyId={companyId}
                    userId={userId}
                    scoutBaseUrl={scoutBaseUrl}
                  />
                ))}

                {isTyping && <TypingIndicator message={progressMessage} />}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <form
                  className={cn(
                    "rounded-[22px] border bg-white p-2 shadow-sm focus-within:ring-4 focus-within:ring-[var(--scout-focus)]",
                    actionModeArmed
                      ? "border-amber-300 focus-within:border-amber-400"
                      : "border-slate-200 focus-within:border-sky-300"
                  )}
                  onSubmit={handleSubmit}
                >
                  <textarea
                    ref={inputRef}
                    aria-label={`Message ${assistantName}`}
                    className="h-11 max-h-11 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400"
                    disabled={Boolean(authBlockedMessage)}
                    onChange={(event) => {
                      setInput(event.target.value);
                      markActivity();
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={1}
                    value={input}
                  />
                  <div className="flex items-center justify-end gap-3 px-1 pb-0.5">
                    <button
                      aria-label={actionModeArmed ? "Turn off action mode" : "Arm action mode for next message"}
                      className={cn(
                        "inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                        actionModeArmed
                          ? "border-amber-300 bg-amber-50 text-amber-800"
                          : "border-slate-200 bg-white text-slate-600 hover:border-amber-200 hover:text-amber-700"
                      )}
                      disabled={Boolean(authBlockedMessage) || isTyping}
                      onClick={() => {
                        if (actionModeArmed) {
                          autoResetActionMode("button_toggle_off");
                        } else {
                          armActionMode("button");
                        }
                      }}
                      title="Action mode (next message only) - Alt+A"
                      type="button"
                    >
                      <Zap className="h-4 w-4" />
                      {actionModeArmed ? "Action on" : "Action"}
                    </button>
                    <button
                      aria-label="Send message"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:translate-y-0"
                      disabled={!input.trim() || isTyping || Boolean(authBlockedMessage)}
                      type="submit"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <div className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-4 py-4">
              <div className="flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">Guided workflows</p>
                  <p className="truncate text-xs text-slate-500">Scoped to {targetAppName || "the selected application"}</p>
                </div>
                <button
                  aria-label="View orchestrations"
                  className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100 transition hover:bg-violet-100 focus:outline-none focus:ring-4 focus:ring-violet-100"
                  disabled={Boolean(authBlockedMessage)}
                  onClick={() => { setHistoryOpen(false); setOrchestrationPanelOpen(true); }}
                  title="View orchestrations"
                  type="button"
                >
                  <Network className="h-4 w-4" />
                  {orchestrations.length > 0 ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-700 px-1 text-[9px] font-bold text-white">{Math.min(orchestrations.length, 99)}</span> : null}
                </button>
              </div>
              {activeWorkflow && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Player started</p>
                      <p className="mt-1 text-emerald-800">{activeWorkflow.title} is ready to guide the user.</p>
                    </div>
                    <button
                      className="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800"
                      onClick={() => setActiveWorkflow(null)}
                      type="button"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {authBlockedMessage ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {authBlockedMessage}
                </div>
              ) : null}

              {workflowsState.status === "loading" ? (
                <p className="rounded-lg bg-white px-3 py-2 text-sm text-slate-500">Loading workflows...</p>
              ) : workflowsState.message ? (
                <p className={cn(
                  "rounded-lg border px-3 py-2 text-sm",
                  workflowsState.status === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-500"
                )}>
                  {workflowsState.message}
                </p>
              ) : null}

              <div className="grid gap-2">
                {workflowSessions.map((session) => {
                  const isExpanded = expandedWorkflowSessions.has(session.id);
                  const topics = session.topics ?? [];

                  return (
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white" key={session.id}>
                      <button
                        className="flex min-h-11 w-full items-center justify-between gap-3 px-3 text-left text-sm font-semibold text-slate-950 transition hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                        onClick={() => toggleWorkflowSession(session.id)}
                        type="button"
                      >
                        <span className="min-w-0 truncate">{session.title}</span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500">
                          {topics.length} topics
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/70 p-2">
                          {topics.length > 0 ? (
                            <div className="grid gap-1.5">
                              {topics.map((topic, index) => (
                                <button
                                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-white px-3 text-left text-sm shadow-sm transition hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                                  key={topic.id}
                                  onClick={() => startWorkflowTopic(topic)}
                                  type="button"
                                >
                                  <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-50 text-[10px] font-bold text-violet-700">{index + 1}</span>
                                    <span className="min-w-0 truncate font-medium text-slate-800">{topic.title}</span>
                                  </div>
                                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                    <Play className="h-3 w-3 fill-current" />
                                    {topic.steps} steps
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <button
                              className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-white px-3 text-left text-sm shadow-sm transition hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                              onClick={() => startWorkflow(session)}
                              type="button"
                            >
                              <span className="min-w-0 truncate font-medium text-slate-800">{session.title}</span>
                              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                                <Play className="h-3 w-3 fill-current" />
                                {session.steps} steps
                              </span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(variant === "floating" || variant === "embedded") && (
            <button
              aria-label="Resize chat"
              className={cn(
                "absolute bottom-2.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-950/5 text-slate-500 transition hover:bg-slate-950/10 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                variant === "embedded" ? "right-2.5 cursor-nwse-resize" : "right-2.5 cursor-nwse-resize max-[520px]:hidden"
              )}
              onPointerDown={handleResizePointerDown}
              title="Resize chat"
              type="button"
            >
              <Grip className="h-4 w-4" />
            </button>
          )}
        </>

        {confirmResetOpen ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-950">Start new conversation?</h3>
              <p className="mt-2 text-sm text-slate-600">This clears the current visible chat, active context window, cached orchestration state, and starts with a fresh conversation id.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setConfirmResetOpen(false)} type="button">
                  Cancel
                </button>
                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white" onClick={() => { setConfirmResetOpen(false); resetConversationState({ preserveOpenState: true }); }} type="button">
                  Start new
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {historyRenameTarget ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-950">Rename conversation</h3>
              <input
                aria-label="Conversation title"
                className="mt-4 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
                onChange={(event) => setHistoryRenameValue(event.target.value)}
                value={historyRenameValue}
              />
              <div className="mt-6 flex justify-end gap-3">
                <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => { setHistoryRenameTarget(null); setHistoryRenameValue(""); }} type="button">
                  Cancel
                </button>
                <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={historyActionState.type === "renaming"} onClick={() => void renameConversation()} type="button">
                  {historyActionState.type === "renaming" ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {historyDeleteTarget ? (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 px-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-slate-950">Delete conversation?</h3>
              <p className="mt-2 text-sm text-slate-600">This removes the conversation from history and it cannot be resumed later.</p>
              <div className="mt-6 flex justify-end gap-3">
                <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700" onClick={() => setHistoryDeleteTarget(null)} type="button">
                  Cancel
                </button>
                <button className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={historyActionState.type === "deleting"} onClick={() => void deleteConversation()} type="button">
                  {historyActionState.type === "deleting" ? "Deleting..." : "Delete"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
    </section>
  );

  return variant === "floating" ? (
    <div
      className="fixed z-50"
        style={{
          left: floatingPosition.left,
          top: floatingPosition.top,
          width: floatingSize.width,
          height: floatingSize.height,
          transition: "left 220ms ease, top 220ms ease, width 220ms ease, height 220ms ease"
        }}
    >
      {panel}
    </div>
  ) : (
    panel
  );
}

/**
 * Parse markdown text and convert links to clickable elements
 * Supports: [text](url) and **bold** formatting
 */
function parseMarkdownText(text: string): ReactNode {
  // Match markdown links: [text](url)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  // Match bold text: **text**
  const boldRegex = /\*\*([^*]+)\*\*/g;
  
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  
  // First pass: find all markdown patterns
  const patterns: Array<{ start: number; end: number; type: 'link' | 'bold'; data: any }> = [];
  
  // Find links
  while ((match = linkRegex.exec(text)) !== null) {
    patterns.push({
      start: match.index,
      end: match.index + match[0].length,
      type: 'link',
      data: { text: match[1], url: match[2] }
    });
  }
  
  // Find bold text
  linkRegex.lastIndex = 0;
  while ((match = boldRegex.exec(text)) !== null) {
    // Only add if not inside a link
    const insideLink = patterns.some(p => p.type === 'link' && match!.index >= p.start && match!.index < p.end);
    if (!insideLink) {
      patterns.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'bold',
        data: { text: match[1] }
      });
    }
  }
  
  // Sort patterns by start position
  patterns.sort((a, b) => a.start - b.start);
  
  // Build React nodes
  patterns.forEach((pattern, idx) => {
    // Add text before this pattern
    if (pattern.start > lastIndex) {
      parts.push(text.substring(lastIndex, pattern.start));
    }
    
    // Add the pattern element
    if (pattern.type === 'link') {
      parts.push(
        <a
          key={`link-${idx}`}
          href={pattern.data.url}
          className="text-blue-600 hover:text-blue-800 underline cursor-pointer font-medium"
          onClick={(e) => {
            console.log('🔗 Link clicked:', pattern.data.url);
            
            // If it's an orchestration link, handle it directly
            if (pattern.data.url.startsWith('#orchestration:')) {
              e.preventDefault();
              const executionId = pattern.data.url.replace('#orchestration:', '');
              
              console.log('🎯 Orchestration link clicked, executionId:', executionId);
              
              // Load from sessionStorage if not in memory
              let executions = (window as any).__orchestrationExecutions;
              if (!executions || Object.keys(executions).length === 0) {
                try {
                  const stored = sessionStorage.getItem('scout-orchestration-executions');
                  executions = stored ? JSON.parse(stored) : {};
                  (window as any).__orchestrationExecutions = executions;
                  console.log('📦 Loaded orchestrations from sessionStorage:', Object.keys(executions));
                } catch {
                  executions = {};
                }
              }
              
              const orchestrationData = executions[executionId];
              
              console.log('📦 Looking up orchestration for executionId:', executionId);
              console.log('📚 Available executions:', Object.keys(executions));
              console.log('📦 Found orchestration:', orchestrationData);
              
              if (orchestrationData) {
                console.log('🚀 Starting orchestration execution...');
                
                // Dispatch minimize event for the component to handle
                const minimizeEvent = new CustomEvent('SCOUT_MINIMIZE_CHATBOT', {
                  bubbles: true,
                  cancelable: false,
                });
                window.dispatchEvent(minimizeEvent);
                
                // Method 1: If in iframe, send postMessage to parent
                if (window.parent && window.parent !== window) {
                  console.log('📤 Method 1: Posting message to parent window (iframe mode)');
                  window.parent.postMessage({
                    type: 'SCOUT_START_EXECUTION',
                    payload: orchestrationData,
                  }, '*');
                } 
                // Method 2: If same window, dispatch custom event
                else {
                  console.log('📤 Method 2: Dispatching custom event (same window mode)');
                  const customEvent = new CustomEvent('SCOUT_START_EXECUTION', {
                    detail: orchestrationData,
                    bubbles: true,
                    cancelable: false,
                  });
                  window.dispatchEvent(customEvent);
                }
                
                // Optional: Clean up after use (or keep for re-clicks)
                // delete executions[executionId];
              } else {
                console.error('❌ No orchestration found for executionId:', executionId);
                console.error('   Available execution IDs:', Object.keys(executions));
              }
              
              return;
            }
            
            // For external links, open in new tab
            if (pattern.data.url.startsWith('http')) {
              e.preventDefault();
              window.open(pattern.data.url, '_blank', 'noopener,noreferrer');
            }
          }}
        >
          {pattern.data.text}
        </a>
      );
    } else if (pattern.type === 'bold') {
      parts.push(
        <strong key={`bold-${idx}`} className="font-semibold">
          {pattern.data.text}
        </strong>
      );
    }
    
    lastIndex = pattern.end;
  });
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

function getCitationLink(citation: ScoutChatCitation, scoutBaseUrl?: string) {
  if (citation.source_url) {
    try {
      const url = new URL(citation.source_url);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return { href: url.toString(), external: true };
      }
    } catch {
      // Fall back to the managed Scout document when the source URL is malformed.
    }
  }

  if (citation.download_available && citation.document_id) {
    try {
      const origin = scoutBaseUrl || (typeof window !== "undefined" ? window.location.origin : "");
      const url = new URL(`/api/admin/documents/${encodeURIComponent(citation.document_id)}/download`, origin);
      return { href: url.toString(), external: false };
    } catch {
      return null;
    }
  }

  return null;
}

function MessageBubble({
  message,
  onChooseIntentModeAction,
  onChooseIntentModeChat,
  onContinueAsChat,
  onRunWorkflowAction,
  onStartWorkflow,
  userLabel,
  companyId,
  userId,
  scoutBaseUrl,
}: {
  message: RenderedMessage;
  onChooseIntentModeAction: (messageId: string, suggestion: ScoutIntentModeSuggestion) => void;
  onChooseIntentModeChat: (messageId: string, suggestion: ScoutIntentModeSuggestion) => void;
  onContinueAsChat: (messageId: string, suggestion: ScoutWorkflowActionSuggestion) => void;
  onRunWorkflowAction: (messageId: string, suggestion: ScoutWorkflowActionSuggestion) => void;
  onStartWorkflow: (workflow: ScoutWorkflowSession) => void;
  userLabel: string;
  companyId?: string;
  userId?: string;
  scoutBaseUrl?: string;
}) {
  const isAssistant = message.role === "assistant";
  const [citationsOpen, setCitationsOpen] = useState(false);
  const [feedbackState, setFeedbackState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [selectedFeedback, setSelectedFeedback] = useState<"up" | "down" | undefined>(message.feedback);

  async function submitFeedback(feedback: "up" | "down") {
    if (!message.queryId || !companyId || !userId || feedbackState === "saving") {
      return;
    }

    setFeedbackState("saving");
    try {
      const response = await fetch("/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          user_id: userId,
          query_id: message.queryId,
          feedback,
        }),
      });

      if (!response.ok) {
        throw new Error("Unable to save feedback");
      }

      setSelectedFeedback(feedback);
      setFeedbackState("saved");
    } catch {
      setFeedbackState("error");
    }
  }

  return (
    <div className={cn("flex gap-3", isAssistant ? "justify-start" : "justify-end")}>
      {isAssistant && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white">
          <Bot className="h-4 w-4" />
        </div>
      )}

      <div className={cn("max-w-[78%]", isAssistant ? "items-start" : "items-end")}>
        <div
          aria-label={isAssistant ? "Assistant message" : `${userLabel} message`}
          className={cn(
            "rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm",
            isAssistant
              ? "rounded-tl-md border border-slate-100 bg-slate-50 text-slate-800"
              : "rounded-tr-md bg-[var(--scout-brand)] text-white"
          )}
        >
          {parseMarkdownText(message.text)}

          {isAssistant && message.noAnswer && (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              No-answer: I could not confidently find this in the available documents.
            </div>
          )}

          {isAssistant && message.citations && message.citations.length > 0 && (
            <div className="mt-2 rounded-md border border-slate-200 bg-white">
              <button
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setCitationsOpen((current) => !current)}
                type="button"
              >
                <span>Sources ({message.citations.length})</span>
                {citationsOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>

              {citationsOpen && (
                <div className="space-y-1 border-t border-slate-200 px-2 py-2 text-xs text-slate-700">
                  {message.citations.map((citation) => {
                    const sourceLink = getCitationLink(citation, scoutBaseUrl);
                    return (
                      <div key={citation.chunk_id} className="rounded border border-slate-100 bg-slate-50 p-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-slate-800">
                          {citation.document_name} - p.{citation.page_number}
                        </div>
                        {citation.citation_type === "visual" ? (
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                            Visual{citation.visual_asset_type ? `: ${citation.visual_asset_type.replaceAll("_", " ")}` : ""}
                          </span>
                        ) : null}
                      </div>
                      {citation.section_title ? <div className="text-slate-600">{citation.section_title}</div> : null}
                      <div className="mt-0.5 text-slate-600">{citation.preview}</div>
                      {sourceLink ? (
                        <a
                          className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-sky-200 bg-white px-2 py-1 font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-50 focus:outline-none focus:ring-2 focus:ring-sky-200"
                          href={sourceLink.href}
                          rel="noopener noreferrer"
                          target="_blank"
                          title={sourceLink.external ? sourceLink.href : `Open ${citation.document_name}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                          {sourceLink.external ? "Open original source" : "Open document"}
                        </a>
                      ) : (
                        <div className="mt-1.5 text-[11px] text-slate-500">No source link is available for this document.</div>
                      )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {isAssistant && message.queryId && companyId && userId && (
            <div className="mt-2 flex items-center gap-1.5 text-slate-500">
              <button
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border",
                  selectedFeedback === "up" ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white"
                )}
                onClick={() => submitFeedback("up")}
                type="button"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
                Helpful
              </button>
              <button
                className={cn(
                  "inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] border",
                  selectedFeedback === "down" ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 bg-white"
                )}
                onClick={() => submitFeedback("down")}
                type="button"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
                Not helpful
              </button>
              {feedbackState === "saving" ? <span className="text-[11px]">Saving...</span> : null}
              {feedbackState === "saved" ? <span className="text-[11px] text-emerald-700">Saved</span> : null}
              {feedbackState === "error" ? <span className="text-[11px] text-rose-700">Failed</span> : null}
            </div>
          )}
        </div>
        {message.workflowSuggestion && (
          <div className="mt-2">
            <WorkflowCard compact onStart={onStartWorkflow} workflow={message.workflowSuggestion} />
          </div>
        )}
        {isAssistant && message.workflowActionSuggestion && message.workflowActionSuggestion.status !== "resolved" && (
          <div className="mt-2 rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-slate-900 shadow-sm">
            <div className="flex items-center gap-2">
              <Zap className="h-3.5 w-3.5 text-sky-700" />
              <p className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-900">
                {message.workflowActionSuggestion.routedByClassifier
                  ? "Action workflow available"
                  : "Workflow suggestion available"}
              </p>
              <span className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                {message.workflowActionSuggestion.routedByClassifier
                  ? "Action"
                  : message.workflowActionSuggestion.workflow.title}
              </span>
            </div>
            {message.workflowActionSuggestion.status === "error" && message.workflowActionSuggestion.errorMessage ? (
              <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700">
                {message.workflowActionSuggestion.errorMessage}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                  message.workflowActionSuggestion.status === "running"
                    ? "cursor-wait border border-slate-200 bg-slate-100 text-slate-400"
                    : "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                )}
                disabled={message.workflowActionSuggestion.status === "running"}
                onClick={() => onRunWorkflowAction(message.id, message.workflowActionSuggestion!)}
                type="button"
              >
                <Zap className="h-3.5 w-3.5" />
                Run
              </button>
              <button
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                onClick={() => onContinueAsChat(message.id, message.workflowActionSuggestion!)}
                type="button"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Chat
              </button>
            </div>
          </div>
        )}
        {isAssistant && message.intentModeSuggestion && message.intentModeSuggestion.status !== "resolved" && (
          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50/80 p-2.5 text-slate-900 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm">
                <Network className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold text-slate-950">Choose mode for this request</p>
                  <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                    Low confidence
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-950 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                    onClick={() => onChooseIntentModeAction(message.id, message.intentModeSuggestion!)}
                    type="button"
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Action
                  </button>
                  <button
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-sky-200 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                    onClick={() => onChooseIntentModeChat(message.id, message.intentModeSuggestion!)}
                    type="button"
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    Chat
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div className={cn("mt-1 flex items-center gap-1.5 text-[11px] text-slate-400", isAssistant ? "justify-start" : "justify-end")}>
          {!isAssistant && <Check className="h-3 w-3" />}
          {message.time}
        </div>
      </div>

      {!isAssistant && (
        <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <UserRound className="h-4 w-4" />
        </div>
      )}
    </div>
  );
}

function WorkflowCard({
  compact,
  onStart,
  workflow
}: {
  compact?: boolean;
  onStart: (workflow: ScoutWorkflowSession) => void;
  workflow: ScoutWorkflowSession;
}) {
  return (
    <button
      className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm shadow-sm transition hover:border-sky-200 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
      onClick={() => onStart(workflow)}
      type="button"
    >
      <span className="min-w-0 truncate font-semibold text-slate-950">
        {compact ? "Follow this workflow - " : ""}{workflow.title}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
        <Play className="h-3 w-3 fill-current" />
        {workflow.steps} steps
      </span>
    </button>
  );
}

function TypingIndicator({ message }: { message: string }) {
  return (
    <div className="flex gap-3" role="status" aria-live="polite">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex min-h-11 items-center gap-3 rounded-2xl rounded-tl-md border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-25" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-sky-500/80" />
        </span>
        <span className="text-sm text-slate-600 transition-opacity duration-300">{message}</span>
      </div>
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-full text-slate-300 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-4 focus:ring-white/20"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function normalizeMessages(messages: ScoutChatMessage[]): RenderedMessage[] {
  return messages.map((message, index) => {
    // Regenerate ID if it's in old counter format (local-{number}) to avoid collisions
    const needsNewId = !message.id || /^local-\d+$/.test(message.id) || /^initial-\d+$/.test(message.id);
    
    return createRenderedMessage({
      ...message,
      id: needsNewId ? `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${index}` : message.id!,
      time: message.time ?? "09:41"
    });
  });
}

function createRenderedMessage(message: ScoutChatMessage & { id: string; time: string }): RenderedMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    time: message.time,
    queryId: message.queryId,
    citations: message.citations,
    noAnswer: message.noAnswer,
    noAnswerReason: message.noAnswerReason,
    feedback: message.feedback,
    workflowSuggestion: message.workflowSuggestion,
    workflowActionSuggestion: message.workflowActionSuggestion,
    intentModeSuggestion: message.intentModeSuggestion
  };
}

function formatTimeFromDate(value?: string) {
  if (!value) {
    return formatTime();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return formatTime();
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getMessageStorageKey({
  companyId,
  conversationId,
  userId,
  variant
}: {
  companyId?: string;
  conversationId?: string;
  userId?: string;
  variant: ScoutChatbotProps["variant"];
}) {
  return [
    "scout-chatbot",
    "messages",
    companyId || "company",
    userId || "user",
    conversationId || variant || "default"
  ].join(":");
}

function clearStoredMessages(key: string) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function clearOrchestrationState() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.removeItem("scout-orchestration-executions");
  } catch {
    // Ignore storage failures.
  }

  if ((window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions) {
    delete (window as Window & typeof globalThis & { __orchestrationExecutions?: Record<string, unknown> }).__orchestrationExecutions;
  }
}

function estimateTextTokens(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact ? Math.max(1, Math.ceil(compact.length / 4)) : 0;
}

function mergeLifecycleSettings(base: ChatbotLifecycleSettings, override?: ScoutChatLifecycleConfig) {
  return {
    maxContextMessages: Math.min(30, Math.max(10, Number(override?.maxContextMessages ?? base.maxContextMessages) || base.maxContextMessages)),
    maxContextTokens: Math.min(8000, Math.max(3000, Number(override?.maxContextTokens ?? base.maxContextTokens) || base.maxContextTokens)),
    inactivityTimeoutSeconds: Math.min(604800, Math.max(60, Number(override?.inactivityTimeoutSeconds ?? base.inactivityTimeoutSeconds) || base.inactivityTimeoutSeconds)),
    resetOnLogoutEvent: override?.resetOnLogoutEvent ?? base.resetOnLogoutEvent,
    resetOnUserChange: override?.resetOnUserChange ?? base.resetOnUserChange,
    resetOnTargetAppChange: override?.resetOnTargetAppChange ?? base.resetOnTargetAppChange
  } satisfies ChatbotLifecycleSettings;
}

function trimMessagesForLifecycle(messages: RenderedMessage[], settings: ChatbotLifecycleSettings): ScoutChatMessage[] {
  const recent = messages.slice(-Math.max(1, settings.maxContextMessages));
  const selected: RenderedMessage[] = [];
  let totalTokens = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const tokens = estimateTextTokens(message.text);
    if (selected.length > 0 && totalTokens + tokens > settings.maxContextTokens) {
      continue;
    }

    selected.unshift(message);
    totalTokens += tokens;
  }

  return selected.map((message) => ({
    id: message.id,
    role: message.role,
    text: message.text,
    time: message.time,
    queryId: message.queryId,
    citations: message.citations,
    noAnswer: message.noAnswer,
    noAnswerReason: message.noAnswerReason,
    feedback: message.feedback,
    workflowSuggestion: message.workflowSuggestion,
    workflowActionSuggestion: message.workflowActionSuggestion,
    intentModeSuggestion: message.intentModeSuggestion
  }));
}

function createConversationSessionId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createProgressRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `progress-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readStoredMessages(key: string): RenderedMessage[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? normalizeMessages(parsed) : null;
  } catch {
    return null;
  }
}

function writeStoredMessages(key: string, messages: RenderedMessage[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(key, JSON.stringify(messages));
  } catch {
    // Ignore storage failures; the chat should keep working without persistence.
  }
}

function createMockWorkflowReply(message: string, workflows: ScoutWorkflowSession[]): ScoutChatMessage | undefined {
  const normalized = message.toLowerCase();
  const isWorkflowListQuestion = /\b(show|list|open|bring|display)\b/.test(normalized) && /\b(workflow|workflows|session|sessions)\b/.test(normalized);
  const isCreateRateQuestion = /\b(create|add|setup|make)\b/.test(normalized) && /\brate\b/.test(normalized);
  const matchedWorkflow = findWorkflowForMessage(normalized, workflows);

  if (isWorkflowListQuestion) {
    return {
      role: "assistant",
      text: "I can show guided workflow sessions inside this chat. Use the Workflows option above to browse the available sessions, or start with this one.",
      workflowSuggestion: matchedWorkflow ?? workflows[0]
    };
  }

  if (!isCreateRateQuestion && !matchedWorkflow) {
    return undefined;
  }

  const workflow = matchedWorkflow ?? workflows.find((item) => item.title.toLowerCase().includes("rate")) ?? workflows[0];

  return {
    role: "assistant",
    text: workflow
      ? `I found a guided workflow that can walk you through ${workflow.title} step by step. You can start it from here.`
      : "To create a rate, open the rate setup area, choose the rate type, fill in the required pricing fields, review the effective dates, and save the rate.",
    workflowSuggestion: workflow
  };
}

function ConversationHistorySection({
  actionLabel = "Archive",
  actionState,
  currentPage,
  currentConversationId,
  emptyMessage,
  items,
  onArchive,
  onDelete,
  onNextPage,
  onPreviousPage,
  onRename,
  onResume,
  onSelectAll,
  onToggleSelection,
  pageCount,
  sectionStatus,
  selectedConversationIds,
  title
}: {
  actionLabel?: string;
  actionState: HistoryActionState;
  currentPage: number;
  currentConversationId: string;
  emptyMessage: string;
  items: ConversationListItem[];
  onArchive: (id: string) => void;
  onDelete: (item: ConversationListItem) => void;
  onNextPage?: () => void;
  onPreviousPage?: () => void;
  onRename: (item: ConversationListItem) => void;
  onResume: (id: string) => void;
  onSelectAll: (checked: boolean) => void;
  onToggleSelection: (id: string) => void;
  pageCount: number;
  sectionStatus: "active" | "archived";
  selectedConversationIds: Set<string>;
  title: string;
}) {
  const selectableItems = items.filter((item) => item.status === sectionStatus);
  const selectedCount = selectableItems.filter((item) => selectedConversationIds.has(item.id)).length;
  const allSelected = selectableItems.length > 0 && selectedCount === selectableItems.length;

  return (
    <section className="min-w-0">
      <div className="mb-2 flex min-h-7 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            aria-label={allSelected ? `Clear ${title} selection` : `Select all ${title} conversations`}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border text-[11px] font-bold transition",
              allSelected ? "border-sky-500 bg-sky-500 text-white" : "border-slate-300 bg-white text-slate-400"
            )}
            onClick={() => onSelectAll(!allSelected)}
            type="button"
          >
            {allSelected ? <Check className="h-3.5 w-3.5" /> : null}
          </button>
          <h4 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</h4>
        </div>
        <span className="text-xs text-slate-400">{items.length}{pageCount > 1 ? ` • Page ${currentPage}/${pageCount}` : ""}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isCurrent = item.id === currentConversationId;
            const isBusy = actionState.conversationId === item.id && ["renaming", "deleting", "archiving", "restoring"].includes(actionState.type);
            const isSelected = selectedConversationIds.has(item.id);

            return (
              <div key={item.id} className={cn("min-w-0 overflow-hidden rounded-xl border", isCurrent ? "border-sky-200 bg-sky-50" : "border-slate-200 bg-white") }>
                <div className="flex min-w-0 items-start gap-2.5 px-3 py-3">
                  <button
                    aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-bold transition focus:outline-none focus:ring-4 focus:ring-sky-100",
                      isSelected ? "border-sky-500 bg-sky-500 text-white" : "border-slate-300 bg-white text-slate-400"
                    )}
                    onClick={() => onToggleSelection(item.id)}
                    type="button"
                  >
                    {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                  <button className="min-w-0 flex-1 text-left focus:outline-none" onClick={() => onResume(item.id)} title="Resume conversation" type="button">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-5 text-slate-900" title={item.title}>{item.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {item.message_count} messages
                          {item.last_message_at ? ` • ${new Date(item.last_message_at).toLocaleString()}` : ""}
                        </p>
                      </div>
                      {isCurrent ? <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700">Current</span> : null}
                    </div>
                  </button>
                </div>
                <div className="flex min-h-10 items-center justify-end gap-1 border-t border-slate-100 bg-slate-50/70 px-2">
                  <HistoryActionButton disabled={isBusy} label="Rename conversation" onClick={() => onRename(item)}>
                    <Pencil className="h-4 w-4" />
                  </HistoryActionButton>
                  <HistoryActionButton disabled={isBusy} label="Resume conversation" onClick={() => onResume(item.id)}>
                    <Play className="h-4 w-4" />
                  </HistoryActionButton>
                  <HistoryActionButton disabled={isBusy} label={`${actionLabel} conversation`} onClick={() => onArchive(item.id)}>
                    {actionLabel === "Restore" ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </HistoryActionButton>
                  <HistoryActionButton danger disabled={isBusy} label="Delete conversation" onClick={() => onDelete(item)}>
                    <Trash2 className="h-4 w-4" />
                  </HistoryActionButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pageCount > 1 ? (
        <div className="mt-3 flex items-center justify-end gap-1">
          <HistoryActionButton disabled={!onPreviousPage} label="Previous page" onClick={onPreviousPage}>
            <ChevronLeft className="h-4 w-4" />
          </HistoryActionButton>
          <HistoryActionButton disabled={!onNextPage} label="Next page" onClick={onNextPage}>
            <ChevronRight className="h-4 w-4" />
          </HistoryActionButton>
        </div>
      ) : null}
    </section>
  );
}

function HistoryActionButton({
  children,
  danger = false,
  disabled = false,
  label,
  onClick
}: {
  children: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-35",
        danger
          ? "text-red-600 hover:bg-red-50 hover:text-red-700 focus:ring-red-100"
          : "text-slate-600 hover:bg-white hover:text-slate-950 focus:ring-sky-100"
      )}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function toggleSetValue(current: Set<string>, value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function formatNodeType(nodeType: string) {
  return nodeType.replaceAll("_", " ");
}

function findWorkflowForMessage(normalizedMessage: string, workflows: ScoutWorkflowSession[]) {
  return workflows.find((workflow) => {
    const words = workflow.title.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => normalizedMessage.includes(word));
  });
}

function findWorkflowByActionKeywords(normalizedMessage: string, workflows: ScoutWorkflowSession[]) {
  return workflows.find((workflow) => {
    const title = workflow.title.toLowerCase();
    const description = workflow.description.toLowerCase();
    const combined = `${title} ${description}`;
    return workflowBusinessHints.some((hint) => normalizedMessage.includes(hint) && combined.includes(hint))
      || workflowActionVerbs.some((verb) => new RegExp(`\\b${verb}\\b`, "i").test(normalizedMessage) && combined.includes(verb));
  });
}

function isAffirmativeResponse(message: string) {
  const normalized = normalizeConfirmationResponse(message);
  return /^(yes|y|yeah|ya|yup|yep|sure|okay|ok|alright|sounds good|go ahead|please do|do it|proceed|continue|that one|this one)$/.test(normalized);
}

function isNegativeResponse(message: string) {
  const normalized = normalizeConfirmationResponse(message);
  return /^(no|n|nope|nah|na|cancel|stop|not now|dont|do not|please dont|please do not|never mind|nevermind)$/.test(normalized);
}

function normalizeConfirmationResponse(message: string) {
  return message
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ");
}

function isAmbiguousShortResponse(message: string) {
  const normalized = normalizeConfirmationResponse(message);
  if (!normalized) return true;
  return normalized.length <= 40 && normalized.split(/\s+/).length <= 5;
}

function findPendingWorkflowConfirmation(messages: RenderedMessage[]): PendingWorkflowConfirmation | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const suggestion = message.role === "assistant" ? message.workflowActionSuggestion : undefined;
    if (suggestion?.status === "pending") {
      return { messageId: message.id, suggestion };
    }
  }
  return null;
}

function shouldTryWorkflowRouterForChatIntent(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Discovery-style asks can be misclassified as chat; let router still evaluate once.
  return /\b(workflow|orchestration|walk me through|walk me thru|process|rate creation|is there any|can you guide|how do i)\b/.test(normalized);
}

function resolveReply(reply: ScoutChatMessage | string | void): ScoutChatMessage {
  if (!reply) {
    return {
      role: "assistant",
      text: defaultReplies[Math.floor(Math.random() * defaultReplies.length)]
    };
  }

  if (typeof reply === "string") {
    return {
      role: "assistant",
      text: reply
    };
  }

  return reply;
}

function workflowFromGuide(guide: PlayerGuide): ScoutWorkflowSession {
  const enabledStepCount = countEnabledSteps(guide.steps);

  return {
    id: guide.id,
    title: guide.title,
    description: guide.description,
    estimatedTime: estimateWorkflowDuration(enabledStepCount),
    steps: enabledStepCount,
    preWorkflowConfirmationHtml: guide.preWorkflowConfirmationHtml,
    preWorkflowConfirmationEnabled: guide.preWorkflowConfirmationEnabled
  };
}

function countEnabledSteps(steps: PlayerGuide["steps"]) {
  return steps.filter((step) => step.enabled !== false).length;
}

function workflowSessionFromPlayerSession(session: PlayerTrainingSession): ScoutWorkflowSession {
  const topics = session.topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    guideId: topic.guideId,
    description: topic.description,
    estimatedTime: estimateWorkflowDuration(topic.steps),
    steps: topic.steps,
    preWorkflowConfirmationHtml: topic.preWorkflowConfirmationHtml,
    preWorkflowConfirmationEnabled: topic.preWorkflowConfirmationEnabled
  }));

  return {
    id: session.id,
    title: session.title,
    description: `${topics.length} published ${topics.length === 1 ? "topic" : "topics"}`,
    estimatedTime: estimateWorkflowDuration(topics.reduce((total, topic) => total + topic.steps, 0)),
    steps: topics.reduce((total, topic) => total + topic.steps, 0),
    topics
  };
}

function estimateWorkflowDuration(stepCount: number) {
  return `${Math.max(1, Math.ceil(stepCount / 3))} min`;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function getPlayerHandle(
  config: { scoutBaseUrl: string; targetAppId: string },
  handleRef: { current: ScoutAdoptionPlayerHandle | null }
) {
  if (handleRef.current?.version === SCOUT_PLAYER_VERSION) {
    return handleRef.current;
  }
  handleRef.current = null;

  await ensurePlayerScript(config.scoutBaseUrl);

  if (!window.ScoutAdoptionPlayer) {
    throw new Error("Guided workflow player is not available.");
  }

  const handle = await window.ScoutAdoptionPlayer.init({
    scoutBaseUrl: config.scoutBaseUrl,
    targetAppId: config.targetAppId,
    autoShowLauncher: false
  });
  handleRef.current = handle;
  return handle;
}

function ensurePlayerScript(scoutBaseUrl: string) {
  if (window.ScoutAdoptionPlayer?.smartRuntime && window.ScoutAdoptionPlayer.version === SCOUT_PLAYER_VERSION) {
    return Promise.resolve();
  }

  const sourceUrl = new URL("/scout-smart-adoption-player.js", scoutBaseUrl || window.location.origin);
  sourceUrl.searchParams.set("v", SCOUT_PLAYER_VERSION);
  const source = sourceUrl.toString();
  const existing = document.querySelector<HTMLScriptElement>(`script[data-scout-player-version="${SCOUT_PLAYER_VERSION}"]`);

  if (existing) {
    if (existing.dataset.loaded === "true") return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load guided workflow player.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.dataset.scoutPlayerVersion = SCOUT_PLAYER_VERSION;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    }, { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load guided workflow player.")), { once: true });
    document.body.appendChild(script);
  });
}

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getDefaultChatSize(): ChatSize {
  if (typeof window === "undefined") {
    return {
      width: 440,
      height: 680
    };
  }

  return clampChatSize({
    width: 440,
    height: Math.round(window.innerHeight * 0.75)
  });
}

function getDefaultChatPosition(position: ScoutChatbotProps["position"], size: ChatSize): ChatPosition {
  if (typeof window === "undefined") {
    return {
      left: 20,
      top: 20
    };
  }

  const gap = 20;

  return clampChatPosition(
    {
      left: position === "bottom-left" ? gap : window.innerWidth - size.width - gap,
      top: window.innerHeight - size.height - gap
    },
    size
  );
}

function getBottomRightChatPosition(size: ChatSize): ChatPosition {
  if (typeof window === "undefined") {
    return {
      left: 20,
      top: 20
    };
  }

  const gap = 20;

  return clampChatPosition(
    {
      left: window.innerWidth - size.width - gap,
      top: window.innerHeight - size.height - gap
    },
    size
  );
}

function clampChatSize(size: ChatSize): ChatSize {
  if (typeof window === "undefined") {
    return size;
  }

  const maxWidth = Math.max(320, window.innerWidth - 24);
  const maxHeight = Math.max(420, window.innerHeight - 24);

  return {
    width: Math.min(Math.max(size.width, 340), maxWidth),
    height: Math.min(Math.max(size.height, 440), maxHeight)
  };
}

function clampChatPosition(position: ChatPosition, size: ChatSize): ChatPosition {
  if (typeof window === "undefined") {
    return position;
  }

  const gap = 12;

  return {
    left: Math.min(Math.max(position.left, gap), Math.max(gap, window.innerWidth - size.width - gap)),
    top: Math.min(Math.max(position.top, gap), Math.max(gap, window.innerHeight - size.height - gap))
  };
}
