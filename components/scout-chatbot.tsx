"use client";

import { cn } from "@/lib/utils";
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Clock3,
  Maximize2,
  MessageCircle,
  Mic,
  Minus,
  Paperclip,
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
  ReactNode,
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
};

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
  subtitle?: string;
  theme?: ScoutChatTheme;
  userId?: string;
  userLabel?: string;
  variant?: "floating" | "inline";
  welcomeMessage?: string;
};

type RenderedMessage = Required<Pick<ScoutChatMessage, "id" | "role" | "text" | "time">>;

type WidgetStyle = CSSProperties & {
  "--scout-brand": string;
  "--scout-accent": string;
  "--scout-surface": string;
  "--scout-focus": string;
};

const defaultPrompts = [
  "Summarize my account activity",
  "Draft a support reply",
  "Find the right integration guide"
];

const defaultReplies = [
  "I am ready for your API. Pass an async onSendMessage handler and I will render the response inside this same polished widget.",
  "This component is portable: configure brand color, welcome copy, launcher position, quick prompts, and message handling from props.",
  "For a customer install, mount the component once near the root of their app and pass user or session context to your backend handler."
];

const defaultWelcome =
  "Hi, I am Scout. I can help users find answers, draft replies, and move through workflows without leaving your app.";

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
  subtitle = "Online now",
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

  function setOpen(nextValue: boolean) {
    setIsOpen(nextValue);
    onOpenChange?.(nextValue);
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
        : await sendChatQuery(trimmed);
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
      onClick={() => setOpen(true)}
      style={cssVars}
      type="button"
    >
      <MessageCircle className="h-7 w-7 transition group-hover:scale-105" />
    </button>
  );

  if (!isOpen) {
    return variant === "floating" ? (
      <div className={cn("fixed z-50", getPositionClass(position))}>{launcher}</div>
    ) : (
      launcher
    );
  }

  const panel = (
    <section
      aria-label={`${assistantName} chat widget`}
      className={cn(
        "w-full max-w-[440px] overflow-hidden rounded-[28px] border border-white/80 bg-[var(--scout-surface)] shadow-chat-panel ring-1 ring-slate-950/5 animate-slide-up",
        isMinimized ? "max-h-[112px]" : "min-h-[680px]",
        className
      )}
      style={cssVars}
    >
      <header className="border-b border-slate-100 bg-[var(--scout-brand)] px-5 py-4 text-white">
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
            <IconButton
              label={isMinimized ? "Expand chat" : "Minimize chat"}
              onClick={() => setIsMinimized((value) => !value)}
            >
              {isMinimized ? <ChevronDown className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Close chat" onClick={() => setOpen(false)}>
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
              API-ready response handler
            </div>
            {showHeaderActions && (
              <div className="flex items-center gap-2">
                <UtilityButton label="Open settings">
                  <Settings className="h-4 w-4" />
                </UtilityButton>
                <UtilityButton label="Expand widget">
                  <Maximize2 className="h-4 w-4" />
                </UtilityButton>
              </div>
            )}
          </div>

          <div className="scrollbar-soft flex h-[386px] flex-col gap-4 overflow-y-auto bg-white px-5 py-5">
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
              <MessageBubble key={message.id} message={message} userLabel={userLabel} />
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
        </>
      )}
    </section>
  );

  return variant === "floating" ? (
    <div className={cn("fixed z-50 w-[calc(100vw-32px)] max-w-[440px]", getPositionClass(position))}>
      {panel}
    </div>
  ) : (
    panel
  );
}

function MessageBubble({
  message,
  userLabel
}: {
  message: RenderedMessage;
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

function UtilityButton({ children, label }: { children: ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:text-slate-950 focus:outline-none focus:ring-4 focus:ring-[var(--scout-focus)]"
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
      time: message.time ?? formatTime()
    })
  );
}

function createRenderedMessage(message: ScoutChatMessage & { id: string; time: string }): RenderedMessage {
  return {
    id: message.id,
    role: message.role,
    text: message.text,
    time: message.time
  };
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

function formatTime() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getPositionClass(position: ScoutChatbotProps["position"]) {
  return position === "bottom-left" ? "bottom-5 left-5" : "bottom-5 right-5";
}
