import { getPool } from "@/lib/db/pool";
import type { ChatbotLifecycleSettings } from "./lifecycle-settings";

type StoredConversationMessage = {
  id: string;
  sender: "user" | "assistant" | "system";
  content: string;
  created_at: Date;
};

export type ConversationContextEntry = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type ConversationContextWindow = {
  summary: string | null;
  messages: ConversationContextEntry[];
  estimatedTokens: number;
};

export function estimateTextTokens(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return 0;
  }

  return Math.max(1, Math.ceil(compact.length / 4));
}

export function trimConversationMessagesForContext(
  messages: ConversationContextEntry[],
  settings: ChatbotLifecycleSettings
): ConversationContextWindow {
  const recent = messages.slice(-Math.max(1, settings.maxContextMessages));
  const selected: ConversationContextEntry[] = [];
  let totalTokens = 0;

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const message = recent[index];
    const messageTokens = estimateTextTokens(message.content);

    if (selected.length > 0 && totalTokens + messageTokens > settings.maxContextTokens) {
      continue;
    }

    selected.unshift(message);
    totalTokens += messageTokens;
  }

  return {
    summary: null,
    messages: selected,
    estimatedTokens: totalTokens
  };
}

export async function buildConversationContextWindow(input: {
  companyId: string;
  conversationId: string;
  settings: ChatbotLifecycleSettings;
}) {
  const limit = Math.max(input.settings.maxContextMessages * 2, 30);
  const result = await getPool().query<StoredConversationMessage>(
    `
      SELECT id, sender, content, created_at
      FROM conversation_messages
      WHERE company_id = $1
        AND conversation_id = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
    [input.companyId, input.conversationId, limit]
  );

  const chronological = result.rows
    .reverse()
    .map((row) => ({ role: row.sender, content: row.content } satisfies ConversationContextEntry));

  return trimConversationMessagesForContext(chronological, input.settings);
}
