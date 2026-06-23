import type { SelectorCandidate } from "./types";

function cssEscape(value: string) {
  const escape = (globalThis.CSS as { escape?: (input: string) => string } | undefined)?.escape;
  return escape ? escape(value) : value.replace(/["\\]/g, "\\$&");
}

function visibleText(element: Element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
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

    if (current.id) {
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

  for (const attr of ["data-testid", "data-test", "data-cy"]) {
    const value = element.getAttribute(attr);
    if (value) candidates.push({ type: "data-testid", value: `[${attr}="${cssEscape(value)}"]`, confidence: 0.98 });
  }

  if (element.id) candidates.push({ type: "id", value: `#${cssEscape(element.id)}`, confidence: 0.92 });
  if (element.getAttribute("name")) candidates.push({ type: "name", value: `[name="${cssEscape(element.getAttribute("name")!)}"]`, confidence: 0.86 });
  if (element.getAttribute("aria-label")) candidates.push({ type: "aria-label", value: `[aria-label="${cssEscape(element.getAttribute("aria-label")!)}"]`, confidence: 0.82 });

  const role = element.getAttribute("role");
  const text = visibleText(element);
  if (role && text) candidates.push({ type: "role-text", value: `${role}::${text}`, confidence: 0.72 });

  const css = stableCssSelector(element);
  if (css) candidates.push({ type: "css", value: css, confidence: 0.56 });

  candidates.push({ type: "xpath", value: elementXPath(element), confidence: 0.25 });
  return candidates;
}
