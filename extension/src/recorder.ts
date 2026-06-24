import type { RecordedAction, RecordedActionType, ElementIdentity } from "./types";
import { buildElementIdentity } from "./controlIdentity";

const sensitiveNamePattern = /(password|token|secret|card|cvv|otp|ssn|account)/i;

function createId() {
  return `action_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

/**
 * Mask sensitive input values to prevent recording secrets
 */
function maskValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const input = element as HTMLInputElement;
  const value = String(element.value ?? "");
  const identity = `${input.type ?? ""} ${input.name ?? ""} ${input.id ?? ""} ${input.placeholder ?? ""}`;

  if (!value) return "";

  // Always mask password fields
  if (input.type === "password") return "[masked-password]";

  // Mask fields with sensitive names
  if (sensitiveNamePattern.test(identity)) return "[masked-sensitive]";

  // Mask email addresses (partially)
  if (input.type === "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    const [name, domain] = value.split("@");
    return `${name.slice(0, 2)}***@${domain}`;
  }

  // Mask card-like numbers (13+ digits)
  if (value.replace(/\D/g, "").length >= 13) {
    return "[masked-card-number]";
  }

  // Mask CVV-like patterns (3-4 digits only)
  if (/^\d{3,4}$/.test(value) && /cvv|cvc|security/i.test(identity)) {
    return "[masked-cvv]";
  }

  // Mask OTP-like patterns
  if (/^\d{4,8}$/.test(value) && /otp|code|token|pin/i.test(identity)) {
    return "[masked-otp]";
  }

  // Truncate long values
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

/**
 * Create a recorded action from a DOM event target
 *
 * This captures the complete element identity with multiple selector fallbacks
 * and confidence scoring. Low-confidence captures will be flagged for user confirmation.
 */
export function createRecordedAction(
  type: RecordedActionType,
  target: EventTarget | null,
  originalEventType?: string
): RecordedAction | null {
  const element = target instanceof Element ? target : null;

  if (!element) return null;

  // Build complete element identity with all selector candidates
  const elementIdentity = buildElementIdentity(element, window.location.href);

  // Handle input fields with value masking
  const field =
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
      ? element
      : null;

  const maskedValue = field ? maskValue(field) : undefined;

  return {
    id: createId(),
    type,
    url: location.href,
    timestamp: Date.now(),
    elementIdentity,
    maskedValue,
    originalEventType,
    // Legacy fields for backward compatibility
    selectorCandidates: elementIdentity.selectorCandidates,
    elementText: elementIdentity.text,
    ariaLabel: elementIdentity.ariaLabel,
    role: elementIdentity.role,
    tagName: elementIdentity.tagName,
    inputType: field instanceof HTMLInputElement ? field.type : undefined,
    labelText: elementIdentity.labelText,
    valueMasked: maskedValue,
  };
}

/**
 * Create a manual select action from element picker
 */
export function createManualSelectAction(
  elementIdentity: ElementIdentity
): RecordedAction {
  return {
    id: createId(),
    type: "manual-select",
    url: location.href,
    timestamp: Date.now(),
    elementIdentity,
    originalEventType: "manual-picker",
    // Legacy fields
    selectorCandidates: elementIdentity.selectorCandidates,
    elementText: elementIdentity.text,
    ariaLabel: elementIdentity.ariaLabel,
    role: elementIdentity.role,
    tagName: elementIdentity.tagName,
    labelText: elementIdentity.labelText,
  };
}

/**
 * Create a navigation action
 */
export function createNavigationAction(url: string): RecordedAction {
  return {
    id: createId(),
    type: "navigation",
    url,
    timestamp: Date.now(),
    selectorCandidates: [],
  };
}
