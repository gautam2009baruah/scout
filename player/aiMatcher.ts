import type { ElementIdentity } from "@/shared/guideTypes";
import type { MatchCandidate } from "./ruleBasedMatcher";

export type AIMatchResult = {
  bestMatch: HTMLElement | null;
  confidence: number; // 0-100
  reason: string;
  source: "ai-assisted";
  provider: string;
  model: string;
};

type AIMatchRequest = {
  recordedControl: ElementIdentity;
  candidateControls: Array<{
    index: number;
    tagName: string;
    text: string;
    role?: string;
    ariaLabel?: string;
    accessibleName?: string;
    placeholder?: string;
    id?: string;
    name?: string;
    ruleScore?: number;
  }>;
  pageContext: {
    url: string;
    title: string;
    path: string;
  };
  stepIntent: string;
};

type AIMatchResponse = {
  bestMatchIndex: number | null;
  confidence: number;
  reason: string;
};

/**
 * AI-assisted control matcher using the active LLM provider
 * Used as a fallback when rule-based matching is uncertain
 */
export async function findMatchWithAI(
  identity: ElementIdentity,
  candidates: MatchCandidate[],
  stepIntent: string
): Promise<AIMatchResult> {
  try {
    const request: AIMatchRequest = {
      recordedControl: identity,
      candidateControls: candidates.slice(0, 10).map((candidate, index) => ({
        index,
        tagName: candidate.element.tagName.toLowerCase(),
        text: candidate.element.innerText?.slice(0, 200) || "",
        role: candidate.element.getAttribute("role") || undefined,
        ariaLabel: candidate.element.getAttribute("aria-label") || undefined,
        accessibleName: getAccessibleName(candidate.element),
        placeholder: candidate.element instanceof HTMLInputElement ? candidate.element.placeholder : undefined,
        id: candidate.element.id || undefined,
        name: candidate.element.getAttribute("name") || undefined,
        ruleScore: candidate.score,
      })),
      pageContext: {
        url: window.location.href,
        title: document.title,
        path: window.location.pathname,
      },
      stepIntent,
    };

    const response = await fetch("/api/guided-workflow-player/ai-match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      throw new Error(`AI matching request failed: ${response.statusText}`);
    }

    const result: AIMatchResponse & { provider: string; model: string } = await response.json();

    if (result.bestMatchIndex === null || result.bestMatchIndex < 0 || result.bestMatchIndex >= candidates.length) {
      return {
        bestMatch: null,
        confidence: 0,
        reason: result.reason || "No suitable match found",
        source: "ai-assisted",
        provider: result.provider,
        model: result.model,
      };
    }

    return {
      bestMatch: candidates[result.bestMatchIndex].element,
      confidence: result.confidence,
      reason: result.reason,
      source: "ai-assisted",
      provider: result.provider,
      model: result.model,
    };
  } catch (error) {
    console.error("[AI Matcher] Error:", error);
    return {
      bestMatch: null,
      confidence: 0,
      reason: error instanceof Error ? error.message : "AI matching failed",
      source: "ai-assisted",
      provider: "unknown",
      model: "unknown",
    };
  }
}

function getAccessibleName(element: HTMLElement): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel;

  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    if (labelElement) return labelElement.textContent || "";
  }

  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent || "";
  }

  const parentLabel = element.closest("label");
  if (parentLabel) return parentLabel.textContent || "";

  return "";
}
