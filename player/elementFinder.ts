import type { SelectorCandidate, TargetElement } from "@/shared/guideTypes";

function byXPath(xpath: string) {
  const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  return result.singleNodeValue instanceof HTMLElement ? result.singleNodeValue : null;
}

function byRoleText(value: string) {
  const [role, text] = value.split("::");
  const normalizedText = text?.trim().toLowerCase() ?? "";

  return Array.from(document.querySelectorAll<HTMLElement>(`[role="${CSS.escape(role)}"]`))
    .find((element) => element.innerText.trim().toLowerCase() === normalizedText) ?? null;
}

function findByCandidate(candidate: SelectorCandidate) {
  try {
    if (candidate.type === "xpath") return byXPath(candidate.value);
    if (candidate.type === "role-text") return byRoleText(candidate.value);
    return document.querySelector<HTMLElement>(candidate.value);
  } catch {
    return null;
  }
}

export function findTargetElement(target: TargetElement) {
  const candidates = [...target.selectorCandidates].sort((first, second) => second.confidence - first.confidence);

  for (const candidate of candidates) {
    const element = findByCandidate(candidate);

    if (element) {
      return element;
    }
  }

  return null;
}
