"use client";

import { useEffect, useRef, useState } from "react";
import {
  ScoutChatbot,
  type ScoutChatLifecycleConfig,
  type ScoutChatMessage,
  type ScoutChatTheme
} from "@/components/scout-chatbot";

type EmbedConfig = {
  scoutUrl: string;
  apiUrl: string;
  apiKey: string;
  companyId: string;
  companyName: string;
  userId?: string;
  requireUserGuid?: boolean;
  targetAppId?: string;
  targetAppName?: string;
  assistantName?: string;
  autoLoadLifecycleSettings?: boolean;
  brandColor?: string;
  accentColor?: string;
  theme?: unknown;
  lifecycleConfig?: ScoutChatLifecycleConfig;
  placeholder?: string;
  quickPrompts?: string[];
  intentGateEndpoint?: string;
  workflowRouterEndpoint?: string;
};

const CSS_COLOR_PATTERN = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([\d\s.,%+-]+\)|[a-z]{3,20})$/i;
const CSS_LENGTH_PATTERN = /^(?:0|(?:\d+(?:\.\d+)?)(?:px|rem|em|%))$/i;
const FONT_FAMILY_PATTERN = /^[a-z0-9\s'",\-]+$/i;

function safeString(value: unknown, pattern: RegExp, maxLength = 100) {
  const candidate = typeof value === "string" ? value.trim() : "";
  return candidate && candidate.length <= maxLength && pattern.test(candidate) ? candidate : undefined;
}

function safeAssetUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return undefined;
  try {
    const url = new URL(value.trim(), window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function normalizeTheme(value: unknown, legacy: Pick<EmbedConfig, "brandColor" | "accentColor">): ScoutChatTheme {
  const input = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const position = input.position === "bottom-left" || input.position === "bottom-right"
    ? input.position
    : undefined;

  return {
    primaryColor: safeString(input.primaryColor, CSS_COLOR_PATTERN) ?? safeString(legacy.brandColor, CSS_COLOR_PATTERN) ?? "#111827",
    secondaryColor: safeString(input.secondaryColor, CSS_COLOR_PATTERN),
    accentColor: safeString(input.accentColor, CSS_COLOR_PATTERN) ?? safeString(legacy.accentColor, CSS_COLOR_PATTERN) ?? "#0ea5e9",
    textColor: safeString(input.textColor, CSS_COLOR_PATTERN),
    backgroundColor: safeString(input.backgroundColor, CSS_COLOR_PATTERN),
    borderRadius: safeString(input.borderRadius, CSS_LENGTH_PATTERN, 24),
    fontFamily: safeString(input.fontFamily, FONT_FAMILY_PATTERN, 160),
    logo: safeAssetUrl(input.logo),
    launcherIcon: safeAssetUrl(input.launcherIcon),
    position,
    darkMode: typeof input.darkMode === "boolean" ? input.darkMode : undefined
  };
}

export default function EmbeddedScoutChatbotPage() {
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [lifecycleConfig, setLifecycleConfig] = useState<ScoutChatLifecycleConfig | undefined>(undefined);
  const parentOriginRef = useRef("*");
  const clientTraceIdRef = useRef<string | null>(null);
  const theme = config ? normalizeTheme(config.theme, config) : undefined;

  function getClientTraceId() {
    if (clientTraceIdRef.current) {
      return clientTraceIdRef.current;
    }

    const storageKey = "scout-chatbot:embed-client-trace-id";
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored && stored.trim()) {
        clientTraceIdRef.current = stored.trim();
        return clientTraceIdRef.current;
      }
    } catch {
      // Ignore storage access errors and use a runtime fallback.
    }

    const browserHint = `${window.location.hostname}|${window.navigator.userAgent}|${window.navigator.language}`;
    const encodedHint = window.btoa(browserHint).replace(/[^a-zA-Z0-9]/g, "").slice(0, 20) || "browser";
    const uniquePart = typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const traceId = `${encodedHint}:${uniquePart}`;
    clientTraceIdRef.current = traceId;

    try {
      window.localStorage.setItem(storageKey, traceId);
    } catch {
      // Ignore storage write errors; trace ID still works for this runtime.
    }

    return traceId;
  }

  useEffect(() => {
    function receiveConfig(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== "scout-chatbot:configure") return;
      const next = event.data.config as EmbedConfig;
      if (!next?.apiUrl || !next.apiKey || !next.companyId || !next.companyName) return;
      parentOriginRef.current = event.origin || "*";
      setConfig(next);
    }

    window.addEventListener("message", receiveConfig);
    window.parent.postMessage({ type: "scout-chatbot:ready" }, "*");
    return () => window.removeEventListener("message", receiveConfig);
  }, []);

  useEffect(() => {
    if (!config) {
      setLifecycleConfig(undefined);
      return;
    }

    if (config.autoLoadLifecycleSettings === false) {
      setLifecycleConfig(config.lifecycleConfig);
      return;
    }

    const controller = new AbortController();
    const safeConfig = config;

    async function loadLifecycleSettings() {
      try {
        const response = await fetch(`${safeConfig.apiUrl.replace(/\/$/, "")}/v1/chat/settings`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": safeConfig.apiKey },
          body: JSON.stringify({
            companyId: safeConfig.companyId,
            companyName: safeConfig.companyName,
            targetAppId: safeConfig.targetAppId || undefined,
            targetAppName: safeConfig.targetAppName || undefined
          }),
          signal: controller.signal
        });
        const body = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(typeof body?.message === "string" ? body.message : "Unable to load lifecycle settings.");
        }

        setLifecycleConfig({
          ...(body?.settings || {}),
          ...(safeConfig.lifecycleConfig || {})
        });
      } catch {
        if (!controller.signal.aborted) {
          setLifecycleConfig(safeConfig.lifecycleConfig);
        }
      }
    }

    void loadLifecycleSettings();

    return () => controller.abort();
  }, [config]);

  function notifyOpenState(isOpen: boolean) {
    window.parent.postMessage({ type: "scout-chatbot:open-change", isOpen }, parentOriginRef.current);
  }

  function startWorkflow(workflow: { id: string }) {
    window.parent.postMessage(
      { type: "scout-chatbot:start-workflow", guideId: workflow.id },
      parentOriginRef.current
    );
  }

  function notifySize(size: { width: number; height: number }) {
    window.parent.postMessage(
      { type: "scout-chatbot:size-change", width: size.width, height: size.height },
      parentOriginRef.current
    );
  }

  function notifyMove(delta: { x: number; y: number }) {
    window.parent.postMessage(
      { type: "scout-chatbot:move-by", x: delta.x, y: delta.y },
      parentOriginRef.current
    );
  }

  function notifyRestore() {
    window.parent.postMessage({ type: "scout-chatbot:restore-layout" }, parentOriginRef.current);
  }

  async function sendMessage(message: string): Promise<ScoutChatMessage> {
    if (!config) throw new Error("Chatbot configuration is unavailable.");
    const configuredUserId = String(config.userId || "").trim();
    const effectiveUserId = configuredUserId;
    const clientTraceId = getClientTraceId();
    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/v1/chat/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({
        companyId: config.companyId,
        companyName: config.companyName,
        targetAppId: config.targetAppId || undefined,
        targetAppName: config.targetAppName || undefined,
        userId: effectiveUserId,
        clientTraceId,
        question: message,
        conversationId: conversationId || undefined,
        topK: 8
      })
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(typeof body?.message === "string" ? body.message : "Chatbot request failed.");
    const result = body?.result;
    if (typeof result?.conversation_id === "string") setConversationId(result.conversation_id);
    return {
      role: "assistant",
      text: typeof result?.answer === "string" ? result.answer : "I could not generate an answer.",
      queryId: typeof result?.query_id === "string" ? result.query_id : undefined,
      citations: Array.isArray(result?.citations) ? result.citations : [],
      noAnswer: result?.no_answer === true,
      noAnswerReason: typeof result?.no_answer_reason === "string" ? result.no_answer_reason : undefined
    };
  }

  return (
    <>
      <style>{`html,body{margin:0!important;background:transparent!important;overflow:hidden!important}`}</style>
      <div className="flex h-screen w-screen items-end justify-end bg-transparent p-3">
        {config ? (
          <ScoutChatbot
            assistantName={config.assistantName || "Scout Assistant"}
            apiKey={config.apiKey}
            companyId={config.companyId}
            conversationId={conversationId || undefined}
            defaultOpen={false}
            lifecycleConfig={lifecycleConfig}
            onConversationChange={setConversationId}
            onMoveBy={notifyMove}
            onOpenChange={notifyOpenState}
            onRestoreLayout={notifyRestore}
            onSendMessage={sendMessage}
            onSizeChange={notifySize}
            onStartWorkflow={startWorkflow}
            intentGateEndpoint={config.intentGateEndpoint}
            workflowRouterEndpoint={config.workflowRouterEndpoint}
            placeholder={config.placeholder || "Ask or request a workflow..."}
            quickPrompts={config.quickPrompts}
            scoutBaseUrl={config.scoutUrl}
            targetAppId={config.targetAppId}
            targetAppName={config.targetAppName}
            theme={theme}
            userId={String(config.userId || "").trim() || undefined}
            variant="embedded"
          />
        ) : null}
      </div>
    </>
  );
}
