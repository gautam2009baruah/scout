import type { ElementIdentity, SelectorCandidate } from "@/shared/guideTypes";
import { findMatchingControls, type RuleBasedMatchResult } from "./ruleBasedMatcher";
import { findMatchWithAI, type AIMatchResult } from "./aiMatcher";

export type HealingResult = {
  element: HTMLElement | null;
  confidence: number;
  source: "rule-based" | "ai-assisted" | "none";
  reason: string;
  originalIdentity: ElementIdentity;
  proposedSelectorCandidates: SelectorCandidate[];
  shouldAutoApply: boolean;
  needsConfirmation: boolean;
  provider?: string;
  model?: string;
};

const HIGH_CONFIDENCE_THRESHOLD = 95;
const SENSITIVE_ACTIONS = ["submit", "delete", "remove", "cancel", "close", "payment", "pay"];

/**
 * Self-healing resolver that attempts to find controls using:
 * 1. Rule-based metadata matching
 * 2. AI-assisted fallback if rule-based is uncertain
 */
export async function attemptSelfHealing(
  identity: ElementIdentity,
  stepIntent: string,
  isSensitiveStep: boolean = false
): Promise<HealingResult> {
  console.log("[Self-Healing] Starting healing attempt for:", stepIntent);

  // Step 1: Try rule-based matching
  const ruleResult = findMatchingControls(identity);

  console.log("[Self-Healing] Rule-based result:", {
    confidence: ruleResult.confidence,
    ambiguous: ruleResult.ambiguous,
    candidatesFound: ruleResult.allCandidates.length,
  });

  // If rule-based found a high-confidence unambiguous match, use it
  if (
    ruleResult.bestMatch &&
    ruleResult.confidence >= HIGH_CONFIDENCE_THRESHOLD &&
    !ruleResult.ambiguous
  ) {
    const proposedSelectors = buildSelectorCandidates(ruleResult.bestMatch.element, identity);
    const shouldAutoApply = !isSensitiveStep && ruleResult.confidence >= HIGH_CONFIDENCE_THRESHOLD;

    return {
      element: ruleResult.bestMatch.element,
      confidence: ruleResult.confidence,
      source: "rule-based",
      reason: ruleResult.bestMatch.reason,
      originalIdentity: identity,
      proposedSelectorCandidates: proposedSelectors,
      shouldAutoApply,
      needsConfirmation: isSensitiveStep || ruleResult.confidence < HIGH_CONFIDENCE_THRESHOLD,
    };
  }

  // Step 2: Try AI-assisted matching if rule-based is uncertain or ambiguous
  if (ruleResult.allCandidates.length > 0) {
    console.log("[Self-Healing] Attempting AI-assisted matching...");

    const aiResult = await findMatchWithAI(identity, ruleResult.allCandidates, stepIntent);

    console.log("[Self-Healing] AI result:", {
      found: aiResult.bestMatch !== null,
      confidence: aiResult.confidence,
      provider: aiResult.provider,
    });

    if (aiResult.bestMatch && aiResult.confidence >= 50) {
      const proposedSelectors = buildSelectorCandidates(aiResult.bestMatch, identity);
      const shouldAutoApply = !isSensitiveStep && aiResult.confidence >= HIGH_CONFIDENCE_THRESHOLD;

      return {
        element: aiResult.bestMatch,
        confidence: aiResult.confidence,
        source: "ai-assisted",
        reason: aiResult.reason,
        originalIdentity: identity,
        proposedSelectorCandidates: proposedSelectors,
        shouldAutoApply,
        needsConfirmation: isSensitiveStep || aiResult.confidence < HIGH_CONFIDENCE_THRESHOLD,
        provider: aiResult.provider,
        model: aiResult.model,
      };
    }
  }

  // No suitable match found
  console.log("[Self-Healing] No suitable match found");

  return {
    element: null,
    confidence: 0,
    source: "none",
    reason: "No matching control found with sufficient confidence",
    originalIdentity: identity,
    proposedSelectorCandidates: [],
    shouldAutoApply: false,
    needsConfirmation: true,
  };
}

/**
 * Build selector candidates for the matched element
 */
function buildSelectorCandidates(element: HTMLElement, originalIdentity: ElementIdentity): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  // Data attributes (highest priority)
  const dataAttrs = ["data-adoption-id", "data-testid", "data-test", "data-cy"];
  for (const attr of dataAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push({
        type: attr as SelectorCandidate["type"],
        value,
        confidence: 95,
        reason: `Matched ${attr}`,
      });
    }
  }

  // ID
  if (element.id) {
    candidates.push({
      type: "id",
      value: element.id,
      confidence: 90,
      reason: "Matched ID",
    });
  }

  // Name
  const name = element.getAttribute("name");
  if (name) {
    candidates.push({
      type: "name",
      value: name,
      confidence: 85,
      reason: "Matched name attribute",
    });
  }

  // Aria label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    candidates.push({
      type: "aria-label",
      value: ariaLabel,
      confidence: 80,
      reason: "Matched aria-label",
    });
  }

  // Role + text
  const role = element.getAttribute("role");
  const text = element.innerText?.trim() || element.textContent?.trim();
  if (role && text) {
    candidates.push({
      type: "role-text",
      value: `${role}::${text}`,
      confidence: 75,
      reason: "Matched role and text",
    });
  }

  // Label text (for form controls)
  const accessibleName = getAccessibleName(element);
  if (accessibleName) {
    candidates.push({
      type: "label-text",
      value: accessibleName,
      confidence: 75,
      reason: "Matched label text",
    });
  }

  // Placeholder (for inputs)
  if (element instanceof HTMLInputElement && element.placeholder) {
    candidates.push({
      type: "placeholder",
      value: element.placeholder,
      confidence: 70,
      reason: "Matched placeholder",
    });
  }

  // Text context
  if (text && text.length < 100) {
    candidates.push({
      type: "text-context",
      value: text,
      confidence: 65,
      reason: "Matched text content",
    });
  }

  // CSS fallback
  const cssSelector = buildCssSelector(element);
  if (cssSelector) {
    candidates.push({
      type: "css",
      value: cssSelector,
      confidence: 50,
      reason: "CSS selector fallback",
    });
  }

  return candidates;
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

function buildCssSelector(element: HTMLElement): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const siblings = current.parentElement ? Array.from(current.parentElement.children) : [];
    const sameTagSiblings = siblings.filter((s) => s.tagName === current?.tagName);

    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;

    if (path.length > 5) break; // Limit depth
  }

  return path.join(" > ");
}

/**
 * Check if a step is sensitive based on its intent/action
 */
export function isSensitiveStep(stepTitle: string, stepDescription?: string): boolean {
  const text = `${stepTitle} ${stepDescription || ""}`.toLowerCase();
  return SENSITIVE_ACTIONS.some((action) => text.includes(action));
}

/**
 * Save healing suggestion to the server
 */
export async function saveHealingSuggestion(
  workflowId: string,
  stepId: string,
  stepOrder: number,
  healingResult: HealingResult,
  pageUrl: string,
  pageTitle: string
): Promise<void> {
  if (!healingResult.element) {
    console.log("[Self-Healing] No element to save suggestion for");
    return;
  }

  try {
    const response = await fetch("/api/guided-workflow-player/healing-suggestions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        workflowId,
        stepId,
        stepOrder,
        originalIdentity: healingResult.originalIdentity,
        proposedSelectorCandidates: healingResult.proposedSelectorCandidates,
        confidenceScore: healingResult.confidence,
        healingSource: healingResult.source,
        healingReason: healingResult.reason,
        aiProvider: healingResult.provider,
        aiModel: healingResult.model,
        pageUrl,
        pageTitle,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to save healing suggestion: ${response.statusText}`);
    }

    console.log("[Self-Healing] Suggestion saved successfully");
  } catch (error) {
    console.error("[Self-Healing] Failed to save suggestion:", error);
  }
}
