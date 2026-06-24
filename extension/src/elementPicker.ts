import type { ElementIdentity } from "./types";
import { buildElementIdentity } from "./controlIdentity";

const PICKER_OVERLAY_ID = "scout-picker-overlay";
const PICKER_LABEL_ID = "scout-picker-label";
const PICKER_HIGHLIGHT_ID = "scout-picker-highlight";

let pickerActive = false;
let currentHighlightedElement: Element | null = null;
let pickerResolve: ((identity: ElementIdentity | null) => void) | null = null;

/**
 * Create styles for picker mode
 */
function injectPickerStyles() {
  if (document.getElementById("scout-picker-styles")) return;

  const style = document.createElement("style");
  style.id = "scout-picker-styles";
  style.textContent = `
    #${PICKER_HIGHLIGHT_ID} {
      position: absolute;
      pointer-events: none;
      border: 2px solid #3b82f6;
      background: rgba(59, 130, 246, 0.1);
      border-radius: 4px;
      z-index: 2147483646;
      transition: all 0.15s ease;
    }

    #${PICKER_LABEL_ID} {
      position: absolute;
      pointer-events: none;
      background: #1e293b;
      color: #f1f5f9;
      padding: 6px 10px;
      border-radius: 6px;
      font: 11px system-ui, sans-serif;
      line-height: 1.4;
      z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      white-space: nowrap;
      max-width: 320px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #${PICKER_LABEL_ID} .confidence-high {
      color: #34d399;
      font-weight: 600;
    }

    #${PICKER_LABEL_ID} .confidence-medium {
      color: #fbbf24;
      font-weight: 600;
    }

    #${PICKER_LABEL_ID} .confidence-low {
      color: #f87171;
      font-weight: 600;
    }

    #${PICKER_OVERLAY_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.02);
      z-index: 2147483645;
      cursor: crosshair;
    }
  `;

  document.head.appendChild(style);
}

/**
 * Create picker overlay elements
 */
function createPickerElements() {
  // Overlay
  const overlay = document.createElement("div");
  overlay.id = PICKER_OVERLAY_ID;
  document.body.appendChild(overlay);

  // Highlight box
  const highlight = document.createElement("div");
  highlight.id = PICKER_HIGHLIGHT_ID;
  document.body.appendChild(highlight);

  // Label
  const label = document.createElement("div");
  label.id = PICKER_LABEL_ID;
  document.body.appendChild(label);
}

/**
 * Remove picker overlay elements
 */
function removePickerElements() {
  document.getElementById(PICKER_OVERLAY_ID)?.remove();
  document.getElementById(PICKER_HIGHLIGHT_ID)?.remove();
  document.getElementById(PICKER_LABEL_ID)?.remove();
}

/**
 * Update highlight position and label
 */
function updateHighlight(element: Element) {
  const highlight = document.getElementById(PICKER_HIGHLIGHT_ID);
  const label = document.getElementById(PICKER_LABEL_ID);

  if (!highlight || !label) return;

  const rect = element.getBoundingClientRect();

  // Position highlight box
  highlight.style.top = `${rect.top + window.scrollY}px`;
  highlight.style.left = `${rect.left + window.scrollX}px`;
  highlight.style.width = `${rect.width}px`;
  highlight.style.height = `${rect.height}px`;

  // Build element identity to show confidence
  const identity = buildElementIdentity(element, window.location.href);

  // Get best selector info
  const bestSelector = identity.selectorCandidates[0];
  const confidence = identity.confidenceScore;

  // Confidence class
  let confidenceClass = "confidence-low";
  if (confidence >= 0.85) confidenceClass = "confidence-high";
  else if (confidence >= 0.70) confidenceClass = "confidence-medium";

  // Build label content
  const tagInfo = identity.tagName.toUpperCase();
  const textInfo = identity.text
    ? `"${identity.text.slice(0, 30)}${identity.text.length > 30 ? "..." : ""}"`
    : identity.labelText
    ? `label: ${identity.labelText.slice(0, 30)}`
    : "";

  label.innerHTML = `
    <div>
      <strong>${tagInfo}</strong>
      ${textInfo ? `<span style="color: #94a3b8;"> ${textInfo}</span>` : ""}
    </div>
    <div style="margin-top: 2px;">
      <span style="color: #cbd5e1;">${bestSelector?.type || "unknown"}</span>
      <span class="${confidenceClass}"> ${Math.round(confidence * 100)}%</span>
    </div>
  `;

  // Position label above or below element
  const labelRect = label.getBoundingClientRect();
  const spaceAbove = rect.top;
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceAbove > labelRect.height + 10) {
    // Position above
    label.style.top = `${rect.top + window.scrollY - labelRect.height - 8}px`;
  } else if (spaceBelow > labelRect.height + 10) {
    // Position below
    label.style.top = `${rect.bottom + window.scrollY + 8}px`;
  } else {
    // Position at top of viewport
    label.style.top = `${window.scrollY + 10}px`;
  }

  label.style.left = `${rect.left + window.scrollX}px`;
}

/**
 * Handle mouse move during picker mode
 */
function handleMouseMove(event: MouseEvent) {
  if (!pickerActive) return;

  // Don't highlight picker elements themselves
  const target = event.target as Element;
  if (
    target.id === PICKER_OVERLAY_ID ||
    target.id === PICKER_HIGHLIGHT_ID ||
    target.id === PICKER_LABEL_ID ||
    target.closest(`#${PICKER_OVERLAY_ID}`) ||
    target.closest(`#${PICKER_HIGHLIGHT_ID}`) ||
    target.closest(`#${PICKER_LABEL_ID}`)
  ) {
    return;
  }

  // Ignore if targeting toolbar
  if (target.closest("#scout-guided-workflow-recorder")) {
    return;
  }

  currentHighlightedElement = target;
  updateHighlight(target);
}

/**
 * Handle click during picker mode
 */
function handleClick(event: MouseEvent) {
  if (!pickerActive) return;

  // Prevent the real click from happening
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const target = event.target as Element;

  // Ignore clicks on picker elements
  if (
    target.id === PICKER_OVERLAY_ID ||
    target.id === PICKER_HIGHLIGHT_ID ||
    target.id === PICKER_LABEL_ID ||
    target.closest(`#${PICKER_OVERLAY_ID}`) ||
    target.closest("#scout-guided-workflow-recorder")
  ) {
    return;
  }

  // Capture element identity
  const identity = buildElementIdentity(target, window.location.href);

  // Exit picker mode
  exitPickerMode();

  // Resolve with captured identity
  if (pickerResolve) {
    pickerResolve(identity);
    pickerResolve = null;
  }
}

/**
 * Handle escape key to cancel picker mode
 */
function handleKeyDown(event: KeyboardEvent) {
  if (!pickerActive) return;

  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    exitPickerMode();

    // Resolve with null (cancelled)
    if (pickerResolve) {
      pickerResolve(null);
      pickerResolve = null;
    }
  }
}

/**
 * Exit picker mode and clean up
 */
function exitPickerMode() {
  if (!pickerActive) return;

  pickerActive = false;
  currentHighlightedElement = null;

  // Remove event listeners
  document.removeEventListener("mousemove", handleMouseMove, true);
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("keydown", handleKeyDown, true);

  // Remove UI elements
  removePickerElements();
}

/**
 * Enter picker mode and wait for user to select an element
 *
 * Returns a promise that resolves with:
 * - ElementIdentity when user clicks an element
 * - null when user cancels (Escape)
 *
 * Usage:
 * ```
 * const identity = await enterPickerMode();
 * if (identity) {
 *   // User selected an element
 * }
 * ```
 */
export function enterPickerMode(): Promise<ElementIdentity | null> {
  // Exit any existing picker mode
  exitPickerMode();

  // Set picker as active
  pickerActive = true;

  // Inject styles
  injectPickerStyles();

  // Create UI elements
  createPickerElements();

  // Add event listeners (capture phase to intercept before app handlers)
  document.addEventListener("mousemove", handleMouseMove, true);
  document.addEventListener("click", handleClick, true);
  document.addEventListener("keydown", handleKeyDown, true);

  // Return promise that resolves when user selects or cancels
  return new Promise((resolve) => {
    pickerResolve = resolve;
  });
}

/**
 * Check if picker mode is currently active
 */
export function isPickerActive(): boolean {
  return pickerActive;
}

/**
 * Force exit picker mode (for cleanup)
 */
export function cancelPickerMode() {
  exitPickerMode();
  if (pickerResolve) {
    pickerResolve(null);
    pickerResolve = null;
  }
}
