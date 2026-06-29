import type { SelectorCandidate, TargetElement } from "@/shared/guideTypes";

const MIN_MATCH_SCORE = 55;
const AMBIGUOUS_SCORE_DELTA = 8;
const POSITION_RESOLVE_MIN_SCORE = 0.72;
const POSITION_RESOLVE_MIN_DELTA = 0.18;
const SELECTOR_PRIORITY: Record<SelectorCandidate["type"], number> = {
  "data-adoption-id": 1,
  "data-testid": 2,
  "data-test": 2,
  "data-cy": 2,
  "aria-label": 3,
  "label-text": 4,
  "role-text": 5,
  placeholder: 6,
  id: 7,
  name: 7,
  "text-context": 7,
  css: 8,
  xpath: 9
};

export type ControlFindResult = {
  element: HTMLElement | null;
  score: number;
  ambiguous: boolean;
  candidates: Array<{ element: HTMLElement; score: number }>;
  needsConfirmation: boolean;
};

type ScoredCandidate = { element: HTMLElement; score: number; positionScore: number };

function escapeCss(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(value) : value.replace(/["\\]/g, "\\$&");
}

function readableText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function compactText(value: unknown) {
  return readableText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function debugFinder(message: string, detail?: unknown) {
  console.debug(`[ScoutElementFinder] ${message}`, detail ?? "");
}

function byXPath(xpath: string) {
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue instanceof HTMLElement ? result.singleNodeValue : null;
}

function byRoleText(value: string) {
  const [role, text] = value.split("::");
  const normalizedText = compactText(text);

  return Array.from(document.querySelectorAll<HTMLElement>(`[role="${escapeCss(role)}"]`))
    .find((element) => compactText(element.innerText) === normalizedText) ?? null;
}

function controlsForLabel(label: HTMLLabelElement) {
  const controls = Array.from(label.querySelectorAll<HTMLElement>("input, select, textarea, button, [role='combobox'], [role='textbox'], [tabindex]:not([tabindex='-1'])"));
  const controlId = label.getAttribute("for");
  const forControl = controlId ? document.getElementById(controlId) : null;
  if (forControl instanceof HTMLElement) controls.push(forControl);
  return Array.from(new Set(controls));
}

function byLabelText(value: string, target?: TargetElement) {
  const matches = labelTextMatches(value);
  const preferred = preferByTarget(matches, target);
  debugFinder(preferred ? "label-text matched control" : "label-text found no control", { value, targetTagName: target?.tagName, matchCount: matches.length });
  return preferred;
}

function labelTextMatches(value: string) {
  const normalizedText = compactText(value);
  const exactMatches: HTMLElement[] = [];
  const startsWithMatches: HTMLElement[] = [];

  for (const label of Array.from(document.querySelectorAll<HTMLLabelElement>("label"))) {
    for (const control of controlsForLabel(label)) {
      const clean = compactText(cleanLabelText(label, control));
      if (!clean) continue;
      if (clean === normalizedText) exactMatches.push(control);
      else if (clean.startsWith(normalizedText)) startsWithMatches.push(control);
    }
  }

  return Array.from(new Set(exactMatches.length > 0 ? exactMatches : startsWithMatches));
}

function preferByTarget(elements: HTMLElement[], target?: TargetElement) {
  if (elements.length === 0) return null;
  if (target?.tagName) {
    const tagMatch = elements.find((element) => element.tagName.toLowerCase() === target.tagName?.toLowerCase());
    if (tagMatch) return tagMatch;
  }
  return elements[0];
}

function cleanLabelText(label: HTMLLabelElement, excludedDescendant?: Element) {
  const caption = labelCaptionBeforeControl(label, excludedDescendant);
  if (caption) return stripTrailingSelectedValue(caption, excludedDescendant);

  const pieces: string[] = [];
  const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (excludedDescendant && excludedDescendant !== label && excludedDescendant.contains(parent)) return NodeFilter.FILTER_REJECT;
      const interactiveAncestor = parent.closest("input, select, textarea, button, option, [contenteditable='true'], [role='button'], [role='link'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch'], [role='slider'], [role='textbox'], [role='tab']");
      if (interactiveAncestor && interactiveAncestor !== label) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  let node = walker.nextNode();
  while (node) {
    pieces.push(node.textContent ?? "");
    node = walker.nextNode();
  }

  return stripTrailingSelectedValue(readableText(pieces.join(" ")), excludedDescendant);
}

function labelCaptionBeforeControl(label: HTMLLabelElement, control?: Element) {
  if (!control) return "";
  const controlChild = Array.from(label.children).find((child) => child === control || child.contains(control));
  if (!controlChild) return "";
  const pieces: string[] = [];
  let sibling = controlChild.previousElementSibling;
  while (sibling) {
    pieces.unshift(cleanedContainerText(sibling, 120));
    sibling = sibling.previousElementSibling;
  }
  return readableText(pieces.join(" "));
}

function selectedControlDisplayText(element?: Element) {
  if (!(element instanceof HTMLElement)) return "";
  if (element instanceof HTMLSelectElement) {
    return readableText(Array.from(element.selectedOptions).map((option) => option.textContent ?? "").join(" "));
  }
  return readableText(
    element.getAttribute("aria-valuetext")
    || element.querySelector("[aria-selected='true'], [data-selected='true'], .selected, [class*='selected']")?.textContent
  );
}

function stripTrailingSelectedValue(labelText: string, control?: Element) {
  const selectedText = selectedControlDisplayText(control);
  const compactLabel = compactText(labelText);
  const compactSelected = compactText(selectedText);
  if (!compactSelected || !compactLabel.endsWith(compactSelected)) return labelText;

  const words = labelText.split(/\s+/);
  if (words.length > 1 && compactText(words[words.length - 1]) === compactSelected) {
    return readableText(words.slice(0, -1).join(" "));
  }

  return readableText(labelText.slice(0, Math.max(0, labelText.length - selectedText.length)));
}

function associatedLabelText(element: HTMLElement) {
  const nativeControlLabel = labelTextFromNativeControl(element);
  if (nativeControlLabel) return nativeControlLabel;

  const labels: string[] = [];

  if (element.id) {
    document.querySelectorAll<HTMLLabelElement>(`label[for="${escapeCss(element.id)}"]`).forEach((label) => labels.push(cleanLabelText(label, element)));
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel) labels.push(cleanLabelText(wrappingLabel, element));

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    labelledBy.split(/\s+/).forEach((id) => {
      const label = document.getElementById(id);
      if (label) labels.push(label.textContent ?? "");
    });
  }

  return readableText(labels.join(" "));
}

function labelTextFromNativeControl(element: HTMLElement) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return "";

  const labels = element.labels ? Array.from(element.labels) : [];
  for (const label of labels) {
    const text = getWrappedLabelCaption(label, element);
    if (text) return text;
  }

  return "";
}

function getWrappedLabelCaption(label: HTMLLabelElement, control: Element) {
  const parts: string[] = [];

  for (const node of Array.from(label.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element === control || element.contains(control)) continue;
      if (element.matches("span, p, strong, b, small") || element.getAttribute("data-label") === "true") {
        const text = readableText(element.textContent);
        if (text) parts.push(text);
      }
    }

    if (node.nodeType === Node.TEXT_NODE) {
      const text = readableText(node.textContent);
      if (text) parts.push(text);
    }
  }

  return parts.length ? parts.join(" ") : "";
}

function directElementText(element: HTMLElement) {
  return readableText([
    getVisibleText(element),
    element.getAttribute("aria-label"),
    element.getAttribute("title"),
    element.getAttribute("placeholder"),
    element.getAttribute("name"),
    element.id,
    associatedLabelText(element)
  ].filter(Boolean).join(" "));
}

function getVisibleText(element: HTMLElement) {
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    return "";
  }
  return readableText(element.innerText || element.textContent);
}

function usefulDataAttributes(element: HTMLElement) {
  const attrs: Record<string, string> = {};
  Array.from(element.attributes).forEach((attr) => {
    if (attr.name.startsWith("data-") && !/(token|secret|password|otp|cvv|card|auth|key|session)/i.test(attr.name)) {
      attrs[attr.name] = attr.value;
    }
  });
  return attrs;
}

function accessibleName(element: HTMLElement) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    if (readableText(text)) return readableText(text);
  }
  return readableText(element.getAttribute("aria-label") || associatedLabelText(element) || element.getAttribute("placeholder") || getVisibleText(element));
}

function contextText(element: HTMLElement, selector: string, limit = 220) {
  const container = element.closest(selector);
  if (!container) return "";
  return cleanedContainerText(container, limit);
}

function cleanedContainerText(container: Element, limit = 220) {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("input, select, textarea, button, option, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], script, style").forEach((child) => child.remove());
  return readableText(clone.textContent).slice(0, limit);
}

function headingText(element: HTMLElement) {
  const container = element.closest("section, article, main, aside, form, dialog, [role='dialog'], [role='region'], [class*='card'], [class*='panel']");
  return readableText(container?.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']")?.textContent);
}

function siblingText(element: HTMLElement, direction: "previous" | "next") {
  let sibling = direction === "previous" ? element.previousElementSibling : element.nextElementSibling;
  while (sibling) {
    const text = readableText(sibling.textContent);
    if (text) return text.slice(0, 120);
    sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
  }
  return "";
}

function boundingBoxScore(element: HTMLElement, target: TargetElement) {
  return Math.round(positionMatchScore(element, target) * 24);
}

function positionMatchScore(element: HTMLElement, target: TargetElement) {
  if (!target.boundingBox) return 0;
  const rect = element.getBoundingClientRect();
  const box = {
    x: rect.x + window.scrollX,
    y: rect.y + window.scrollY,
    width: rect.width,
    height: rect.height
  };
  const xOverlap = Math.max(0, Math.min(target.boundingBox.x + target.boundingBox.width, box.x + box.width) - Math.max(target.boundingBox.x, box.x));
  const yOverlap = Math.max(0, Math.min(target.boundingBox.y + target.boundingBox.height, box.y + box.height) - Math.max(target.boundingBox.y, box.y));
  const overlapArea = xOverlap * yOverlap;
  const targetArea = target.boundingBox.width * target.boundingBox.height;
  const boxArea = box.width * box.height;
  const unionArea = targetArea + boxArea - overlapArea;
  const overlapScore = unionArea > 0 ? overlapArea / unionArea : 0;

  const targetCenterX = target.boundingBox.x + target.boundingBox.width / 2;
  const targetCenterY = target.boundingBox.y + target.boundingBox.height / 2;
  const boxCenterX = box.x + box.width / 2;
  const boxCenterY = box.y + box.height / 2;
  const centerDistance = Math.hypot(targetCenterX - boxCenterX, targetCenterY - boxCenterY);
  const targetDiagonal = Math.hypot(target.boundingBox.width, target.boundingBox.height);
  const centerScore = Math.max(0, 1 - centerDistance / Math.max(targetDiagonal * 3, 120));

  const widthRatio = Math.min(target.boundingBox.width, box.width) / Math.max(target.boundingBox.width, box.width, 1);
  const heightRatio = Math.min(target.boundingBox.height, box.height) / Math.max(target.boundingBox.height, box.height, 1);
  const sizeScore = Math.min(widthRatio, heightRatio);

  return Math.max(overlapScore, centerScore * 0.85 + sizeScore * 0.15);
}

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);

  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function findByCandidate(candidate: SelectorCandidate, target?: TargetElement) {
  try {
    debugFinder("trying selector candidate", { type: candidate.type, value: candidate.value });
    if (candidate.type === "xpath") return byXPath(candidate.value);
    if (candidate.type === "role-text") return byRoleText(candidate.value);
    if (candidate.type === "label-text") return byLabelText(candidate.value, target);
    return document.querySelector<HTMLElement>(candidate.value);
  } catch (error) {
    debugFinder("selector candidate failed", { type: candidate.type, value: candidate.value, error });
    return null;
  }
}

function targetTerms(target: TargetElement) {
  return [
    target.accessibleName,
    target.fallbackText,
    target.text,
    target.labelText,
    target.ariaLabel,
    target.placeholder,
    target.role,
    target.tagName
  ].map(readableText).filter(Boolean);
}

function textMatchScore(actual: unknown, expected: unknown, exactScore: number, containsScore: number) {
  const actualCompact = compactText(actual);
  const expectedCompact = compactText(expected);
  if (!actualCompact || !expectedCompact) return 0;
  if (actualCompact === expectedCompact) return exactScore;
  if (actualCompact.includes(expectedCompact) || expectedCompact.includes(actualCompact)) return containsScore;
  return 0;
}

export function scoreCandidate(element: HTMLElement, target: TargetElement) {
  let score = 0;
  const dataAttributes = usefulDataAttributes(element);
  const targetData = target.dataAttributes ?? {};

  if (targetData["data-adoption-id"] && dataAttributes["data-adoption-id"] === targetData["data-adoption-id"]) score += 100;

  (["data-testid", "data-test", "data-cy"] as const).forEach((attr) => {
    if (targetData[attr] && dataAttributes[attr] === targetData[attr]) score += 90;
  });

  if (target.role && (element.getAttribute("role") ?? "").toLowerCase() === target.role.toLowerCase()) score += 16;
  if (target.tagName && element.tagName.toLowerCase() === target.tagName.toLowerCase()) score += 12;
  if (target.inputType && element instanceof HTMLInputElement && element.type.toLowerCase() === target.inputType.toLowerCase()) score += 10;
  if (target.name && element.getAttribute("name") === target.name) score += 22;
  if (target.id && element.id === target.id && !/^[a-z0-9]{8,}$|__[A-Z]|^ember\d+|^ng-/i.test(target.id)) score += 18;

  score += textMatchScore(accessibleName(element), target.accessibleName ?? target.fallbackText, 42, 25);
  score += textMatchScore(getVisibleText(element), target.text ?? target.fallbackText, 36, 20);
  score += textMatchScore(associatedLabelText(element), target.labelText, 40, 24);
  score += textMatchScore(element.getAttribute("aria-label"), target.ariaLabel, 34, 20);
  score += textMatchScore(element.getAttribute("placeholder"), target.placeholder, 30, 18);

  const nearbyHeading = headingText(element);
  const parentContainerText = contextText(element, "label, fieldset, section, article, form, dialog, [role='dialog'], [class*='card'], [class*='panel']");
  score += textMatchScore(nearbyHeading, target.nearbyHeading, 16, 9);
  score += textMatchScore(parentContainerText, target.parentContainerText, 12, 6);
  score += textMatchScore(siblingText(element, "previous"), target.previousSiblingText, 10, 5);
  score += textMatchScore(siblingText(element, "next"), target.nextSiblingText, 10, 5);
  score += textMatchScore(element.parentElement?.tagName.toLowerCase(), target.parentTagName, 8, 4);
  score += textMatchScore(element.parentElement?.getAttribute("role"), target.parentRole, 10, 5);
  score += textMatchScore(element.parentElement ? cleanedContainerText(element.parentElement, 180) : "", target.parentText, 12, 6);
  score += textMatchScore(contextText(element, "form, fieldset", 160), target.formTitle, 14, 8);
  score += textMatchScore(contextText(element, "dialog, [role='dialog'], [aria-modal='true']", 160), target.dialogTitle, 14, 8);
  score += textMatchScore(contextText(element, "[data-card], [class*='card'], [class*='panel']", 160), target.cardTitle, 14, 8);

  const directCompact = compactText(directElementText(element));
  const contextCompact = compactText(parentContainerText || element.closest("label, section, form, aside, nav, main")?.textContent);
  targetTerms(target).forEach((term) => {
    const termCompact = compactText(term);
    if (!termCompact) return;
    if (directCompact === termCompact) score += 18;
    else if (directCompact.includes(termCompact) || termCompact.includes(directCompact)) score += 10;
    else if (contextCompact.includes(termCompact)) score += 3;
  });

  return score + boundingBoxScore(element, target);
}

function collectInteractiveElements() {
  return Array.from(new Set(document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [role], [tabindex]:not([tabindex='-1'])")))
    .filter(isVisible);
}

function resolveAmbiguousByPosition(candidates: ScoredCandidate[], target: TargetElement) {
  if (!target.boundingBox || candidates.length < 2) return null;

  const byPosition = [...candidates].sort((first, second) => second.positionScore - first.positionScore);
  const best = byPosition[0];
  const second = byPosition[1];
  const positionDelta = best.positionScore - second.positionScore;

  if (best.score < MIN_MATCH_SCORE || best.positionScore < POSITION_RESOLVE_MIN_SCORE || positionDelta < POSITION_RESOLVE_MIN_DELTA) {
    return null;
  }

  debugFinder("ambiguous controls resolved by recorded position", {
    score: best.score,
    positionScore: best.positionScore,
    positionDelta
  });
  return best;
}

export function findControl(target: TargetElement): ControlFindResult {
  const selectorMatches = findTargetElements(target);
  if (selectorMatches.length === 1) {
    const score = scoreCandidate(selectorMatches[0], target);
    if (score >= MIN_MATCH_SCORE) {
      return {
        element: selectorMatches[0],
        score,
        ambiguous: false,
        candidates: [{ element: selectorMatches[0], score }],
        needsConfirmation: false
      };
    }
  }

  const candidates = Array.from(new Set([...selectorMatches, ...collectInteractiveElements()]))
    .map((element) => ({ element, score: scoreCandidate(element, target), positionScore: positionMatchScore(element, target) }))
    .sort((first, second) => second.score - first.score);

  const best = candidates[0];
  const second = candidates[1];
  const positionResolved = best && second && best.score >= MIN_MATCH_SCORE && best.score - second.score <= AMBIGUOUS_SCORE_DELTA
    ? resolveAmbiguousByPosition(candidates, target)
    : null;
  const ambiguous = Boolean(best && second && best.score >= MIN_MATCH_SCORE && best.score - second.score <= AMBIGUOUS_SCORE_DELTA && !positionResolved);
  const needsConfirmation = !best || best.score < MIN_MATCH_SCORE || ambiguous;

  return {
    element: positionResolved?.element ?? (best && best.score >= MIN_MATCH_SCORE && !ambiguous ? best.element : null),
    score: best?.score ?? 0,
    ambiguous,
    candidates: ambiguous ? candidates.filter((candidate) => best && best.score - candidate.score <= AMBIGUOUS_SCORE_DELTA).slice(0, 5) : candidates.slice(0, 5),
    needsConfirmation
  };
}

export function findTargetElement(target: TargetElement) {
  const result = findControl(target);
  if (result.element) return result.element;

  if (!result.ambiguous && target.fallbackText) {
    return findVisibleControlByText([target.fallbackText]);
  }

  return null;
}

export function findTargetElements(target: TargetElement) {
  const matches = new Set<HTMLElement>();

  [...target.selectorCandidates].sort((first, second) => {
    const priority = (SELECTOR_PRIORITY[first.type] ?? 99) - (SELECTOR_PRIORITY[second.type] ?? 99);
    return priority || second.confidence - first.confidence;
  }).forEach((candidate) => {
    try {
      if (candidate.type === "xpath" || candidate.type === "role-text" || candidate.type === "label-text") {
        const elements = candidate.type === "label-text" ? labelTextMatches(candidate.value) : [findByCandidate(candidate, target)].filter(Boolean) as HTMLElement[];
        const visibleElements = elements.filter(isVisible);
        if (visibleElements.length > 0) {
          visibleElements.forEach((element) => matches.add(element));
          debugFinder("selector candidate matched visible element", { type: candidate.type, count: visibleElements.length });
        } else {
          debugFinder("selector candidate had no visible match", { type: candidate.type, value: candidate.value });
        }
        return;
      }

      let count = 0;
      document.querySelectorAll<HTMLElement>(candidate.value).forEach((element) => {
        if (isVisible(element)) {
          count += 1;
          matches.add(element);
        }
      });
      debugFinder(count > 0 ? "selector candidate matched visible elements" : "selector candidate had no visible match", { type: candidate.type, value: candidate.value, count });
    } catch (error) {
      debugFinder("selector candidate failed", { type: candidate.type, value: candidate.value, error });
    }
  });

  return Array.from(matches);
}

export function findVisibleControlByText(terms: string[]) {
  const normalizedTerms = terms.map(compactText).filter(Boolean);
  const controls = Array.from(document.querySelectorAll<HTMLElement>("a, button, [role='button'], [role='link'], [role='menuitem'], input, select, textarea"));

  return controls.find((control) => {
    if (!isVisible(control)) return false;
    const text = compactText(directElementText(control));

    return normalizedTerms.some((term) => text.includes(term));
  }) ?? null;
}

export { isVisible };
