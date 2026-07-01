import type { ElementIdentity, SelectorCandidate, TargetElement } from "@/shared/guideTypes";

export type MatchCandidate = {
  element: HTMLElement;
  score: number;
  matchedBy: string[];
  reason: string;
};

export type RuleBasedMatchResult = {
  bestMatch: MatchCandidate | null;
  allCandidates: MatchCandidate[];
  confidence: number; // 0-100
  ambiguous: boolean;
  source: "rule-based";
};

/**
 * Rule-based control matcher using metadata similarity
 * Scores elements based on text, role, tag, aria-label, nearby labels, parent context, etc.
 */

const MATCH_WEIGHTS = {
  text: 25,
  role: 20,
  ariaLabel: 20,
  labelText: 18,
  tagName: 15,
  placeholder: 12,
  accessibleName: 15,
  nearbyHeading: 10,
  parentContext: 8,
  urlMatch: 5,
  pathMatch: 5,
  formTitle: 8,
  dialogTitle: 8,
  cardTitle: 8,
  inputType: 10,
  name: 12,
  id: 10,
};

const MIN_CONFIDENCE_THRESHOLD = 50;
const HIGH_CONFIDENCE_THRESHOLD = 95;
const AMBIGUOUS_SCORE_DELTA = 10;

function normalizeText(text: unknown): string {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

function textSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);

  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  // Check if one contains the other
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.8;
  }

  // Calculate word overlap
  const wordsA = normA.split(" ");
  const wordsB = normB.split(" ");
  const intersection = wordsA.filter((word) => wordsB.includes(word));

  if (intersection.length === 0) return 0;

  const union = new Set([...wordsA, ...wordsB]);
  return intersection.length / union.size;
}

function getElementText(element: HTMLElement): string {
  if (element instanceof HTMLInputElement) {
    return element.value || element.placeholder || "";
  }
  if (element instanceof HTMLSelectElement) {
    const selectedOption = element.selectedOptions[0];
    return selectedOption ? selectedOption.textContent || "" : "";
  }
  return element.innerText || element.textContent || "";
}

function getAriaLabel(element: HTMLElement): string {
  return element.getAttribute("aria-label") || element.getAttribute("aria-labelledby") || "";
}

function getAccessibleName(element: HTMLElement): string {
  const ariaLabel = getAriaLabel(element);
  if (ariaLabel) return ariaLabel;

  // Check for label element
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
    if (label) return label.textContent || "";
  }

  // Check if wrapped in label
  const parentLabel = element.closest("label");
  if (parentLabel) return parentLabel.textContent || "";

  return "";
}

function getNearbyHeading(element: HTMLElement): string {
  let current: Element | null = element;
  while (current && current !== document.body) {
    const heading = current.querySelector("h1, h2, h3, h4, h5, h6");
    if (heading) return heading.textContent || "";
    current = current.parentElement;
  }
  return "";
}

function getFormTitle(element: HTMLElement): string {
  const form = element.closest("form");
  if (!form) return "";

  const legend = form.querySelector("legend");
  if (legend) return legend.textContent || "";

  const heading = form.querySelector("h1, h2, h3, h4, h5, h6");
  if (heading) return heading.textContent || "";

  return "";
}

function getDialogTitle(element: HTMLElement): string {
  const dialog = element.closest('[role="dialog"], [role="alertdialog"], dialog');
  if (!dialog) return "";

  const title = dialog.querySelector('[role="heading"], h1, h2, h3, .modal-title, .dialog-title');
  return title ? title.textContent || "" : "";
}

function getCardTitle(element: HTMLElement): string {
  const card = element.closest('[class*="card"], [role="article"]');
  if (!card) return "";

  const title = card.querySelector('[class*="card-title"], [class*="card-header"], h1, h2, h3, h4');
  return title ? title.textContent || "" : "";
}

function getParentContext(element: HTMLElement): string {
  const parent = element.parentElement;
  if (!parent) return "";

  return getElementText(parent).slice(0, 100);
}

function scoreElement(element: HTMLElement, identity: ElementIdentity): MatchCandidate {
  let totalScore = 0;
  const matchedBy: string[] = [];
  const reasons: string[] = [];

  // Text matching
  const elementText = getElementText(element);
  if (identity.text && elementText) {
    const similarity = textSimilarity(elementText, identity.text);
    if (similarity > 0.5) {
      const points = similarity * MATCH_WEIGHTS.text;
      totalScore += points;
      matchedBy.push("text");
      reasons.push(`text match (${Math.round(similarity * 100)}%)`);
    }
  }

  // Role matching
  if (identity.role && element.getAttribute("role") === identity.role) {
    totalScore += MATCH_WEIGHTS.role;
    matchedBy.push("role");
    reasons.push(`role="${identity.role}"`);
  }

  // Aria label matching
  const ariaLabel = getAriaLabel(element);
  if (identity.ariaLabel && ariaLabel) {
    const similarity = textSimilarity(ariaLabel, identity.ariaLabel);
    if (similarity > 0.5) {
      const points = similarity * MATCH_WEIGHTS.ariaLabel;
      totalScore += points;
      matchedBy.push("aria-label");
      reasons.push(`aria-label match (${Math.round(similarity * 100)}%)`);
    }
  }

  // Accessible name matching
  const accessibleName = getAccessibleName(element);
  if (identity.accessibleName && accessibleName) {
    const similarity = textSimilarity(accessibleName, identity.accessibleName);
    if (similarity > 0.5) {
      const points = similarity * MATCH_WEIGHTS.accessibleName;
      totalScore += points;
      matchedBy.push("accessible-name");
      reasons.push(`accessible name match (${Math.round(similarity * 100)}%)`);
    }
  }

  // Tag name matching
  if (identity.tagName && element.tagName.toLowerCase() === identity.tagName.toLowerCase()) {
    totalScore += MATCH_WEIGHTS.tagName;
    matchedBy.push("tag");
  }

  // Placeholder matching
  if (identity.placeholder && element instanceof HTMLInputElement && element.placeholder) {
    const similarity = textSimilarity(element.placeholder, identity.placeholder);
    if (similarity > 0.5) {
      const points = similarity * MATCH_WEIGHTS.placeholder;
      totalScore += points;
      matchedBy.push("placeholder");
      reasons.push(`placeholder match (${Math.round(similarity * 100)}%)`);
    }
  }

  // Input type matching
  if (identity.inputType && element instanceof HTMLInputElement && element.type === identity.inputType) {
    totalScore += MATCH_WEIGHTS.inputType;
    matchedBy.push("input-type");
  }

  // Name attribute matching
  if (identity.name && element.getAttribute("name") === identity.name) {
    totalScore += MATCH_WEIGHTS.name;
    matchedBy.push("name");
    reasons.push(`name="${identity.name}"`);
  }

  // ID matching
  if (identity.id && element.id === identity.id) {
    totalScore += MATCH_WEIGHTS.id;
    matchedBy.push("id");
    reasons.push(`id="${identity.id}"`);
  }

  // Label text matching
  if (identity.labelText) {
    const accessibleName = getAccessibleName(element);
    if (accessibleName) {
      const similarity = textSimilarity(accessibleName, identity.labelText);
      if (similarity > 0.5) {
        const points = similarity * MATCH_WEIGHTS.labelText;
        totalScore += points;
        matchedBy.push("label");
        reasons.push(`label match (${Math.round(similarity * 100)}%)`);
      }
    }
  }

  // Nearby heading matching
  if (identity.nearbyHeading) {
    const nearbyHeading = getNearbyHeading(element);
    if (nearbyHeading) {
      const similarity = textSimilarity(nearbyHeading, identity.nearbyHeading);
      if (similarity > 0.5) {
        const points = similarity * MATCH_WEIGHTS.nearbyHeading;
        totalScore += points;
        matchedBy.push("nearby-heading");
      }
    }
  }

  // Form title matching
  if (identity.formTitle) {
    const formTitle = getFormTitle(element);
    if (formTitle) {
      const similarity = textSimilarity(formTitle, identity.formTitle);
      if (similarity > 0.5) {
        const points = similarity * MATCH_WEIGHTS.formTitle;
        totalScore += points;
        matchedBy.push("form-title");
      }
    }
  }

  // Dialog title matching
  if (identity.dialogTitle) {
    const dialogTitle = getDialogTitle(element);
    if (dialogTitle) {
      const similarity = textSimilarity(dialogTitle, identity.dialogTitle);
      if (similarity > 0.5) {
        const points = similarity * MATCH_WEIGHTS.dialogTitle;
        totalScore += points;
        matchedBy.push("dialog-title");
      }
    }
  }

  // Card title matching
  if (identity.cardTitle) {
    const cardTitle = getCardTitle(element);
    if (cardTitle) {
      const similarity = textSimilarity(cardTitle, identity.cardTitle);
      if (similarity > 0.5) {
        const points = similarity * MATCH_WEIGHTS.cardTitle;
        totalScore += points;
        matchedBy.push("card-title");
      }
    }
  }

  // Parent context matching
  if (identity.parentContainerText) {
    const parentContext = getParentContext(element);
    if (parentContext) {
      const similarity = textSimilarity(parentContext, identity.parentContainerText);
      if (similarity > 0.4) {
        const points = similarity * MATCH_WEIGHTS.parentContext;
        totalScore += points;
        matchedBy.push("parent-context");
      }
    }
  }

  // URL/path matching
  const currentUrl = window.location.href;
  const currentPath = window.location.pathname;
  if (identity.url && currentUrl.includes(identity.url)) {
    totalScore += MATCH_WEIGHTS.urlMatch;
    matchedBy.push("url");
  }
  if (identity.path && currentPath.includes(identity.path)) {
    totalScore += MATCH_WEIGHTS.pathMatch;
    matchedBy.push("path");
  }

  const maxPossibleScore = Object.values(MATCH_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const normalizedScore = (totalScore / maxPossibleScore) * 100;

  return {
    element,
    score: normalizedScore,
    matchedBy,
    reason: reasons.length > 0 ? reasons.join(", ") : matchedBy.join(", "),
  };
}

/**
 * Find matching controls using rule-based metadata scoring
 */
export function findMatchingControls(
  identity: ElementIdentity,
  candidateSelector?: string
): RuleBasedMatchResult {
  // Get candidate elements
  let candidates: HTMLElement[] = [];

  if (candidateSelector) {
    try {
      candidates = Array.from(document.querySelectorAll<HTMLElement>(candidateSelector));
    } catch {
      // Invalid selector, fall through to general search
    }
  }

  // If no specific selector or no results, search broadly
  if (candidates.length === 0) {
    const searchSelectors = [
      identity.tagName ? identity.tagName : null,
      identity.role ? `[role="${identity.role}"]` : null,
      identity.inputType ? `input[type="${identity.inputType}"]` : null,
      "button",
      "input",
      "select",
      "textarea",
      "a[href]",
      "[role='button']",
      "[role='link']",
      "[role='combobox']",
      "[role='textbox']",
    ].filter(Boolean);

    const selector = searchSelectors.join(", ");
    candidates = Array.from(document.querySelectorAll<HTMLElement>(selector));
  }

  // Filter to visible elements only
  candidates = candidates.filter((el) => {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).visibility !== "hidden";
  });

  // Score each candidate
  const scoredCandidates = candidates.map((element) => scoreElement(element, identity));

  // Sort by score descending
  scoredCandidates.sort((a, b) => b.score - a.score);

  // Filter to only candidates above minimum threshold
  const viableCandidates = scoredCandidates.filter((c) => c.score >= MIN_CONFIDENCE_THRESHOLD);

  if (viableCandidates.length === 0) {
    return {
      bestMatch: null,
      allCandidates: [],
      confidence: 0,
      ambiguous: false,
      source: "rule-based",
    };
  }

  const bestMatch = viableCandidates[0];
  const secondBest = viableCandidates[1];

  // Check if ambiguous (two top candidates with similar scores)
  const ambiguous = secondBest && (bestMatch.score - secondBest.score) < AMBIGUOUS_SCORE_DELTA;

  return {
    bestMatch,
    allCandidates: viableCandidates,
    confidence: bestMatch.score,
    ambiguous,
    source: "rule-based",
  };
}
