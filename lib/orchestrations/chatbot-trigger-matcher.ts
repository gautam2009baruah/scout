// Chatbot Trigger Matcher
// Matches user messages against chatbot trigger configurations

import { getPool } from "@/lib/db/pool";
import type { ChatbotTriggerConfig } from "@/shared/orchestrationTypes";
import { getLLMProvider } from "@/lib/llm/providers";

// In-memory cache for active triggers
let cachedTriggers: Array<{
  id: string;
  orchestration_id: string;
  orchestration_name: string;
  name: string;
  config: ChatbotTriggerConfig;
}> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Quick pre-filter to determine if message might be action-oriented
 * Reduces LLM API calls by 70-90% for casual chat
 */
export function shouldCheckTriggers(message: string): boolean {
  const normalized = message.toLowerCase().trim();
  
  // Skip very short messages
  if (normalized.length < 3) {
    return false;
  }
  
  // Skip common greetings and acknowledgments
  const casualPatterns = /^(hi|hey|hello|thanks|thank you|ok|okay|yes|no|sure|great|nice|cool|awesome|bye|goodbye)$/i;
  if (casualPatterns.test(normalized)) {
    return false;
  }
  
  // Check for action-oriented keywords
  const actionWords = /\b(process|create|generate|run|execute|handle|submit|approve|send|update|delete|start|stop|cancel|complete|finish|schedule|trigger|initiate|perform|do|make|build|review|check|validate|verify)\b/i;
  
  // Check for question patterns (might trigger info retrieval workflows)
  const hasQuestion = message.includes('?') || /\b(how|what|when|where|why|who|can you|could you|would you|will you)\b/i.test(message);
  
  return actionWords.test(message) || hasQuestion;
}

export type TriggerMatch = {
  triggerId: string;
  orchestrationId: string;
  orchestrationName: string;
  confidence: number;
  intent: string;
  matchedPhrase: string; // The actual user message that matched
  extractedVariables: Record<string, unknown>;
  requiresConfirmation: boolean;
  confirmationMessage: string;
  missingVariables: string[];
};

/**
 * Match a user message against all active chatbot triggers
 */
export async function matchChatbotTriggers(
  userMessage: string,
  userId: string,
  userEmail: string,
  companyId?: string
): Promise<TriggerMatch | null> {
  const pool = await getPool();
  
  // Check cache first
  const now = Date.now();
  let triggers: typeof cachedTriggers;
  
  if (cachedTriggers && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('✅ Using cached triggers');
    triggers = cachedTriggers;
  } else {
    console.log('🔄 Refreshing trigger cache');
    
    // Query with optional company filter
    const query = companyId
      ? `SELECT 
          t.id,
          t.orchestration_id,
          o.name as orchestration_name,
          t.name,
          t.config
         FROM orchestration_triggers t
         INNER JOIN orchestrations o ON o.id = t.orchestration_id
         WHERE t.trigger_type = 'chatbot'
           AND t.status = 'active'
           AND o.status = 'published'
           AND o.company_id = $1
           AND (t.config->>'enabled')::boolean = true
         ORDER BY t.created_at DESC`
      : `SELECT 
          t.id,
          t.orchestration_id,
          o.name as orchestration_name,
          t.name,
          t.config
         FROM orchestration_triggers t
         INNER JOIN orchestrations o ON o.id = t.orchestration_id
         WHERE t.trigger_type = 'chatbot'
           AND t.status = 'active'
           AND o.status = 'published'
           AND (t.config->>'enabled')::boolean = true
         ORDER BY t.created_at DESC`;
    
    const result = await pool.query<{
      id: string;
      orchestration_id: string;
      orchestration_name: string;
      name: string;
      config: ChatbotTriggerConfig;
    }>(query, companyId ? [companyId] : []);
    
    cachedTriggers = result.rows;
    cacheTimestamp = now;
    triggers = cachedTriggers;
  }
  
  if (!triggers || triggers.length === 0) {
    return null;
  }
  
  // Use AI to match intent
  const bestMatch = await findBestIntentMatch(userMessage, triggers);
  
  if (!bestMatch) {
    return null;
  }
  
  const { trigger, confidence, extractedVariables } = bestMatch;
  const config = trigger.config;
  
  // Check if confidence meets threshold
  if (confidence < config.minConfidence) {
    console.log(`Intent match confidence ${confidence} below threshold ${config.minConfidence}`);
    return null;
  }
  
  // Check role/user restrictions
  if (config.allowedRoles && config.allowedRoles.length > 0) {
    // TODO: Implement role checking
    // For now, skip role check
  }
  
  if (config.allowedUsers && config.allowedUsers.length > 0) {
    if (!config.allowedUsers.includes(userEmail)) {
      console.log(`User ${userEmail} not in allowed users list`);
      return null;
    }
  }
  
  // Check for missing required variables
  const missingVariables: string[] = [];
  if (config.requiredVariables) {
    for (const varDef of config.requiredVariables) {
      if (!(varDef.name in extractedVariables)) {
        missingVariables.push(varDef.name);
      }
    }
  }
  
  return {
    triggerId: trigger.id,
    orchestrationId: trigger.orchestration_id,
    orchestrationName: trigger.orchestration_name,
    confidence,
    intent: config.intentName,
    matchedPhrase: userMessage,
    extractedVariables,
    requiresConfirmation: config.confirmationRequired,
    confirmationMessage: config.confirmationMessage || 
      `I found an orchestration that can handle this: ${trigger.orchestration_name}. Do you want me to run it?`,
    missingVariables,
  };
}

/**
 * Use AI to find the best matching intent
 */
async function findBestIntentMatch(
  userMessage: string,
  triggers: Array<{
    id: string;
    orchestration_id: string;
    orchestration_name: string;
    name: string;
    config: ChatbotTriggerConfig;
  }>
): Promise<{
  trigger: typeof triggers[0];
  confidence: number;
  extractedVariables: Record<string, unknown>;
} | null> {
  // Build prompt for AI to match intent
  const intentDescriptions = triggers
    .map((t, idx) => {
      const config = t.config;
      return `${idx + 1}. Intent: "${config.intentName}"
   Description: ${t.name}
   Example phrases: ${config.examplePhrases.join(", ")}`;
    })
    .join("\n\n");
  
  const prompt = `You are an intent classification system. Given a user message, determine which intent (if any) it matches.

Available intents:
${intentDescriptions}

User message: "${userMessage}"

Respond with ONLY a JSON object in this format:
{
  "matchedIndex": <number 1-${triggers.length} or null if no match>,
  "confidence": <number between 0 and 1>,
  "extractedVariables": <object with any extracted variable values>
}

If the user message doesn't clearly match any intent, set matchedIndex to null and confidence to 0.`;
  
  try {
    const provider = await getLLMProvider();
    const response = await provider.generate_answer(
      "You are an intent classification system. Respond only with valid JSON.",
      prompt,
      ""
    );
    
    const parsed = JSON.parse(response);
    
    if (!parsed.matchedIndex || parsed.matchedIndex < 1 || parsed.matchedIndex > triggers.length) {
      return null;
    }
    
    const trigger = triggers[parsed.matchedIndex - 1];
    
    return {
      trigger,
      confidence: parsed.confidence || 0,
      extractedVariables: parsed.extractedVariables || {},
    };
  } catch (error) {
    console.error("Error matching intent with AI:", error);
    return null;
  }
}

/**
 * Log a chatbot trigger match
 */
export async function logChatbotMatch(params: {
  triggerId: string;
  orchestrationId: string;
  userMessage: string;
  matchedIntent: string;
  confidence: number;
  extractedVariables: Record<string, unknown>;
  confirmationRequired: boolean;
  userId?: string;
  userEmail?: string;
}) {
  const pool = await getPool();
  
  await pool.query(
    `INSERT INTO chatbot_trigger_matches
     (trigger_id, orchestration_id, user_message, matched_intent, confidence,
      extracted_variables, confirmation_required, user_id, user_email, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      params.triggerId,
      params.orchestrationId,
      params.userMessage,
      params.matchedIntent,
      params.confidence,
      JSON.stringify(params.extractedVariables),
      params.confirmationRequired,
      params.userId,
      params.userEmail,
      params.confirmationRequired ? "awaiting_confirmation" : "matched",
    ]
  );
}

/**
 * Update chatbot match status after confirmation
 */
export async function updateChatbotMatchStatus(
  triggerId: string,
  userMessage: string,
  status: "confirmed" | "rejected" | "executed" | "failed",
  executionId?: string,
  errorMessage?: string
) {
  const pool = await getPool();
  
  const fields = ["status = $3"];
  const values: unknown[] = [triggerId, userMessage, status];
  let paramIndex = 4;
  
  if (executionId) {
    fields.push(`execution_id = $${paramIndex}`);
    values.push(executionId);
    paramIndex++;
  }
  
  if (errorMessage) {
    fields.push(`error_message = $${paramIndex}`);
    values.push(errorMessage);
    paramIndex++;
  }
  
  if (status === "executed" || status === "confirmed") {
    fields.push(`executed_at = NOW()`);
  }
  
  if (status === "confirmed") {
    fields.push(`confirmation_given = true`);
  } else if (status === "rejected") {
    fields.push(`confirmation_given = false`);
  }
  
  await pool.query(
    `UPDATE chatbot_trigger_matches
     SET ${fields.join(", ")}
     WHERE trigger_id = $1 AND user_message = $2`,
    values
  );
}

/**
 * Clear the trigger cache (call this when triggers are created/updated/deleted)
 */
export function clearTriggerCache() {
  cachedTriggers = null;
  cacheTimestamp = 0;
  console.log('🗑️ Trigger cache cleared');
}
