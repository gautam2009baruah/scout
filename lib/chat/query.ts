import { getPool } from "@/lib/db/pool";
import { getLLMProvider, INSUFFICIENT_CONTEXT_MESSAGE, type LLMContextItem } from "@/lib/llm/providers";
import { RetrievalEngine } from "@/lib/search/retrieval-engine";
import type { Citation } from "@/lib/search/citation-engine";
import { appendConversationExchange, getOrCreateConversation } from "./conversations";
import { matchChatbotTriggers, shouldCheckTriggers } from "@/lib/orchestrations/chatbot-trigger-matcher";
import { createExecution } from "@/lib/orchestrations/db";

export type ChatQueryInput = {
  company_id: string;
  user_id: string;
  question: string;
  conversation_id?: string;
  top_k?: number;
};

export type ChatQueryResponse = {
  answer: string;
  citations: Citation[];
  conversation_id: string;
  retrieved_chunk_count: number;
  orchestration_trigger?: {
    triggerId: string;
    orchestrationId: string;
    orchestrationName: string;
    executionId?: string;
    requiresConfirmation: boolean;
    confidence: number;
  };
  matchedPhrase?: string;
  matchedIntent?: string;
};

export class ChatQueryError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "ChatQueryError";
    this.statusCode = statusCode;
  }
}

async function validateCompany(companyId: string) {
  const result = await getPool().query<{ id: string }>(
    "SELECT id FROM companies WHERE id = $1 AND deleted_at IS NULL AND status = 'active'",
    [companyId]
  );

  if (!result.rows[0]) {
    throw new ChatQueryError("Company was not found or is not active.", 404);
  }
}

async function validateUserForCompany(companyId: string, userId: string): Promise<{ email: string }> {
  const result = await getPool().query<{ id: string; status: string; email: string }>(
    `
      SELECT users.id, users.status, users.email
      FROM users
      WHERE users.id = $1
        AND users.deleted_at IS NULL
        AND (
          users.company_id = $2
          OR EXISTS (
            SELECT 1
            FROM user_company_roles
            WHERE user_company_roles.user_id = users.id
              AND user_company_roles.company_id = $2
              AND user_company_roles.deleted_at IS NULL
          )
        )
      LIMIT 1
    `,
    [userId, companyId]
  );

  const user = result.rows[0];

  if (!user) {
    throw new ChatQueryError("User was not found for this company.", 404);
  }

  if (user.status !== "active") {
    throw new ChatQueryError("User is not active.", 403);
  }
  
  return { email: user.email };
}

function buildSystemPrompt() {
  return [
    "You are Scout's document question answering assistant.",
    "Use only the retrieved document context to answer the user's question.",
    "Do not use outside knowledge.",
    "Keep the answer concise and cite-ready."
  ].join(" ");
}

function buildLLMContext(chunks: Awaited<ReturnType<typeof RetrievalEngine.retrieve>>["chunks"]): LLMContextItem[] {
  return chunks.map((chunk) => ({
    content: chunk.content,
    document_name: chunk.document_name,
    folder_path: chunk.folder_path,
    page_number: chunk.page_number,
    section_title: chunk.section_title,
    chunk_id: chunk.chunk_id
  }));
}

function cleanExtractedValue(value: string) {
  return value
    .replace(/^[\s:.-]+/, "")
    .replace(/[\s,;.)\]]+$/, "")
    .trim();
}

function findLabeledValue(content: string, labels: string[], valuePattern: string) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}\\s*[:\\-–]?\\s*(${valuePattern})`, "i");
    const match = content.match(pattern);

    if (match?.[1]) {
      return cleanExtractedValue(match[1]);
    }
  }

  return null;
}

function findBankName(content: string) {
  const knownBanks = [
    "Bank of Baroda",
    "State Bank of India",
    "SBI",
    "HDFC Bank",
    "ICICI Bank",
    "Axis Bank",
    "Punjab National Bank",
    "Canara Bank",
    "Kotak Mahindra Bank",
    "IDFC First Bank",
    "Yes Bank"
  ];
  const normalizedContent = content.toLowerCase();

  for (const bank of knownBanks) {
    if (normalizedContent.includes(bank.toLowerCase())) {
      return bank === "SBI" ? "State Bank of India" : bank;
    }
  }

  if (/\bbaroda\s+home\s+loan\b/i.test(content) || /\bcM+kSnk\s+x`g\s+_.k\b/i.test(content)) {
    return "Bank of Baroda";
  }

  const labeledBank = findLabeledValue(content, ["bank", "lender", "financier"], "[A-Za-z][A-Za-z &.]{2,60}");

  return labeledBank;
}

function buildExtractiveAnswer(
  question: string,
  chunks: Awaited<ReturnType<typeof RetrievalEngine.retrieve>>["chunks"]
) {
  const normalizedQuestion = question.toLowerCase();
  const context = chunks.map((chunk) => chunk.content).join("\n");
  let value: string | null = null;
  let label = "";

  if (/\b(mobile|phone|contact)\b/.test(normalizedQuestion)) {
    value =
      findLabeledValue(context, ["mobile\\s*(?:number|no)?", "phone\\s*(?:number|no)?", "contact\\s*(?:number|no)?"], "[+()\\d\\s-]{8,20}")
      ?? context.match(/(?:\+?\d[\d\s-]{8,}\d)/)?.[0]
      ?? null;
    label = "mobile number";
  } else if (/\bpolicy\b/.test(normalizedQuestion) && /\b(number|no|id)\b/.test(normalizedQuestion)) {
    value = findLabeledValue(context, ["policy\\s*(?:number|no|id)"], "[A-Za-z0-9/-]{4,40}");
    label = "policy number";
  } else if (/\bcustomer\b/.test(normalizedQuestion) && /\b(id|number|no)\b/.test(normalizedQuestion)) {
    value = findLabeledValue(context, ["customer\\s*(?:id|number|no)"], "[A-Za-z0-9/-]{4,40}");
    label = "customer id";
  } else if (/\bemail\b|\be-mail\b/.test(normalizedQuestion)) {
    value = context.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
    label = "email address";
  } else if (/\bbank\b|\blender\b|\bfinancier\b/.test(normalizedQuestion)) {
    value = findBankName(context);
    label = "bank";
  }

  if (!value || !label) {
    return null;
  }

  return `The ${label} is ${cleanExtractedValue(value)}.`;
}

function isGreetingOnly(question: string) {
  const normalized = question.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(hi|hello|hey|hola|namaste|good morning|good afternoon|good evening)$/.test(normalized);
}

export async function answerChatQuery(input: ChatQueryInput): Promise<ChatQueryResponse> {
  const companyId = input.company_id.trim();
  const userId = input.user_id.trim();
  const question = input.question.trim();
  const topK = Math.min(20, Math.max(1, Number(input.top_k) || 5));

  if (!companyId) {
    throw new ChatQueryError("Company is required.");
  }

  if (!userId) {
    throw new ChatQueryError("User is required.");
  }

  if (!question) {
    throw new ChatQueryError("Question is required.");
  }

  await validateCompany(companyId);
  const user = await validateUserForCompany(companyId, userId);
  const conversationId = await getOrCreateConversation({
    companyId,
    userId,
    conversationId: input.conversation_id?.trim() || undefined,
    firstQuestion: question
  });

  const startedAt = Date.now();

  // Store orchestration trigger match (if found) but don't return early
  let orchestrationMatch: {
    triggerId: string;
    orchestrationId: string;
    orchestrationName: string;
    executionId?: string;
    requiresConfirmation: boolean;
    confidence: number;
  } | null = null;

  // OPTIMIZATION: Pre-filter for orchestration triggers
  // Only check triggers for action-oriented messages (saves 70-90% of LLM calls)
  console.log(`🔍 Checking if message should check triggers: "${question}"`);
  const passedFilter = shouldCheckTriggers(question);
  console.log(`🔍 Pre-filter result: ${passedFilter}`);
  
  if (passedFilter) {
    console.log('🎯 Message passed pre-filter, checking orchestration triggers...');
    
    try {
      const triggerMatch = await matchChatbotTriggers(
        question,
        userId,
        user.email,
        companyId
      );

      console.log('🔍 Trigger match result:', triggerMatch);

      if (triggerMatch && !triggerMatch.requiresConfirmation) {
        console.log(`✅ Matched orchestration: ${triggerMatch.orchestrationName} (confidence: ${triggerMatch.confidence})`);
        
        // Create execution for auto-execute orchestration
        const execution = await createExecution({
          orchestrationId: triggerMatch.orchestrationId,
          orchestrationVersion: 1,
          context: triggerMatch.extractedVariables,
          triggerData: {
            triggerType: 'chatbot',
            triggerId: triggerMatch.triggerId,
            userMessage: question,
            matchedPhrase: triggerMatch.matchedPhrase,
            intent: triggerMatch.intent,
            matchedIntent: triggerMatch.intent,
            confidence: triggerMatch.confidence
          },
          triggeredBy: user.email
        });

        // Store for later inclusion in response
        orchestrationMatch = {
          triggerId: triggerMatch.triggerId,
          orchestrationId: triggerMatch.orchestrationId,
          orchestrationName: triggerMatch.orchestrationName,
          executionId: execution.id,
          requiresConfirmation: false,
          confidence: triggerMatch.confidence
        };
        
        console.log('✅ Orchestration match stored, continuing to workflow check...');
      } else if (triggerMatch && triggerMatch.requiresConfirmation) {
        console.log('⚠️ Orchestration requires confirmation, skipping combined response');
        // For confirmation flows, return early as before
        await appendConversationExchange({
          companyId,
          userId,
          conversationId,
          question,
          answer: triggerMatch.confirmationMessage,
          citations: [],
          metadata: {
            llm_provider: 'orchestration',
            llm_model: 'trigger-match',
            latency_ms: Date.now() - startedAt,
            retrieved_chunk_count: 0,
            token_usage_summary: null
          }
        });

        return {
          answer: triggerMatch.confirmationMessage,
          citations: [],
          conversation_id: conversationId,
          retrieved_chunk_count: 0,
          orchestration_trigger: {
            triggerId: triggerMatch.triggerId,
            orchestrationId: triggerMatch.orchestrationId,
            orchestrationName: triggerMatch.orchestrationName,
            requiresConfirmation: true,
            confidence: triggerMatch.confidence
          }
        };
      } else {
        console.log('ℹ️ No orchestration trigger matched');
      }
    } catch (error) {
      console.error('⚠️ Error checking orchestration triggers:', error);
      // Continue to normal RAG flow if trigger matching fails
    }
  } else {
    console.log('⏭️ Message skipped trigger check (casual chat)');
  }

  if (isGreetingOnly(question)) {
    const greeting = "Hi. Ask me a question about the available documents, and I will answer using only the information I can find there.";

    await appendConversationExchange({
      companyId,
      userId,
      conversationId,
      question,
      answer: greeting,
      citations: [],
      metadata: {
        llm_provider: "none",
        llm_model: "greeting",
        latency_ms: Date.now() - startedAt,
        retrieved_chunk_count: 0,
        token_usage_summary: null
      }
    });

    let modifiedGreeting = greeting;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedGreeting = orchestrationOption + greeting;
    }
    
    const response: ChatQueryResponse = {
      answer: modifiedGreeting,
      citations: [],
      conversation_id: conversationId,
      retrieved_chunk_count: 0
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;
    }
    
    return response;
  }

  const retrieval = await RetrievalEngine.retrieve(companyId, userId, question, topK);

  if (retrieval.chunks.length === 0) {
    await appendConversationExchange({
      companyId,
      userId,
      conversationId,
      question,
      answer: INSUFFICIENT_CONTEXT_MESSAGE,
      citations: [],
      metadata: {
        llm_provider: "none",
        llm_model: "none",
        latency_ms: Date.now() - startedAt,
        retrieved_chunk_count: 0,
        token_usage_summary: null
      }
    });

    let modifiedMessage = INSUFFICIENT_CONTEXT_MESSAGE;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedMessage = orchestrationOption + INSUFFICIENT_CONTEXT_MESSAGE;
    }
    
    const response: ChatQueryResponse = {
      answer: modifiedMessage,
      citations: [],
      conversation_id: conversationId,
      retrieved_chunk_count: 0
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;
    }
    
    return response;
  }

  const extractiveAnswer = buildExtractiveAnswer(question, retrieval.chunks);

  if (extractiveAnswer) {
    await appendConversationExchange({
      companyId,
      userId,
      conversationId,
      question,
      answer: extractiveAnswer,
      citations: retrieval.citations,
      metadata: {
        llm_provider: "none",
        llm_model: "extractive",
        latency_ms: Date.now() - startedAt,
        retrieved_chunk_count: retrieval.chunks.length,
        token_usage_summary: null
      }
    });

    let modifiedExtractiveAnswer = extractiveAnswer;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedExtractiveAnswer = orchestrationOption + extractiveAnswer;
    }
    
    const response: ChatQueryResponse = {
      answer: modifiedExtractiveAnswer,
      citations: retrieval.citations,
      conversation_id: conversationId,
      retrieved_chunk_count: retrieval.chunks.length
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;
    }
    
    return response;
  }

  const provider = await getLLMProvider();
  const answer = await provider.generate_answer(buildSystemPrompt(), question, buildLLMContext(retrieval.chunks));
  const finalAnswer = answer || INSUFFICIENT_CONTEXT_MESSAGE;

  await appendConversationExchange({
    companyId,
    userId,
    conversationId,
    question,
    answer: finalAnswer,
    citations: retrieval.citations,
    metadata: {
      llm_provider: provider.provider,
      llm_model: provider.model,
      latency_ms: Date.now() - startedAt,
      retrieved_chunk_count: retrieval.chunks.length,
      token_usage_summary: null
    }
  });

  // Include orchestration trigger if matched (alongside normal response)
  let modifiedAnswer = finalAnswer;
  
  if (orchestrationMatch) {
    console.log(`✅ Including orchestration trigger in response: ${orchestrationMatch.orchestrationName}`);
    
    // Prepend orchestration option to the answer
    const orchestrationOption = `\n\n**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start orchestration](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
    modifiedAnswer = orchestrationOption + finalAnswer;
  }
  
  const response: ChatQueryResponse = {
    answer: modifiedAnswer,
    citations: retrieval.citations,
    conversation_id: conversationId,
    retrieved_chunk_count: retrieval.chunks.length
  };

  if (orchestrationMatch) {
    response.orchestration_trigger = orchestrationMatch;
    response.matchedPhrase = question;
    response.matchedIntent = orchestrationMatch.orchestrationName;
  }

  return response;
}
