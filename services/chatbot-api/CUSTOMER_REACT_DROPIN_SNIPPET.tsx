"use client";

import React, { useMemo, useState } from "react";
import { ScoutChatbot, type ScoutChatMessage } from "@/components";

type CustomerDropInProps = {
  scoutApiBaseUrl: string;
  scoutApiKey: string;
  companyName: string;
  targetAppName?: string;
  userId: string;
  assistantName?: string;
};

/**
 * Drop-in React chatbot widget for customer applications.
 *
 * WARNING:
 * This version calls Scout API directly from browser and exposes scoutApiKey in client code.
 * Only use with a key that is origin-restricted, rate-limited, and revocable.
 */
export function CustomerScoutChatbotDropIn({
  scoutApiBaseUrl,
  scoutApiKey,
  companyName,
  targetAppName,
  userId,
  assistantName = "Assistant"
}: CustomerDropInProps) {
  const [conversationId, setConversationId] = useState("");

  const widgetTheme = useMemo(
    () => ({
      brandColor: "#0f172a",
      accentColor: "#0ea5e9",
      surfaceColor: "#ffffff"
    }),
    []
  );

  async function handleSendMessage(message: string): Promise<ScoutChatMessage> {
    const response = await fetch(`${scoutApiBaseUrl.replace(/\/$/, "")}/v1/chat/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": scoutApiKey
      },
      body: JSON.stringify({
        companyName,
        targetAppName,
        userId,
        question: message,
        conversationId: conversationId || undefined,
        topK: 8
      })
    });

    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(typeof body?.message === "string" ? body.message : "Chatbot request failed.");
    }

    const result = body?.result;

    if (typeof result?.conversation_id === "string") {
      setConversationId(result.conversation_id);
    }

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
    <ScoutChatbot
      variant="floating"
      position="bottom-right"
      assistantName={assistantName}
      userId={userId}
      companyId={undefined}
      targetAppName={targetAppName}
      placeholder="Ask me anything"
      quickPrompts={[
        "Show me process steps",
        "Find the right policy",
        "Summarize required documents"
      ]}
      theme={widgetTheme}
      onSendMessage={handleSendMessage}
      onConversationChange={setConversationId}
    />
  );
}

/**
 * Minimal usage example in customer app:
 *
 * export default function CustomerPage() {
 *   return (
 *     <>
 *       <main>Your app UI...</main>
 *       <CustomerScoutChatbotDropIn
 *         scoutApiBaseUrl={process.env.NEXT_PUBLIC_SCOUT_API_BASE_URL!}
 *         scoutApiKey={process.env.NEXT_PUBLIC_SCOUT_API_KEY!}
 *         companyName={"Acme Corp"}
 *         targetAppName={"Customer Portal"}
 *         userId={"end-user-123"}
 *         assistantName={"Acme Assistant"}
 *       />
 *     </>
 *   );
 * }
 */
