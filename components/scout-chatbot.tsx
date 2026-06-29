"use client";

import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Grip,
  ListChecks,
  Maximize2,
  MessageCircle,
  Mic,
  Minus,
  Paperclip,
  Play,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
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
  useMemo,
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
};

type PlayerGuide = {
  id: string;
  title: string;
  description: string;
  steps: unknown[];
};

type ScoutAdoptionPlayerHandle = {
  guides: unknown[];
  play(guideId?: string): void;
};

declare global {
  interface Window {
    ScoutAdoptionPlayer?: {
      smartRuntime?: boolean;
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

const defaultPrompts = [
  "How can I create a rate?",
  "Show guided workflows",
  "Find policy for rate approvals"
];

const defaultReplies = [
  "I am ready for your API. Pass an async onSendMessage handler and I will render the response inside this same polished widget.",
  "This component is portable: configure brand color, welcome copy, launcher position, quick prompts, and message handling from props.",
  "For a customer install, mount the component once near the root of their app and pass user or session context to your backend handler."
];

const defaultWelcome =
  "Hi, I am Scout. I can help users find answers, draft replies, and move through workflows without leaving your app.";

const initialChatSize: ChatSize = {
  width: 440,
  height: 680
};

const initialChatPosition: ChatPosition = {
  left: 20,
  top: 20
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
  badge = "Beta",
  chatEndpoint = "/chat/query",
  className,
  companyId,
  conversationId,
  defaultMinimized = false,
  defaultOpen = true,
  initialMessages,
  launcherLabel = "Open chat",
  modeNotice = "Frontend demo mode: responses are mocked locally until your backend API is connected.",
  onConversationChange,
  onOpenChange,
  onSendMessage,
  placeholder = "Ask anything...",
  position = "bottom-right",
  quickPrompts = defaultPrompts,
  showHeaderActions = true,
  scoutBaseUrl = "",
  subtitle = "Online now",
  targetAppId,
  targetAppName,
  theme,
  userId,
  userLabel = "You",
  variant = "inline",
  welcomeMessage = defaultWelcome
}: ScoutChatbotProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [messages, setMessages] = useState<RenderedMessage[]>(() =>
    normalizeMessages(
      initialMessages?.length
        ? initialMessages
        : [
            {
              role: "assistant",
              text: welcomeMessage,
              time: "09:41"
            }
          ]
    )
  );
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showWorkflows, setShowWorkflows] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState<ScoutWorkflowSession | null>(null);
  const [workflowSessions, setWorkflowSessions] = useState<ScoutWorkflowSession[]>(mockWorkflowSessions);
  const [workflowsState, setWorkflowsState] = useState<{ status: "idle" | "loading" | "ready" | "error"; message: string }>({
    status: "idle",
    message: ""
  });
  const playerHandleRef = useRef<ScoutAdoptionPlayerHandle | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [panelSize, setPanelSize] = useState<ChatSize>(initialChatSize);
  const [panelPosition, setPanelPosition] = useState<ChatPosition>(initialChatPosition);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextMessageId = useRef(messages.length + 1);
  const activeConversationId = useRef(conversationId ?? "");

  const cssVars: WidgetStyle = {
    "--scout-brand": theme?.brandColor ?? "#020617",
    "--scout-accent": theme?.accentColor ?? "#0ea5e9",
    "--scout-surface": theme?.surfaceColor ?? "#ffffff",
    "--scout-focus": `${theme?.accentColor ?? "#0ea5e9"}24`
  };

  const statusText = useMemo(() => {
    if (isTyping) {
      return `${assistantName} is typing`;
    }

    return subtitle;
  }, [assistantName, isTyping, subtitle]);

  useEffect(() => {
    setHasMounted(true);

    if (variant !== "floating") {
      return;
    }

    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(defaultOpen ? getDefaultChatPosition(position, nextSize) : getBottomRightChatPosition({ width: 64, height: 64 }));
  }, [defaultOpen, position, variant]);

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

        if (!ignore) {
          setWorkflowSessions(guides.map(workflowFromGuide));
          setWorkflowsState({
            status: "ready",
            message: guides.length === 0 ? `No published guided workflows found${targetAppName ? ` for ${targetAppName}` : ""}.` : ""
          });
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
    const nextSize = clampChatSize(panelSize);
    setPanelSize(nextSize);
    setPanelPosition(getBottomRightChatPosition(nextSize));
    setIsMinimized(false);
    setOpen(true);
  }

  function closeFloatingChat() {
    setIsMinimized(false);
    setPanelPosition(getBottomRightChatPosition({ width: 64, height: 64 }));
    setOpen(false);
  }

  function toggleMinimized() {
    const nextMinimized = !isMinimized;
    setIsMinimized(nextMinimized);

    if (variant === "floating") {
      const nextSize = nextMinimized ? getMinimizedChatSize(panelSize) : panelSize;
      setPanelPosition(getBottomRightChatPosition(nextSize));
    }
  }

  function restoreFloatingLayout() {
    const nextSize = getDefaultChatSize();
    setPanelSize(nextSize);
    setPanelPosition(getDefaultChatPosition(position, nextSize));
    setIsMinimized(false);
  }

  function handleHeaderPointerDown(event: ReactPointerEvent<HTMLElement>) {
    if (variant !== "floating" || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return;
    }

    const startX = event.clientX;
    const startY = event.clientY;
    const currentSize = isMinimized ? getMinimizedChatSize(panelSize) : panelSize;
    const startPosition = clampChatPosition(panelPosition, currentSize);
    document.body.classList.add("select-none");

    function move(moveEvent: PointerEvent) {
      setPanelPosition(
        clampChatPosition(
          {
            left: startPosition.left + moveEvent.clientX - startX,
            top: startPosition.top + moveEvent.clientY - startY
          },
          currentSize
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
    if (variant !== "floating" || isMinimized) {
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
      id: `local-${nextMessageId.current++}`,
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
        : createMockWorkflowReply(trimmed, workflowSessions) ?? await sendChatQuery(trimmed);
      const assistantReply = resolveReply(customReply);

      window.setTimeout(
        () => {
          setMessages((current) => [
            ...current,
            createRenderedMessage({
              ...assistantReply,
              id: assistantReply.id ?? `local-${nextMessageId.current++}`,
              role: "assistant",
              time: assistantReply.time ?? formatTime()
            })
          ]);
          setIsTyping(false);
          inputRef.current?.focus();
        },
        onSendMessage ? 120 : 700
      );
    } catch (error) {
      setMessages((current) => [
        ...current,
        createRenderedMessage({
          id: `local-${nextMessageId.current++}`,
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
    setShowWorkflows(false);

    let startedPlayer = false;

    if (targetAppId) {
      try {
        const player = await getPlayerHandle({ scoutBaseUrl, targetAppId }, playerHandleRef);
        player.play(workflow.id);
        startedPlayer = true;
      } catch (error) {
        setWorkflowsState({
          status: "error",
          message: error instanceof Error ? error.message : "Unable to start guided workflow player."
        });
      }
    }

    setMessages((current) => [
      ...current,
      createRenderedMessage({
        id: `local-${nextMessageId.current++}`,
        role: "assistant",
        text: startedPlayer
          ? `Starting guided workflow: ${workflow.title}.`
          : `Selected guided workflow: ${workflow.title}.`,
        time: formatTime()
      })
    ]);
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

    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Chat query failed.");
    }

    if (typeof body?.conversation_id === "string") {
      activeConversationId.current = body.conversation_id;
      onConversationChange?.(body.conversation_id);
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
      className="group flex h-16 w-16 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white shadow-chat-panel transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
      onClick={variant === "floating" ? openFloatingChat : () => setOpen(true)}
      style={cssVars}
      type="button"
    >
      <MessageCircle className="h-7 w-7 transition group-hover:scale-105" />
    </button>
  );

  if (!isOpen) {
    const launcherPosition = hasMounted ? getBottomRightChatPosition({ width: 64, height: 64 }) : initialChatPosition;

    return variant === "floating" ? (
      <div
        className="fixed z-50"
        style={{
          left: launcherPosition.left,
          top: launcherPosition.top,
          width: 64,
          height: 64
        }}
      >
        {launcher}
      </div>
    ) : (
      launcher
    );
  }

  const floatingSize = isMinimized ? getMinimizedChatSize(panelSize) : panelSize;
  const floatingPosition = hasMounted ? clampChatPosition(panelPosition, floatingSize) : panelPosition;

  const panel = (
    <section
      aria-label={`${assistantName} chat widget`}
      className={cn(
        "relative flex w-full flex-col overflow-hidden rounded-[28px] border border-white/80 bg-[var(--scout-surface)] shadow-chat-panel ring-1 ring-slate-950/5 animate-slide-up",
        variant === "floating" ? "h-full max-w-none" : "max-w-[440px]",
        isMinimized ? (variant === "floating" ? "min-h-0" : "max-h-[112px]") : variant === "floating" ? "min-h-0" : "min-h-[680px]",
        className
      )}
      style={cssVars}
    >
      <header
        className={cn(
          "border-b border-slate-100 bg-[var(--scout-brand)] px-5 py-4 text-white",
          variant === "floating" && "cursor-move touch-none"
        )}
        onPointerDown={handleHeaderPointerDown}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--scout-brand)]">
              <Bot className="h-6 w-6" />
              <span className="absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--scout-brand)] bg-emerald-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-base font-semibold">{assistantName}</h2>
                {badge && (
                  <span className="rounded-full bg-white/12 px-2 py-0.5 text-[11px] font-medium text-slate-200">
                    {badge}
                  </span>
                )}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {statusText}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {showHeaderActions && (
              <IconButton label="Search conversations">
                <Search className="h-4 w-4" />
              </IconButton>
            )}
            {variant === "floating" && (
              <IconButton label="Restore size and position" onClick={restoreFloatingLayout}>
                <RotateCcw className="h-4 w-4" />
              </IconButton>
            )}
            <IconButton
              label={isMinimized ? "Expand chat" : "Minimize chat"}
              onClick={toggleMinimized}
            >
              {isMinimized ? <ChevronDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Close chat" onClick={variant === "floating" ? closeFloatingChat : () => setOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        </div>
      </header>

      {!isMinimized && (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/80 px-5 py-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
              <Clock3 className="h-4 w-4 text-slate-400" />
              Knowledgebase + guided workflows
            </div>
            {showHeaderActions && (
              <div className="flex items-center gap-2">
                <button
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]",
                    showWorkflows
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
                  )}
                  onClick={() => setShowWorkflows((value) => !value)}
                  type="button"
                >
                  <ListChecks className="h-4 w-4" />
                  Workflows
                </button>
                <UtilityButton label="Open settings">
                  <Settings className="h-4 w-4" />
                </UtilityButton>
                <UtilityButton label="Restore size and position" onClick={restoreFloatingLayout}>
                  <Maximize2 className="h-4 w-4" />
                </UtilityButton>
              </div>
            )}
          </div>

          <div className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-white px-5 py-5">
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

            {showWorkflows && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-950">
                    {targetAppName ? `${targetAppName} guided workflows` : "Guided workflow sessions"}
                  </p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">{workflowSessions.length}</span>
                </div>
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
                <div className="mt-2 grid gap-1.5">
                  {workflowSessions.map((workflow) => (
                    <WorkflowCard key={workflow.id} onStart={startWorkflow} workflow={workflow} />
                  ))}
                </div>
              </div>
            )}

            {modeNotice && (
              <div className="rounded-lg border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-slate-700">
                <div className="mb-1 flex items-center gap-2 font-semibold text-slate-950">
                  <Sparkles className="h-4 w-4 text-[var(--scout-accent)]" />
                  Integration mode
                </div>
                {modeNotice}
              </div>
            )}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} onStartWorkflow={startWorkflow} userLabel={userLabel} />
            ))}

            {isTyping && <TypingIndicator />}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
            {quickPrompts.length > 0 && (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {quickPrompts.map((prompt) => (
                  <button
                    className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-sky-200 hover:text-sky-700 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            <form
              className="rounded-[22px] border border-slate-200 bg-white p-2 shadow-sm focus-within:border-sky-300 focus-within:ring-4 focus-within:ring-[var(--scout-focus)]"
              onSubmit={handleSubmit}
            >
              <textarea
                ref={inputRef}
                aria-label={`Message ${assistantName}`}
                className="max-h-28 min-h-[54px] w-full resize-none border-0 bg-transparent px-3 py-2 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                rows={2}
                value={input}
              />
              <div className="flex items-center justify-between gap-3 px-1 pb-1">
                <div className="flex items-center gap-1">
                  <ComposerButton label="Attach file">
                    <Paperclip className="h-4 w-4" />
                  </ComposerButton>
                  <ComposerButton label="Voice input">
                    <Mic className="h-4 w-4" />
                  </ComposerButton>
                </div>
                <button
                  aria-label="Send message"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--scout-brand)] text-white transition hover:-translate-y-0.5 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:hover:translate-y-0"
                  disabled={!input.trim() || isTyping}
                  type="submit"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </form>
          </div>

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
      )}
    </section>
  );

  return variant === "floating" ? (
    <div
      className="fixed z-50"
      style={{
        left: floatingPosition.left,
        top: floatingPosition.top,
        width: floatingSize.width,
        height: floatingSize.height
      }}
    >
      {panel}
    </div>
  ) : (
    panel
  );
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
          {message.text}
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

function UtilityButton({
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function ComposerButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function normalizeMessages(messages: ScoutChatMessage[]): RenderedMessage[] {
  return messages.map((message, index) =>
    createRenderedMessage({
      ...message,
      id: message.id ?? `initial-${index + 1}`,
      time: message.time ?? "09:41"
    })
  );
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
  return {
    id: guide.id,
    title: guide.title,
    description: guide.description,
    estimatedTime: estimateWorkflowDuration(guide.steps.length),
    steps: guide.steps.length
  };
}

function estimateWorkflowDuration(stepCount: number) {
  return `${Math.max(1, Math.ceil(stepCount / 3))} min`;
}

async function getPlayerHandle(
  config: { scoutBaseUrl: string; targetAppId: string },
  handleRef: { current: ScoutAdoptionPlayerHandle | null }
) {
  if (handleRef.current) {
    return handleRef.current;
  }

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
  if (window.ScoutAdoptionPlayer?.smartRuntime) {
    return Promise.resolve();
  }

  const source = new URL("/scout-smart-adoption-player.js", scoutBaseUrl || window.location.origin).toString();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${source}"]`);

  if (existing) {
    return new Promise<void>((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load guided workflow player.")), { once: true });
    });
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = source;
    script.async = true;
    script.addEventListener("load", () => resolve(), { once: true });
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

function getMinimizedChatSize(size: ChatSize): ChatSize {
  return {
    width: size.width,
    height: 76
  };
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
