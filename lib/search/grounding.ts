import { INSUFFICIENT_CONTEXT_MESSAGE } from "@/lib/llm/providers";
import type { RetrievalChunk } from "./retrieval-engine";

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return normalize(value).split(" ").filter(Boolean);
}

function lexicalOverlap(sentence: string, content: string) {
  const sentenceTokens = new Set(tokenize(sentence));
  const contentTokens = new Set(tokenize(content));

  if (sentenceTokens.size === 0 || contentTokens.size === 0) {
    return 0;
  }

  let matched = 0;
  for (const token of sentenceTokens) {
    if (contentTokens.has(token)) {
      matched += 1;
    }
  }

  return matched / sentenceTokens.size;
}

function splitSentences(answer: string) {
  return answer
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isFactualSentence(sentence: string) {
  const compact = sentence.trim();

  if (compact.length < 8) {
    return false;
  }

  return /\d|\b(must|shall|required|policy|contract|invoice|risk|compliance|supplier|vendor|rfp|rfq|tender|purchase|agreement)\b/i.test(compact);
}

export function shouldRequireCitations(answer: string) {
  return splitSentences(answer).some((sentence) => isFactualSentence(sentence));
}

export function isAnswerGrounded(answer: string, chunks: RetrievalChunk[]) {
  if (!answer || answer.trim() === "" || answer.trim() === INSUFFICIENT_CONTEXT_MESSAGE) {
    return true;
  }

  if (chunks.length === 0) {
    return false;
  }

  const factualSentences = splitSentences(answer).filter((sentence) => isFactualSentence(sentence));

  if (factualSentences.length === 0) {
    return true;
  }

  return factualSentences.every((sentence) =>
    chunks.some((chunk) => lexicalOverlap(sentence, chunk.content) >= 0.25)
  );
}
