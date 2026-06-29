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
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return "";
  }

  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function ownTextWithoutInteractiveDescendants(element: Element, excludedDescendant?: Element): string {
  const pieces: string[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (excludedDescendant && excludedDescendant !== element && excludedDescendant.contains(parent)) return NodeFilter.FILTER_REJECT;
      const interactiveAncestor = parent.closest("input, select, textarea, button, option, [contenteditable='true'], [role='button'], [role='link'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch'], [role='slider'], [role='textbox'], [role='tab']");
      if (interactiveAncestor && interactiveAncestor !== element) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let node = walker.nextNode();
  while (node) {
    pieces.push(node.textContent ?? "");
    node = walker.nextNode();
  }

  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function selectedControlDisplayText(element: HTMLElement): string | undefined {
  if (element instanceof HTMLSelectElement) {
    const selectedText = Array.from(element.selectedOptions).map((option) => option.textContent ?? "").join(" ");
    return selectedText.replace(/\s+/g, " ").trim() || undefined;
  }

  const ariaValue = element.getAttribute("aria-valuetext");
  if (ariaValue?.trim()) return ariaValue.trim();

  const selected = element.querySelector("[aria-selected='true'], [data-selected='true'], .selected, [class*='selected']");
  const selectedText = selected?.textContent?.replace(/\s+/g, " ").trim();
  return selectedText || undefined;
}

function stripTrailingSelectedValue(labelText: string, control?: Element): string {
  if (!(control instanceof HTMLElement)) return labelText;
  const selectedText = selectedControlDisplayText(control);
  if (!selectedText) return labelText;

  const compactLabel = labelText.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const compactSelected = selectedText.toLowerCase().replace(/[^a-z0-9]+/g, "");

  if (!compactSelected || !compactLabel.endsWith(compactSelected)) return labelText;

  const words = labelText.split(/\s+/);
  if (words.length > 1 && words[words.length - 1].toLowerCase().replace(/[^a-z0-9]+/g, "") === compactSelected) {
    return words.slice(0, -1).join(" ").trim();
  }

  return labelText.slice(0, Math.max(0, labelText.length - selectedText.length)).replace(/\s+$/, "").trim();
}

function directChildContaining(label: HTMLLabelElement, control: Element): Element | null {
  return Array.from(label.children).find((child) => child === control || child.contains(control)) ?? null;
}

function getLabelCaptionBeforeControl(label: HTMLLabelElement, control?: Element): string {
  if (!control) return "";
  const controlChild = directChildContaining(label, control);
  if (!controlChild) return "";

  const pieces: string[] = [];
  let sibling = controlChild.previousElementSibling;
  while (sibling) {
    pieces.unshift(ownTextWithoutInteractiveDescendants(sibling));
    sibling = sibling.previousElementSibling;
  }

  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

function getLabelOwnText(label: HTMLLabelElement, control?: Element): string {
  return stripTrailingSelectedValue(getLabelCaptionBeforeControl(label, control) || ownTextWithoutInteractiveDescendants(label, control), control);
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function labelTextFromNativeControl(element: HTMLElement): string | undefined {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) {
    return undefined;
  }

  const labels = element.labels ? Array.from(element.labels) : [];
  for (const label of labels) {
    const text = getWrappedLabelCaption(label, element);
    if (text) return text;
  }

  return undefined;
}

function getWrappedLabelCaption(label: HTMLLabelElement, control: Element): string | undefined {
  const parts: string[] = [];

  for (const node of Array.from(label.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;

      if (element === control || element.contains(control)) {
        continue;
      }

      if (
        element.matches("span, p, strong, b, small")
        || element.getAttribute("data-label") === "true"
      ) {
        const text = cleanText(element.textContent || "");
        if (text) parts.push(text);
      }
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = cleanText(node.textContent || "");
      if (text) parts.push(text);
    }
  }

  return parts.length ? parts.join(" ") : undefined;
}

function getSelectedOptionText(element: HTMLElement): string | undefined {
  if (!(element instanceof HTMLSelectElement)) return undefined;
  return cleanText(element.selectedOptions[0]?.textContent || "") || undefined;
}

/**
 * Get label text associated with an input element
 */
function getAssociatedLabelText(element: HTMLElement): string | undefined {
  const nativeControlLabel = labelTextFromNativeControl(element);
  if (nativeControlLabel) return nativeControlLabel;

  // Check for label[for="id"]
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${cssEscape(element.id)}"]`
    );
    if (label) return getLabelOwnText(label, element) || undefined;
  }

  // Check for wrapping label
  const wrappingLabel = element.closest("label");
  if (wrappingLabel) {
    return getLabelOwnText(wrappingLabel, element) || undefined;
  }

  return undefined;
}

function getAccessibleName(element: HTMLElement, labelText?: string): string | undefined {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.slice(0, 120);
  }

  return (
    element.getAttribute("aria-label")
    || labelText
    || element.getAttribute("placeholder")
    || getVisibleText(element)
    || undefined
  );
}

function textOf(element: Element | null | undefined, limit = 160): string | undefined {
  if (!element) return undefined;
  const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text ? text.slice(0, limit) : undefined;
}

function previousSiblingText(element: Element): string | undefined {
  let sibling = element.previousElementSibling;
  while (sibling) {
    const text = textOf(sibling, 120);
    if (text) return text;
    sibling = sibling.previousElementSibling;
  }
  return undefined;
}

function nextSiblingText(element: Element): string | undefined {
  let sibling = element.nextElementSibling;
  while (sibling) {
    const text = textOf(sibling, 120);
    if (text) return text;
    sibling = sibling.nextElementSibling;
  }
  return undefined;
}

function nearestHeadingText(element: Element): string | undefined {
  const container = element.closest("section, article, main, aside, form, dialog, [role='dialog'], [role='region'], [class*='card'], [class*='panel']");
  const heading = container?.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']");
  return textOf(heading, 120);
}

function nearestContainerText(element: Element): string | undefined {
  const container = element.closest("label, fieldset, section, article, form, dialog, [role='dialog'], [class*='card'], [class*='panel']");
  if (!container) return undefined;
  const clone = container.cloneNode(true) as Element;
  clone.querySelectorAll("input, select, textarea, button, option, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], script, style").forEach((child) => child.remove());
  return textOf(clone, 220);
}

function parentElementContext(element: Element) {
  const parent = element.parentElement;
  if (!parent) return {};
  return {
    parentTagName: parent.tagName.toLowerCase(),
    parentRole: parent.getAttribute("role") || undefined,
    parentAccessibleName: getAccessibleName(parent),
    parentText: ownTextWithoutInteractiveDescendants(parent).slice(0, 180) || undefined
  };
}

function formTitle(element: Element): string | undefined {
  const form = element.closest("form, fieldset");
  return textOf(form?.querySelector("legend, h1, h2, h3, h4, h5, h6"), 120);
}

function dialogTitle(element: Element): string | undefined {
  const dialog = element.closest("dialog, [role='dialog'], [aria-modal='true']");
  return textOf(dialog?.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']"), 120);
}

function cardTitle(element: Element): string | undefined {
  const card = element.closest("[data-card], [class*='card'], [class*='panel']");
  return textOf(card?.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']"), 120);
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

  // Penalize generated-looking IDs and classes.
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
      confidence *= 0.60;
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
  const sensitiveDataPattern = /(token|secret|password|otp|cvv|card|auth|key|session)/i;

  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i];
    if (attr.name.startsWith("data-") && !sensitiveDataPattern.test(attr.name)) {
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

  if (labelText) {
    candidates.push({
      type: "label-text",
      value: labelText,
      confidence: calculateConfidence("label-text", labelText, element),
      reason: "Associated label text",
    });
  }

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

  const cssSelector = buildStableCssSelector(element);
  if (cssSelector) {
    candidates.push({
      type: "css",
      value: cssSelector,
      confidence: calculateConfidence("css", cssSelector, element),
      reason: "CSS selector path fallback",
    });
  }

  const xpath = buildXPath(element);
  candidates.push({
    type: "xpath",
    value: xpath,
    confidence: calculateConfidence("xpath", xpath, element),
    reason: "XPath fallback (least stable)",
  });

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
  const selectedOptionText = getSelectedOptionText(htmlElement);
  const accessibleName = getAccessibleName(htmlElement, labelText);
  const parentContext = parentElementContext(element);
  const selectorCandidates = generateSelectorCandidates(
    element,
    accessibleName || visibleText,
    labelText
  );
  const cssFallback = selectorCandidates.find((candidate) => candidate.type === "css")?.value;
  const xpathFallback = selectorCandidates.find((candidate) => candidate.type === "xpath")?.value;

  // Best confidence score from all candidates
  const confidenceScore = selectorCandidates[0]?.confidence ?? 0;

  // Need confirmation if confidence is below threshold
  const needsUserConfirmation = confidenceScore < 0.75;

  return {
    tagName: element.tagName.toLowerCase(),
    role: element.getAttribute("role") || undefined,
    accessibleName,
    text: visibleText || undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    labelText,
    placeholder: element.getAttribute("placeholder") || undefined,
    inputType: element instanceof HTMLInputElement ? element.type : undefined,
    selectedOptionText,
    name: element.getAttribute("name") || undefined,
    id: element.id || undefined,
    dataAttributes: getDataAttributes(element),
    nearbyHeading: nearestHeadingText(element),
    parentContainerText: nearestContainerText(element),
    previousSiblingText: previousSiblingText(element),
    nextSiblingText: nextSiblingText(element),
    ...parentContext,
    formTitle: formTitle(element),
    dialogTitle: dialogTitle(element),
    cardTitle: cardTitle(element),
    url,
    path: window.location.pathname,
    cssFallback,
    xpathFallback,
    selectorCandidates,
    confidenceScore,
    needsUserConfirmation,
    boundingBox: getBoundingBox(element),
  };
}

export const buildControlFingerprint = buildElementIdentity;
