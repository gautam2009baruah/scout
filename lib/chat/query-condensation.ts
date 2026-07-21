import { getLLMProvider, INSUFFICIENT_CONTEXT_MESSAGE } from "@/lib/llm/providers";
import type { ConversationContextEntry } from "./context-manager";

const CONDENSATION_TIMEOUT_MS = 10000;

function buildCondensationSystemPrompt() {
  return [
    "Rewrite the user's latest question into a fully self-contained search query using the conversation history for context.",
    "Resolve pronouns and implicit references such as \"it\", \"that\", or \"what about the bank\".",
    "Output only the rewritten query text, with no preamble, quotes, or explanation.",
    "Do not answer the question."
  ].join(" ");
}

function buildTranscript(messages: ConversationContextEntry[]) {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n");
}

function buildCondensationUserPrompt(question: string, transcript: string) {
  return [
    "Conversation history:",
    transcript,
    "",
    "Latest question:",
    question,
    "",
    "Rewritten standalone query:"
  ].join("\n");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Query condensation timed out after ${ms}ms.`)), ms);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

export type CondensedQuery = {
  retrievalQuery: string;
  condensed: boolean;
};

/**
 * Rewrites a follow-up question into a standalone search query using recent
 * conversation turns, so retrieval can resolve pronouns/implicit references
 * (e.g. "what about the bank?") instead of searching for those words literally.
 * Falls back to the raw question on the first turn, or if the rewrite fails.
 */
export async function condenseQuestionForRetrieval(input: {
  question: string;
  conversationMessages: ConversationContextEntry[];
}): Promise<CondensedQuery> {
  const { question, conversationMessages } = input;

  if (conversationMessages.length === 0) {
    return { retrievalQuery: question, condensed: false };
  }

  try {
    const transcript = buildTranscript(conversationMessages);
    const provider = await getLLMProvider();
    const rewritten = await withTimeout(
      provider.generate_answer(
        buildCondensationSystemPrompt(),
        buildCondensationUserPrompt(question, transcript),
        transcript
      ),
      CONDENSATION_TIMEOUT_MS
    );
    const cleaned = rewritten.trim();

    if (!cleaned || cleaned === INSUFFICIENT_CONTEXT_MESSAGE) {
      return { retrievalQuery: question, condensed: false };
    }

    return { retrievalQuery: cleaned, condensed: true };
  } catch (error) {
    console.error("[Chat] Query condensation failed; falling back to the raw question.", error);
    return { retrievalQuery: question, condensed: false };
  }
}
