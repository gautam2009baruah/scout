"use client";

import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  Grip,
  MessageCircle,
  Play,
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
  useEffect,
  useRef,
  useState
} from "react";

export type ScoutChatRole = "assistant" | "user";

export type ScoutChatMessage = {
  id?: string;
  role: ScoutChatRole;
  text: string;
  time?: string;
  workflowSuggestion?: ScoutWorkflowSession;
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

export type ScoutChatbotProps = {
  assistantName?: string;
  badge?: string;
  chatEndpoint?: string;
  className?: string;
  companyId?: string;
  conversationId?: string;
  defaultMinimized?: boolean;
  defaultOpen?: boolean;
  initialMessages?: ScoutChatMessage[];
  launcherLabel?: string;
  modeNotice?: ReactNode;
  onConversationChange?: (conversationId: string) => void;
  onOpenChange?: (isOpen: boolean) => void;
  onSendMessage?: (message: string, history: ScoutChatMessage[]) => Promise<ScoutChatMessage | string | void>;
  placeholder?: string;
  position?: "bottom-right" | "bottom-left";
  quickPrompts?: string[];
  showHeaderActions?: boolean;
  scoutBaseUrl?: string;
  subtitle?: string;
  targetAppId?: string;
  targetAppName?: string;
  theme?: ScoutChatTheme;
  userId?: string;
  userLabel?: string;
  variant?: "floating" | "inline";
  welcomeMessage?: string;
};

type RenderedMessage = Required<Pick<ScoutChatMessage, "id" | "role" | "text" | "time">> & {
  workflowSuggestion?: ScoutWorkflowSession;
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

const defaultReplies = [
  "I am ready for your API. Pass an async onSendMessage handler and I will render the response inside this same polished widget.",
  "This component is portable: configure brand color, welcome copy, launcher position, quick prompts, and message handling from props.",
  "For a customer install, mount the component once near the root of their app and pass user or session context to your backend handler."
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

const mockWorkflowSessions: ScoutWorkflowSession[] = [
  {
    id: "create-rate",
    title: "Create Rate",
    description: "Open the rate setup flow and complete the required rate fields.",
    estimatedTime: "2 min",
    steps: 6
  },
  {
    id: "update-customer",
    title: "Update Customer",
    description: "Find a customer profile and update saved account details.",
    estimatedTime: "3 min",
    steps: 5
  }
];

export function ScoutChatbot({
  assistantName = "Scout Assistant",
  chatEndpoint = "/chat/query",
  className,
  companyId,
  conversationId,
  defaultOpen = true,
  initialMessages,
  launcherLabel = "Open chat",
  onConversationChange,
  onOpenChange,
  onSendMessage,
  placeholder = "Ask anything...",
  position = "bottom-right",
  showHeaderActions = true,
  scoutBaseUrl = "",
  targetAppId,
  targetAppName,
  theme,
  userId,
  userLabel = "You",
  variant = "inline"
}: ScoutChatbotProps) {
  const messageStorageKey = getMessageStorageKey({ companyId, conversationId, userId, variant });
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState<RenderedMessage[]>(() =>
    readStoredMessages(messageStorageKey) ?? normalizeMessages(initialMessages ?? [])
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [activeTab, setActiveTab] = useState<ChatTab>("qa");
  const [isMinimizing, setIsMinimizing] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<ScoutWorkflowSession | null>(null);
  const [workflowSessions, setWorkflowSessions] = useState<ScoutWorkflowSession[]>(mockWorkflowSessions);
  const [expandedWorkflowSessions, setExpandedWorkflowSessions] = useState<Set<string>>(() => new Set());
  const [workflowsState, setWorkflowsState] = useState<{ status: "idle" | "loading" | "ready" | "error"; message: string }>({
    status: "idle",
    message: ""
  });
  const playerHandleRef = useRef<ScoutAdoptionPlayerHandle | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [panelSize, setPanelSize] = useState<ChatSize>(initialChatSize);
  const [panelPosition, setPanelPosition] = useState<ChatPosition>(initialChatPosition);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const activeConversationId = useRef(conversationId ?? "");

  // Generate unique message ID using timestamp + random component
  const generateMessageId = () => {
    return `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  };

  const cssVars: WidgetStyle = {
    "--scout-brand": theme?.brandColor ?? "#020617",
    "--scout-accent": theme?.accentColor ?? "#0ea5e9",
    "--scout-surface": theme?.surfaceColor ?? "#ffffff",
    "--scout-focus": `${theme?.accentColor ?? "#0ea5e9"}24`
  };

  useEffect(() => {
    setHasMounted(true);

    if (variant !== "floating") {
      return;
    }

    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(defaultOpen ? getDefaultChatPosition(position, nextSize) : getBottomRightChatPosition(launcherSize));
  }, [defaultOpen, position, variant]);

  // Listen for minimize events from orchestration links
  useEffect(() => {
    const handleMinimize = () => {
      console.log('📩 Received SCOUT_MINIMIZE_CHATBOT event');
      if (variant === "floating") {
        closeFloatingChat();
      } else {
        setOpen(false);
      }
    };

    window.addEventListener('SCOUT_MINIMIZE_CHATBOT', handleMinimize);
    return () => window.removeEventListener('SCOUT_MINIMIZE_CHATBOT', handleMinimize);
  }, [variant]);

  useEffect(() => {
    writeStoredMessages(messageStorageKey, messages);
  }, [messageStorageKey, messages]);

  useEffect(() => {
    if (!targetAppId) {
      setWorkflowSessions(mockWorkflowSessions);
      setWorkflowsState({ status: "idle", message: "" });
      return;
    }

    const workflowTargetAppId = targetAppId;
    let ignore = false;
    const controller = new AbortController();

    async function loadWorkflows() {
      setWorkflowsState({ status: "loading", message: "" });

      try {
        const url = new URL("/api/guided-workflow-player/guides", scoutBaseUrl || window.location.origin);
        url.searchParams.set("targetAppId", workflowTargetAppId);
        const response = await fetch(url.toString(), { signal: controller.signal });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(typeof body?.message === "string" ? body.message : "Unable to load guided workflows.");
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
  }, [scoutBaseUrl, targetAppId, targetAppName]);

  function setOpen(nextValue: boolean) {
    setIsOpen(nextValue);
    onOpenChange?.(nextValue);
  }

  function openFloatingChat() {
    setIsMinimizing(false);
    const nextSize = clampChatSize(panelSize);
    setPanelSize(nextSize);
    setPanelPosition(getBottomRightChatPosition(nextSize));
    setOpen(true);
  }

  function closeFloatingChat() {
    if (variant === "floating" && isOpen) {
      setIsMinimizing(true);
      setPanelPosition(getBottomRightChatPosition(launcherSize));
      window.setTimeout(() => {
        setOpen(false);
        setIsMinimizing(false);
      }, 220);
      return;
    }

    setPanelPosition(getBottomRightChatPosition(launcherSize));
    setOpen(false);
  }

  function restoreFloatingLayout() {
    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(getDefaultChatPosition(position, nextSize));
  }

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
    if (variant !== "floating" || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = clampChatPosition(panelPosition, panelSize);
    document.body.classList.add("select-none");

    function move(moveEvent: PointerEvent) {
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
    if (variant !== "floating") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const startX = event.clientX;
    const startY = event.clientY;
    const startSize = panelSize;
    document.body.classList.add("select-none");

    function move(moveEvent: PointerEvent) {
      const nextSize = clampChatSize({
        width: startSize.width + moveEvent.clientX - startX,
        height: startSize.height + moveEvent.clientY - startY
      });

      setPanelSize(nextSize);
      setPanelPosition((current) => clampChatPosition(current, nextSize));
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

    setMessages(nextHistory);
    setInput("");
    setIsTyping(true);

    try {
      const customReply = onSendMessage
        ? await onSendMessage(trimmed, nextHistory)
        : await sendChatQuery(trimmed); // Always use real API, skip mock workflows
      const assistantReply = resolveReply(customReply);

      window.setTimeout(
        () => {
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
          inputRef.current?.focus();
        },
        120 // Real API response delay
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        createRenderedMessage({
          id: generateMessageId(),
          role: "assistant",
          text: error instanceof Error ? error.message : "I could not reach the assistant service. Please try again in a moment.",
          time: formatTime()
        })
      ]);
      setIsTyping(false);
    }
  }

  async function startWorkflow(workflow: ScoutWorkflowSession) {
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

    if (targetAppId) {
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

  async function sendChatQuery(question: string) {
    if (!companyId || !userId) {
      return undefined;
    }

    const response = await fetch(chatEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: companyId,
        user_id: userId,
        question,
        conversation_id: activeConversationId.current || undefined
      })
    });
    const body = await response.json().catch(() => null);

    console.log('📥 Chat API Response:', body);
    console.log('🔍 Has orchestration_trigger?:', !!body?.orchestration_trigger);
    console.log('🔍 Trigger data:', body?.orchestration_trigger);

    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Chat query failed.");
    }

    if (typeof body?.conversation_id === "string") {
      activeConversationId.current = body.conversation_id;
      onConversationChange?.(body.conversation_id);
    }

    // Check for orchestration trigger (store for link click)
    // The orchestration info is included in the answer text with a clickable link
    if (body?.orchestration_trigger) {
      const trigger = body.orchestration_trigger;
      console.log('🎯 Orchestration option available:', trigger);
      console.log('� Received executionId:', trigger.executionId);
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

    return typeof body?.answer === "string" ? body.answer : undefined;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
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
        variant === "floating" ? "h-full max-w-none" : "max-w-[440px]",
        variant === "floating" ? "min-h-0" : "min-h-[680px]",
        className
      )}
      style={cssVars}
    >
      <header
        className={cn(
          "border-b border-slate-100 bg-[var(--scout-brand)] px-4 py-2 text-white",
          variant === "floating" && "cursor-move touch-none"
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
            {showHeaderActions && variant === "floating" && (
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
          <div className="grid grid-cols-2 border-b border-slate-100 bg-slate-50 text-sm font-semibold text-slate-500">
            <button
              aria-selected={activeTab === "qa"}
              className={cn(
                "h-11 border-b-2 transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                activeTab === "qa" ? "border-[var(--scout-brand)] bg-white text-slate-950" : "border-transparent hover:bg-white/70 hover:text-slate-800"
              )}
              onClick={() => setActiveTab("qa")}
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
              <div className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-white px-5 py-5">
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} onStartWorkflow={startWorkflow} userLabel={userLabel} />
                ))}

                {isTyping && <TypingIndicator />}
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                <form
                  className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-[var(--scout-focus)]"
                  onSubmit={handleSubmit}
                >
                  <textarea
                    ref={inputRef}
                    aria-label={`Message ${assistantName}`}
                    className="h-11 max-h-11 min-h-11 w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-5 text-slate-900 outline-none placeholder:text-slate-400"
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    rows={1}
                    value={input}
                  />
                  <div className="flex items-center justify-end gap-3 px-1 pb-0.5">
                    <button
                      aria-label="Send message"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:translate-y-0"
                      disabled={!input.trim() || isTyping}
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
                              {topics.map((topic) => (
                                <button
                                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg bg-white px-3 text-left text-sm shadow-sm transition hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                                  key={topic.id}
                                  onClick={() => startWorkflowTopic(topic)}
                                  type="button"
                                >
                                  <span className="min-w-0 truncate font-medium text-slate-800">{topic.title}</span>
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

          {variant === "floating" && (
            <button
              aria-label="Resize chat"
              className="absolute bottom-2.5 right-2.5 flex h-7 w-7 cursor-nwse-resize items-center justify-center rounded-lg bg-slate-950/5 text-slate-500 transition hover:bg-slate-950/10 hover:text-slate-900 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)] max-[520px]:hidden"
              onPointerDown={handleResizePointerDown}
              title="Resize chat"
              type="button"
            >
              <Grip className="h-4 w-4" />
            </button>
          )}
        </>
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

function MessageBubble({
  message,
  onStartWorkflow,
  userLabel
}: {
  message: RenderedMessage;
  onStartWorkflow: (workflow: ScoutWorkflowSession) => void;
  userLabel: string;
}) {
  const isAssistant = message.role === "assistant";

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
        </div>
        {message.workflowSuggestion && (
          <div className="mt-2">
            <WorkflowCard compact onStart={onStartWorkflow} workflow={message.workflowSuggestion} />
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

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white">
        <Bot className="h-4 w-4" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-slate-100 bg-slate-50 px-4 py-4 shadow-sm">
        <span className="h-2 w-2 animate-blink rounded-full bg-slate-400" />
        <span className="h-2 w-2 animate-blink rounded-full bg-slate-400 [animation-delay:160ms]" />
        <span className="h-2 w-2 animate-blink rounded-full bg-slate-400 [animation-delay:320ms]" />
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
      id: needsNewId ? `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}-${index}` : message.id,
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
    workflowSuggestion: message.workflowSuggestion
  };
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

function findWorkflowForMessage(normalizedMessage: string, workflows: ScoutWorkflowSession[]) {
  return workflows.find((workflow) => {
    const words = workflow.title.toLowerCase().split(/\s+/).filter((word) => word.length > 2);
    return words.length > 0 && words.every((word) => normalizedMessage.includes(word));
  });
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
