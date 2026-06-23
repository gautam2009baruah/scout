import type { RecordedAction, RecordedActionType } from "./types";
import { buildSelectorCandidates } from "./selectorBuilder";

const sensitiveNamePattern = /(password|token|secret|card|cvv|otp)/i;

function createId() {
  return `action_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function labelText(element: HTMLElement) {
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`);
    if (label) return label.innerText.trim();
  }

  return element.closest("label")?.textContent?.replace(/\s+/g, " ").trim();
}

function nearbyText(element: HTMLElement) {
  return element.parentElement?.innerText?.replace(/\s+/g, " ").trim().slice(0, 160);
}

function maskValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
  const input = element as HTMLInputElement;
  const value = String(element.value ?? "");
  const identity = `${input.type ?? ""} ${input.name ?? ""} ${input.id ?? ""}`;

  if (!value) return "";
  if (input.type === "password" || sensitiveNamePattern.test(identity)) return "[masked]";
  if (input.type === "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }
  if (value.replace(/\D/g, "").length >= 13) return "[masked-card-like-value]";

  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

export function createRecordedAction(type: RecordedActionType, target: EventTarget | null): RecordedAction | null {
  const element = target instanceof HTMLElement ? target : null;

  if (!element) return null;

  const field = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
    ? element
    : null;

  return {
    id: createId(),
    type,
    url: location.href,
    timestamp: Date.now(),
    selectorCandidates: buildSelectorCandidates(element),
    elementText: element.innerText?.replace(/\s+/g, " ").trim().slice(0, 120),
    ariaLabel: element.getAttribute("aria-label") ?? undefined,
    role: element.getAttribute("role") ?? undefined,
    tagName: element.tagName.toLowerCase(),
    inputType: field instanceof HTMLInputElement ? field.type : undefined,
    labelText: labelText(element),
    nearbyText: nearbyText(element),
    valueMasked: field ? maskValue(field) : undefined
  };
}

export function createNavigationAction(url: string): RecordedAction {
  return {
    id: createId(),
    type: "navigation",
    url,
    timestamp: Date.now(),
    selectorCandidates: []
  };
}
