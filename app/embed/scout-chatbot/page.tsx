"use client";

import { useEffect, useRef, useState } from "react";
import { ScoutChatbot, type ScoutChatLifecycleConfig, type ScoutChatMessage } from "@/components/scout-chatbot";

type EmbedConfig = {
  scoutUrl: string;
  apiUrl: string;
  apiKey: string;
  companyId: string;
  companyName: string;
  userId: string;
  targetAppId?: string;
  targetAppName?: string;
  assistantName?: string;
  autoLoadLifecycleSettings?: boolean;
  brandColor?: string;
  accentColor?: string;
  lifecycleConfig?: ScoutChatLifecycleConfig;
  placeholder?: string;
  quickPrompts?: string[];
  intentGateEndpoint?: string;
  workflowRouterEndpoint?: string;
};

export default function EmbeddedScoutChatbotPage() {
  const [config, setConfig] = useState<EmbedConfig | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [lifecycleConfig, setLifecycleConfig] = useState<ScoutChatLifecycleConfig | undefined>(undefined);
  const parentOriginRef = useRef("*");

  useEffect(() => {
    function receiveConfig(event: MessageEvent) {
      if (event.source !== window.parent || event.data?.type !== "scout-chatbot:configure") return;
      const next = event.data.config as EmbedConfig;
      if (!next?.apiUrl || !next.apiKey || !next.companyId || !next.companyName || !next.userId) return;
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
            companyName: safeConfig.companyName,
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
    const response = await fetch(`${config.apiUrl.replace(/\/$/, "")}/v1/chat/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": config.apiKey },
      body: JSON.stringify({
        companyName: config.companyName,
        targetAppName: config.targetAppName || undefined,
        userId: config.userId,
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
            companyId={config.companyId}
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
            theme={{
              brandColor: config.brandColor || "#111827",
              accentColor: config.accentColor || "#0ea5e9",
              surfaceColor: "#ffffff"
            }}
            userId={config.userId}
            variant="embedded"
          />
        ) : null}
      </div>
    </>
  );
}
