import type { SelectorCandidate } from "./types";

function cssEscape(value: string) {
  const escape = (globalThis.CSS as { escape?: (input: string) => string } | undefined)?.escape;
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&");
}

function visibleText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

function isGeneratedValue(value: string) {
  return [
    /^[a-z0-9]{8,}$/i,
    /\d{10,}/,
    /-[a-f0-9]{6,}/i,
    /^(__|ember\d+|ng-)/i,
    /-[0-9a-f]{8}-[0-9a-f]{4}/i,
  ].some((pattern) => pattern.test(value));
}

function elementXPath(element: Element) {
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 1;
    let sibling = current.previousElementSibling;

    while (sibling) {
      if (sibling.tagName === current.tagName) index += 1;
      sibling = sibling.previousElementSibling;
    }

    parts.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = current.parentElement;
  }

  return `/${parts.join("/")}`;
}

function stableCssSelector(element: Element) {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body && segments.length < 4) {
    const tag = current.tagName.toLowerCase();
    const stableAttr = ["data-testid", "data-test", "data-cy", "name", "aria-label"]
      .map((attr) => [attr, current?.getAttribute(attr) ?? ""] as const)
      .find(([, value]) => Boolean(value));

    if (stableAttr) {
      segments.unshift(`${tag}[${stableAttr[0]}="${cssEscape(stableAttr[1])}"]`);
      break;
    }

    if (current.id && !isGeneratedValue(current.id)) {
      segments.unshift(`${tag}#${cssEscape(current.id)}`);
      break;
    }

    segments.unshift(tag);
    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function buildSelectorCandidates(element: Element): SelectorCandidate[] {
  const candidates: SelectorCandidate[] = [];

  const adoptionId = element.getAttribute("data-adoption-id");
  if (adoptionId) {
    candidates.push({
      type: "data-adoption-id",
      value: `[data-adoption-id="${cssEscape(adoptionId)}"]`,
      confidence: 0.99,
      reason: "Stable customer-provided adoption ID",
    });
  }

  for (const attr of ["data-testid", "data-test", "data-cy"]) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push({
        type: attr as SelectorCandidate["type"],
        value: `[${attr}="${cssEscape(value)}"]`,
        confidence: 0.95,
        reason: `Test automation ${attr} attribute`,
      });
    }
  }

  if (element.id) {
    const stable = !isGeneratedValue(element.id);
    candidates.push({
      type: "id",
      value: `#${cssEscape(element.id)}`,
      confidence: stable ? 0.9 : 0.54,
      reason: stable ? "Stable ID attribute" : "ID may be auto-generated",
    });
  }

  const name = element.getAttribute("name");
  if (name) {
    candidates.push({
      type: "name",
      value: `[name="${cssEscape(name)}"]`,
      confidence: 0.85,
      reason: "Stable name attribute",
    });
  }

  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    candidates.push({
      type: "aria-label",
      value: `[aria-label="${cssEscape(ariaLabel)}"]`,
      confidence: 0.82,
      reason: "ARIA label for accessibility",
    });
  }

  const role = element.getAttribute("role");
  const text = visibleText(element);
  if (role && text) {
    candidates.push({
      type: "role-text",
      value: `${role}::${text}`,
      confidence: 0.78,
      reason: "ARIA role with exact visible text",
    });
  }

  const label = getAssociatedLabelText(element as HTMLElement);
  if (label) {
    candidates.push({
      type: "label-text",
      value: label,
      confidence: 0.76,
      reason: "Associated label text",
    });
  }

  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    candidates.push({
      type: "placeholder",
      value: `[placeholder="${cssEscape(placeholder)}"]`,
      confidence: 0.7,
      reason: "Input placeholder text",
    });
  }

  const css = stableCssSelector(element);
  if (css) {
    candidates.push({
      type: "css",
      value: css,
      confidence: 0.56,
      reason: "CSS selector path fallback",
    });
  }

  candidates.push({
    type: "xpath",
    value: elementXPath(element),
    confidence: 0.4,
    reason: "XPath fallback (least stable)",
  });
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

function getAssociatedLabelText(element: HTMLElement): string | undefined {
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${cssEscape(element.id)}"]`);
    if (label) return label.innerText.trim();
  }

  const wrappingLabel = element.closest("label");
  return wrappingLabel?.textContent?.replace(/\s+/g, " ").trim() || undefined;
}
