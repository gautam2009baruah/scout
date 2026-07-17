import { getPool } from "@/lib/db/pool";
import { getLLMProvider, INSUFFICIENT_CONTEXT_MESSAGE, type LLMContextItem } from "@/lib/llm/providers";
import { buildConversationContextWindow } from "@/lib/chat/context-manager";
import { getEffectiveChatbotLifecycleSettings } from "@/lib/chat/lifecycle-settings";
import { RetrievalEngine } from "@/lib/search/retrieval-engine";
import type { Citation } from "@/lib/search/citation-engine";
import { isAnswerGrounded, shouldRequireCitations } from "@/lib/search/grounding";
import { appendConversationExchange, getConversationLifecycleState, getOrCreateConversation } from "./conversations";
import { matchChatbotTriggers, shouldCheckTriggers } from "@/lib/orchestrations/chatbot-trigger-matcher";
import { createExecution } from "@/lib/orchestrations/db";
import { buildEstimatedTokenUsage, recordChatQueryTelemetry } from "./telemetry";
import { randomUUID } from "node:crypto";

export type ChatQueryInput = {
  company_id: string;
  user_id: string;
  question: string;
  target_app_id?: string;
  conversation_id?: string;
  top_k?: number;
  external_user_trace_id?: string;
};

export type ChatQueryResponse = {
  query_id: string;
  answer: string;
  citations: Citation[];
  conversation_id: string;
  no_answer: boolean;
  no_answer_reason?: string;
  latency_ms: number;
  token_usage: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    estimated_cost_usd: number | null;
  };
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

function isGuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
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

function toTriggerUserEmail(userId: string) {
  const normalized = userId.trim();
  if (normalized.includes("@")) {
    return normalized;
  }

  return `${normalized}@external-client.user`;
}

async function canPersistConversationForUser(companyId: string, userId: string) {
  const result = await getPool().query<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
       FROM users u
       INNER JOIN user_company_roles ucr
         ON ucr.user_id = u.id
        AND ucr.company_id = $1
        AND ucr.deleted_at IS NULL
        AND ucr.status = 'active'
       WHERE u.id = $2
         AND u.deleted_at IS NULL
         AND u.status = 'active'
     ) AS allowed`,
    [companyId, userId]
  );

  return result.rows[0]?.allowed === true;
}

function buildSystemPrompt() {
  return [
    "You are Scout's document question answering assistant.",
    "Use only the retrieved document context to answer the user's question.",
    "Do not use outside knowledge.",
    "Every factual claim must be supported by retrieved evidence.",
    "If evidence is weak or missing, return the insufficient-context response.",
    "Keep the answer concise and cite-ready."
  ].join(" ");
}

function buildUserPrompt(question: string, recentMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>) {
  if (recentMessages.length === 0) {
    return question;
  }

  const transcript = recentMessages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  return [
    "Recent conversation context:",
    transcript,
    "",
    "Current user question:",
    question
  ].join("\n");
}

function buildLLMContext(chunks: Awaited<ReturnType<typeof RetrievalEngine.retrieve>>["chunks"]): LLMContextItem[] {
  return chunks.map((chunk) => ({
    content: chunk.content,
    document_name: chunk.document_name,
    folder_path: chunk.folder_path,
    page_number: chunk.page_number,
    section_title: chunk.section_title,
    section_path: chunk.section_path,
    chunk_id: chunk.chunk_id
  }));
}

function buildRetrievalDiagnostics(
  retrieval: Awaited<ReturnType<typeof RetrievalEngine.retrieve>>,
  options: {
    topK: number;
    targetAppId?: string;
  }
) {
  return {
    normalizedQuery: retrieval.query,
    topK: options.topK,
    targetAppId: options.targetAppId || null,
    retrievedChunkCount: retrieval.chunks.length,
    citationCount: retrieval.citations.length,
    attempts: retrieval.diagnostics?.attempts ?? [],
    matchedSynonymGroups: retrieval.diagnostics?.matchedSynonymGroups ?? [],
    filterDiagnostics: retrieval.diagnostics?.filterDiagnostics ?? null,
    chunkPaths: retrieval.chunks.slice(0, options.topK).map((chunk) => ({
      chunk_id: chunk.chunk_id,
      document_id: chunk.document_id,
      document_name: chunk.document_name,
      folder_path: chunk.folder_path,
      page_number: chunk.page_number,
      section_title: chunk.section_title,
      score: chunk.score,
      citation_type: chunk.citation_type || "text",
      visual_asset_type: chunk.visual_asset_type || null,
    })),
  };
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
  const topK = Math.min(8, Math.max(5, Number(input.top_k) || 8));
  const externalUserTraceId = String(input.external_user_trace_id || "").trim();

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
  const triggerUserEmail = toTriggerUserEmail(userId);
  const canPersistConversation = isGuid(userId)
    ? await canPersistConversationForUser(companyId, userId)
    : false;
  const lifecycleSettings = await getEffectiveChatbotLifecycleSettings(companyId, input.target_app_id?.trim() || undefined);
  let requestedConversationId = input.conversation_id?.trim() || undefined;

  if (requestedConversationId && canPersistConversation) {
    const lifecycleState = await getConversationLifecycleState({
      companyId,
      userId,
      conversationId: requestedConversationId,
      skipUserValidation: true,
    });
    const referenceTime = lifecycleState?.last_message_at ?? lifecycleState?.created_at ?? null;

    if (referenceTime) {
      const ageSeconds = Math.max(0, (Date.now() - referenceTime.getTime()) / 1000);
      if (ageSeconds >= lifecycleSettings.inactivityTimeoutSeconds) {
        requestedConversationId = undefined;
      }
    }
  }

  const conversationId = canPersistConversation
    ? await getOrCreateConversation({
      companyId,
      userId,
      conversationId: requestedConversationId,
      firstQuestion: question,
      skipUserValidation: true,
    })
    : (requestedConversationId || randomUUID());

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
  let triggerClarification: {
    orchestrationName: string;
    missingVariables: string[];
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
        triggerUserEmail,
        companyId
      );

      console.log('🔍 Trigger match result:', triggerMatch);

      if (triggerMatch) {
        console.log(`✅ Matched orchestration: ${triggerMatch.orchestrationName} (confidence: ${triggerMatch.confidence})`);

        if (triggerMatch.missingVariables.length > 0) {
          console.log(
            `⚠️ Matched trigger has missing required variables: ${triggerMatch.missingVariables.join(", ")}`
          );
          triggerClarification = {
            orchestrationName: triggerMatch.orchestrationName,
            missingVariables: triggerMatch.missingVariables,
          };
        } else {
        
          // Create execution for matched orchestration
          const execution = await createExecution({
            orchestrationId: triggerMatch.orchestrationId,
            orchestrationVersion: 1,
            context: triggerMatch.extractedVariables,
            triggerData: {
              triggerType: 'chatbot',
              triggerId: triggerMatch.triggerId,
              userMessage: question,
              matchedPhrase: triggerMatch.matchedPhrase,
              confidence: triggerMatch.confidence
            },
            triggeredBy: triggerUserEmail
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
        }
        
        console.log('✅ Orchestration match stored, continuing to workflow check...');
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

  if (triggerClarification) {
    const missingLabel = triggerClarification.missingVariables.join(", ");
    const clarificationAnswer = `I can run \"${triggerClarification.orchestrationName}\", but I still need: ${missingLabel}. Please share that and I will continue.`;
    const latencyMs = Date.now() - startedAt;

    if (canPersistConversation) {
      await appendConversationExchange({
        companyId,
        userId,
        conversationId,
        question,
        answer: clarificationAnswer,
        citations: [],
        metadata: {
          llm_provider: "none",
          llm_model: "trigger_clarification",
          latency_ms: latencyMs,
          retrieved_chunk_count: 0,
          token_usage_summary: null,
          missing_required_variables: triggerClarification.missingVariables,
          target_orchestration: triggerClarification.orchestrationName,
        }
      });
    }

    const queryId = await recordChatQueryTelemetry({
      target_app_id: input.target_app_id?.trim() || undefined,
      user_id: userId,
      conversation_id: conversationId,
      question,
      answer: clarificationAnswer,
      answer_status: "answered",
      retrieved_chunk_count: 0,
      citations: [],
      llm_provider: "none",
      llm_model: "trigger_clarification",
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      metadata: {
        mode: "trigger_clarification",
        externalUserTraceId: externalUserTraceId || undefined,
        missingRequiredVariables: triggerClarification.missingVariables,
        orchestrationName: triggerClarification.orchestrationName,
      },
    });

    return {
      query_id: queryId,
      answer: clarificationAnswer,
      citations: [],
      conversation_id: conversationId,
      no_answer: false,
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      retrieved_chunk_count: 0,
    };
  }

  if (isGreetingOnly(question)) {
    const greeting = "Hi. Ask me a question about the available documents, and I will answer using only the information I can find there.";
    const latencyMs = Date.now() - startedAt;

    if (canPersistConversation) {
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
          latency_ms: latencyMs,
          retrieved_chunk_count: 0,
          token_usage_summary: null
        }
      });
    }

    const queryId = await recordChatQueryTelemetry({
      target_app_id: input.target_app_id?.trim() || undefined,
      user_id: userId,
      conversation_id: conversationId,
      question,
      answer: greeting,
      answer_status: "answered",
      retrieved_chunk_count: 0,
      citations: [],
      llm_provider: "none",
      llm_model: "greeting",
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      metadata: {
        mode: "greeting",
        externalUserTraceId: externalUserTraceId || undefined,
      },
    });

    let modifiedGreeting = greeting;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedGreeting = orchestrationOption + greeting;
    }
    
    const response: ChatQueryResponse = {
      query_id: queryId,
      answer: modifiedGreeting,
      citations: [],
      conversation_id: conversationId,
      no_answer: false,
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      retrieved_chunk_count: 0
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;
      console.log('📤 [GREETING] Returning response with orchestration_trigger.executionId:', response.orchestration_trigger?.executionId);
    }
    
    return response;
  }

  const retrieval = await RetrievalEngine.retrieve(companyId, userId, question, topK, input.target_app_id?.trim() || undefined);

  if (retrieval.chunks.length === 0) {
    const latencyMs = Date.now() - startedAt;
    if (canPersistConversation) {
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
          latency_ms: latencyMs,
          retrieved_chunk_count: 0,
          token_usage_summary: null
        }
      });
    }

    const queryId = await recordChatQueryTelemetry({
      target_app_id: input.target_app_id?.trim() || undefined,
      user_id: userId,
      conversation_id: conversationId,
      question,
      answer: INSUFFICIENT_CONTEXT_MESSAGE,
      answer_status: "no_answer",
      no_answer_reason: "no_retrieval_chunks",
      retrieved_chunk_count: 0,
      citations: [],
      llm_provider: "none",
      llm_model: "none",
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      metadata: {
        mode: "no_retrieval_chunks",
        externalUserTraceId: externalUserTraceId || undefined,
        retrievalDiagnostics: {
          topK,
          targetAppId: input.target_app_id?.trim() || null,
          retrievedChunkCount: 0,
          citationCount: 0,
          chunkPaths: [],
        },
      },
    });

    let modifiedMessage = INSUFFICIENT_CONTEXT_MESSAGE;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedMessage = orchestrationOption + INSUFFICIENT_CONTEXT_MESSAGE;
    }
    
    const response: ChatQueryResponse = {
      query_id: queryId,
      answer: modifiedMessage,
      citations: [],
      conversation_id: conversationId,
      no_answer: true,
      no_answer_reason: "no_retrieval_chunks",
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      retrieved_chunk_count: 0
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;
      console.log('📤 [NO_CONTEXT] Returning response with orchestration_trigger.executionId:', response.orchestration_trigger?.executionId);
    }
    
    return response;
  }

  const extractiveAnswer = buildExtractiveAnswer(question, retrieval.chunks);

  if (extractiveAnswer) {
    const extractiveNeedsCitations = shouldRequireCitations(extractiveAnswer);
    const extractiveGrounded = isAnswerGrounded(extractiveAnswer, retrieval.chunks);
    const shouldRejectExtractive = (extractiveNeedsCitations && retrieval.citations.length === 0) || !extractiveGrounded;
    const extractiveFinalAnswer = shouldRejectExtractive ? INSUFFICIENT_CONTEXT_MESSAGE : extractiveAnswer;
    const extractiveNoAnswer = extractiveFinalAnswer === INSUFFICIENT_CONTEXT_MESSAGE;
    const extractiveCitations = extractiveNoAnswer ? [] : retrieval.citations;
    const latencyMs = Date.now() - startedAt;
    if (canPersistConversation) {
      await appendConversationExchange({
        companyId,
        userId,
        conversationId,
        question,
        answer: extractiveFinalAnswer,
        citations: extractiveCitations,
        metadata: {
          llm_provider: "none",
          llm_model: "extractive",
          latency_ms: latencyMs,
          retrieved_chunk_count: retrieval.chunks.length,
          token_usage_summary: null
        }
      });
    }

    const queryId = await recordChatQueryTelemetry({
      target_app_id: input.target_app_id?.trim() || undefined,
      user_id: userId,
      conversation_id: conversationId,
      question,
      answer: extractiveFinalAnswer,
      answer_status: extractiveNoAnswer ? "no_answer" : "answered",
      no_answer_reason: extractiveNoAnswer ? "insufficient_context_from_grounding" : undefined,
      retrieved_chunk_count: retrieval.chunks.length,
      citations: extractiveCitations,
      llm_provider: "none",
      llm_model: "extractive",
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      metadata: {
        mode: "extractive",
        externalUserTraceId: externalUserTraceId || undefined,
        retrievalDiagnostics: buildRetrievalDiagnostics(retrieval, {
          topK,
          targetAppId: input.target_app_id?.trim() || undefined,
        }),
      },
    });

    let modifiedExtractiveAnswer = extractiveAnswer;
    modifiedExtractiveAnswer = extractiveFinalAnswer;
    
    if (orchestrationMatch) {
      const orchestrationOption = `**🎯 Orchestration Available:**\n**"${orchestrationMatch.orchestrationName}"** - Execute with data capture\n[Click here to start](#orchestration:${orchestrationMatch.executionId})\n\n---\n\n`;
      modifiedExtractiveAnswer = orchestrationOption + extractiveFinalAnswer;
    }
    
    const response: ChatQueryResponse = {
      query_id: queryId,
      answer: modifiedExtractiveAnswer,
      citations: extractiveCitations,
      conversation_id: conversationId,
      no_answer: extractiveNoAnswer,
      no_answer_reason: extractiveNoAnswer ? "insufficient_context_from_grounding" : undefined,
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        estimated_cost_usd: 0,
      },
      retrieved_chunk_count: retrieval.chunks.length
    };
    
    if (orchestrationMatch) {
      response.orchestration_trigger = orchestrationMatch;
      response.matchedPhrase = question;
      response.matchedIntent = orchestrationMatch.orchestrationName;      console.log('📤 [EXTRACTIVE] Returning response with orchestration_trigger.executionId:', response.orchestration_trigger?.executionId);    }
    
    return response;
  }

  const provider = await getLLMProvider();
  const systemPrompt = buildSystemPrompt();
  const conversationWindow = canPersistConversation
    ? await buildConversationContextWindow({
      companyId,
      conversationId,
      settings: lifecycleSettings
    })
    : { messages: [], estimatedTokens: 0, summary: null };
  const llmContext = buildLLMContext(retrieval.chunks);
  const answer = await provider.generate_answer(systemPrompt, buildUserPrompt(question, conversationWindow.messages), llmContext);
  const generatedAnswer = answer || INSUFFICIENT_CONTEXT_MESSAGE;
  const requiresCitations = shouldRequireCitations(generatedAnswer);
  const grounded = isAnswerGrounded(generatedAnswer, retrieval.chunks);
  const blockedByEvidence = (requiresCitations && retrieval.citations.length === 0) || !grounded;
  const finalAnswer = blockedByEvidence ? INSUFFICIENT_CONTEXT_MESSAGE : generatedAnswer;
  const noAnswer = finalAnswer === INSUFFICIENT_CONTEXT_MESSAGE;
  const noAnswerReason = noAnswer
    ? (blockedByEvidence ? "insufficient_context_from_grounding" : "insufficient_context_from_llm")
    : undefined;
  const acceptedCitations = noAnswer ? [] : retrieval.citations;
  const latencyMs = Date.now() - startedAt;
  const tokenUsage = buildEstimatedTokenUsage({
    provider: provider.provider,
    model: provider.model,
    systemPrompt,
    question,
    contextText: llmContext.map((item) => item.content).join("\n\n"),
    answerText: finalAnswer,
  });

  if (canPersistConversation) {
    await appendConversationExchange({
      companyId,
      userId,
      conversationId,
      question,
      answer: finalAnswer,
      citations: acceptedCitations,
      metadata: {
        llm_provider: provider.provider,
        llm_model: provider.model,
        latency_ms: latencyMs,
        retrieved_chunk_count: retrieval.chunks.length,
        token_usage_summary: tokenUsage
      }
    });
  }

  const queryId = await recordChatQueryTelemetry({
    target_app_id: input.target_app_id?.trim() || undefined,
    user_id: userId,
    conversation_id: conversationId,
    question,
    answer: finalAnswer,
    answer_status: noAnswer ? "no_answer" : "answered",
    no_answer_reason: noAnswerReason,
    retrieved_chunk_count: retrieval.chunks.length,
    citations: acceptedCitations,
    llm_provider: provider.provider,
    llm_model: provider.model,
    latency_ms: latencyMs,
    token_usage: tokenUsage,
    metadata: {
      mode: "llm",
      externalUserTraceId: externalUserTraceId || undefined,
      retrievalDiagnostics: buildRetrievalDiagnostics(retrieval, {
        topK,
        targetAppId: input.target_app_id?.trim() || undefined,
      }),
        conversationContext: {
          messageCount: conversationWindow.messages.length,
          estimatedTokens: conversationWindow.estimatedTokens,
          summarized: conversationWindow.summary !== null
        }
    },
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
    query_id: queryId,
    answer: modifiedAnswer,
    citations: acceptedCitations,
    conversation_id: conversationId,
    no_answer: noAnswer,
    no_answer_reason: noAnswerReason,
    latency_ms: latencyMs,
    token_usage: tokenUsage,
    retrieved_chunk_count: retrieval.chunks.length
  };

  if (orchestrationMatch) {
    response.orchestration_trigger = orchestrationMatch;
    response.matchedPhrase = question;
    response.matchedIntent = orchestrationMatch.orchestrationName;
    console.log('📤 [LLM] Returning response with orchestration_trigger.executionId:', response.orchestration_trigger?.executionId);
  }

  return response;
}
