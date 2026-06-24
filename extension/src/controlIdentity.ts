import type { ElementIdentity, SelectorCandidate } from "./types";

/**
 * CSS escape utility
 */
function cssEscape(value: string): string {
  const escape = (globalThis.CSS as { escape?: (input: string) => string } | undefined)?.escape;
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&");
}

/**
 * Get visible text from an element (trimmed and limited)
 */
function getVisibleText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Get label text associated with an input element
 */
function getAssociatedLabelText(element: HTMLElement): string | undefined {
  // Check for label[for="id"]
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(element.id)}"]`
    );
    if (label) return label.innerText.trim();
  }

  // Check for wrapping label
  const wrappingLabel = element.closest("label");
  if (wrappingLabel) {
    return wrappingLabel.textContent?.replace(/\s+/g, " ").trim();
  }

  return undefined;
}

/**
 * Calculate confidence score based on selector type and value characteristics
 */
function calculateConfidence(
  type: SelectorCandidate["type"],
  value: string,
  element: Element
): number {
  const baseConfidence: Record<SelectorCandidate["type"], number> = {
    "data-adoption-id": 0.99,
    "data-testid": 0.95,
    "data-test": 0.95,
    "data-cy": 0.95,
    id: 0.90,
    name: 0.85,
    "aria-label": 0.82,
    "role-text": 0.78,
    "label-text": 0.76,
    placeholder: 0.70,
    "text-context": 0.65,
    css: 0.55,
    xpath: 0.40,
  };

  let confidence = baseConfidence[type] || 0.50;

  // Penalize generated-looking IDs and classes
  if (type === "id" || type === "css") {
    const generatedPatterns = [
      /^[a-z0-9]{8,}$/i, // Long alphanumeric strings
      /\d{10,}/, // Long numbers
      /-[a-f0-9]{6,}/i, // Hex patterns
      /^(root|app|main)-\d+/, // Framework-generated IDs
      /__[A-Z]/, // React/CSS modules patterns
      /^ember\d+/, // Ember IDs
      /^ng-/i, // Angular IDs
      /-[0-9a-f]{8}-[0-9a-f]{4}/i, // UUID fragments
    ];

    const hasGeneratedPattern = generatedPatterns.some((pattern) =>
      pattern.test(value)
    );

    if (hasGeneratedPattern) {
      confidence *= 0.60; // Significant penalty for generated IDs
    }
  }

  return Math.max(0, Math.min(1, confidence));
}

/**
 * Build stable CSS selector path
 */
function buildStableCssSelector(element: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;
  let depth = 0;
  const maxDepth = 5;

  while (current && current !== document.body && depth < maxDepth) {
    const tag = current.tagName.toLowerCase();

    // Check for highly stable attributes
    const adoptionId = current.getAttribute("data-adoption-id");
    if (adoptionId) {
      segments.unshift(`${tag}[data-adoption-id="${cssEscape(adoptionId)}"]`);
      break;
    }

    const testId = ["data-testid", "data-test", "data-cy"]
      .map((attr) => [attr, current?.getAttribute(attr) ?? ""] as const)
      .find(([, value]) => Boolean(value));

    if (testId) {
      segments.unshift(`${tag}[${testId[0]}="${cssEscape(testId[1])}"]`);
      break;
    }

    // Check for stable ID
    if (current.id) {
      const isStable = !/^[a-z0-9]{8,}$|__[A-Z]|^ember\d+|^ng-/i.test(
        current.id
      );
      if (isStable) {
        segments.unshift(`${tag}#${cssEscape(current.id)}`);
        break;
      }
    }

    // Check for stable name attribute
    const name = current.getAttribute("name");
    if (name) {
      segments.unshift(`${tag}[name="${cssEscape(name)}"]`);
      break;
    }

    // Fallback to tag
    segments.unshift(tag);
    current = current.parentElement;
    depth++;
  }

  return segments.join(" > ");
}

/**
 * Build XPath selector for an element
 */
function buildXPath(element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === current.tagName) {
        index++;
      }
      sibling = sibling.previousElementSibling;
    }

    const tagName = current.tagName.toLowerCase();
    parts.unshift(`${tagName}[${index}]`);
    current = current.parentElement;
  }

  return `/${parts.join("/")}`;
}

/**
 * Get bounding box for an element
 */
function getBoundingBox(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x + window.scrollX,
    y: rect.y + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Collect all data-* attributes from an element
 */
function getDataAttributes(element: Element): Record<string, string> {
  const dataAttrs: Record<string, string> = {};
  const attrs = element.attributes;

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (attr.name.startsWith("data-")) {
      dataAttrs[attr.name] = attr.value;
    }
  }

  return dataAttrs;
}

/**
 * Generate all selector candidates for an element
 */
function generateSelectorCandidates(
  element: Element,
  visibleText: string,
  labelText: string | undefined
): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  // 1. data-adoption-id (highest priority - customer-provided stable ID)
  const adoptionId = element.getAttribute("data-adoption-id");
  if (adoptionId) {
    const selector = `[data-adoption-id="${cssEscape(adoptionId)}"]`;
    candidates.push({
      type: "data-adoption-id",
      value: selector,
      confidence: calculateConfidence("data-adoption-id", selector, element),
      reason: "Stable customer-provided adoption ID",
    });
  }

  // 2. Test IDs (data-testid, data-test, data-cy)
  for (const attr of ["data-testid", "data-test", "data-cy"] as const) {
    const value = element.getAttribute(attr);
    if (value) {
      const selector = `[${attr}="${cssEscape(value)}"]`;
      candidates.push({
        type: attr,
        value: selector,
        confidence: calculateConfidence(attr, selector, element),
        reason: `Test automation ${attr} attribute`,
      });
    }
  }

  // 3. ID attribute
  if (element.id) {
    const selector = `#${cssEscape(element.id)}`;
    const confidence = calculateConfidence("id", element.id, element);
    const isStable = confidence > 0.75;
    candidates.push({
      type: "id",
      value: selector,
      confidence,
      reason: isStable ? "Stable ID attribute" : "ID may be auto-generated",
    });
  }

  // 4. Name attribute
  const name = element.getAttribute("name");
  if (name) {
    const selector = `[name="${cssEscape(name)}"]`;
    candidates.push({
      type: "name",
      value: selector,
      confidence: calculateConfidence("name", selector, element),
      reason: "Stable name attribute",
    });
  }

  // 5. Aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    const selector = `[aria-label="${cssEscape(ariaLabel)}"]`;
    candidates.push({
      type: "aria-label",
      value: selector,
      confidence: calculateConfidence("aria-label", selector, element),
      reason: "ARIA label for accessibility",
    });
  }

  // 6. Role + visible text
  const role = element.getAttribute("role");
  if (role && visibleText) {
    const value = `${role}::${visibleText}`;
    candidates.push({
      type: "role-text",
      value,
      confidence: calculateConfidence("role-text", value, element),
      reason: "ARIA role with exact visible text",
    });
  }

  // 7. Label text (for form inputs)
  if (labelText) {
    candidates.push({
      type: "label-text",
      value: labelText,
      confidence: calculateConfidence("label-text", labelText, element),
      reason: "Associated label text",
    });
  }

  // 8. Placeholder (for inputs)
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    const selector = `[placeholder="${cssEscape(placeholder)}"]`;
    candidates.push({
      type: "placeholder",
      value: selector,
      confidence: calculateConfidence("placeholder", selector, element),
      reason: "Input placeholder text",
    });
  }

  // 9. Text context (button/link text)
  if (visibleText && ["button", "a", "span", "div"].includes(element.tagName.toLowerCase())) {
    candidates.push({
      type: "text-context",
      value: visibleText,
      confidence: calculateConfidence("text-context", visibleText, element),
      reason: "Visible element text for context matching",
    });
  }

  // 10. Stable CSS selector
  const cssSelector = buildStableCssSelector(element);
  if (cssSelector) {
    candidates.push({
      type: "css",
      value: cssSelector,
      confidence: calculateConfidence("css", cssSelector, element),
      reason: "CSS selector path fallback",
    });
  }

  // 11. XPath (last resort)
  const xpath = buildXPath(element);
  candidates.push({
    type: "xpath",
    value: xpath,
    confidence: calculateConfidence("xpath", xpath, element),
    reason: "XPath fallback (least stable)",
  });

  // Sort by confidence (highest first)
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Build complete ElementIdentity for a given element
 *
 * This captures all relevant information about an element including:
 * - Basic attributes (tag, role, text, labels, etc.)
 * - Data attributes (especially data-adoption-id for stability)
 * - Multiple selector candidates with confidence scoring
 * - Bounding box for disambiguation
 * - URL and path context
 *
 * For best reliability, customer applications should add stable attributes:
 * <button data-adoption-id="create-order">Create Order</button>
 */
export function buildElementIdentity(
  element: Element,
  url: string
): ElementIdentity {
  const htmlElement = element as HTMLElement;
  const visibleText = getVisibleText(element);
  const labelText = getAssociatedLabelText(htmlElement);
  const selectorCandidates = generateSelectorCandidates(
    element,
    visibleText,
    labelText
  );

  // Best confidence score from all candidates
  const confidenceScore = selectorCandidates[0]?.confidence ?? 0;

  // Need confirmation if confidence is below threshold
  const needsUserConfirmation = confidenceScore < 0.75;

  return {
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || undefined,
    text: visibleText || undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    labelText,
    placeholder: element.getAttribute("placeholder") || undefined,
    name: element.getAttribute("name") || undefined,
    id: element.id || undefined,
    dataAttributes: getDataAttributes(element),
    url,
    path: window.location.pathname,
    selectorCandidates,
    confidenceScore,
    needsUserConfirmation,
    boundingBox: getBoundingBox(element),
  };
}
