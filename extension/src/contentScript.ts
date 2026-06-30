import { browserApi } from "./browserApi";
import {
  createRecordedAction,
  createManualSelectAction,
  defaultTriggerForElementIdentity,
} from "./recorder";
import type { GuidePageContext, GuideStepPurpose, GuideStepTrigger, NavigationStepMode, RecorderConfig, RecorderStatus, RecordingState } from "./types";
import { enterPickerMode, isPickerActive } from "./elementPicker";
import { findElement } from "./elementFinder";

const toolbarId = "scout-guided-workflow-recorder";
const confirmationDialogId = "scout-confirmation-dialog";
const pickerReviewDialogId = "scout-picker-review-dialog";
const toastId = "scout-recorder-toast";
const previewOverlayId = "scout-recorder-preview";
const recorderBuild = "202606241500";
declare const chrome: any;
declare const SCOUT_JODIT_CSS: string | undefined;

type ScoutJoditInstance = {
  destruct(): void;
  events: { on(eventName: "change", handler: () => void): void };
  value: string;
};
type ScoutJoditConstructor = {
  make(element: Element | string, options: Record<string, unknown>): ScoutJoditInstance;
};

declare global {
  interface Window {
    Jodit?: ScoutJoditConstructor;
  }
}

const emptyRecordingState: RecordingState = { isRecording: false, isPaused: false, actions: [] };

let isInPickerMode = false;
let pendingConfirmationAction: ReturnType<typeof createRecordedAction> | null =
  null;
let lastPickedIdentity: ReturnType<typeof createManualSelectAction>["elementIdentity"] | null = null;
let toolbarMinimized = true;
let toolbarPosition = { right: 14, bottom: Math.max(14, Math.floor(window.innerHeight / 2) - 24) };
let syncInProgress = false;

async function getState() {
  const stored = await browserApi.getStorage<{ recordingState?: RecordingState }>({ recordingState: emptyRecordingState });
  const state = { ...emptyRecordingState, ...(stored.recordingState ?? emptyRecordingState), actions: stored.recordingState?.actions ?? [] };
  return { ...state, isRecording: false, isPaused: false };
}

function currentPageContext(): GuidePageContext {
  return {
    url: window.location.href,
    title: document.title,
    capturedAt: new Date().toISOString()
  };
}

async function ensureStartContext() {
  const state = await getState();
  if (state.startContext) return state.startContext;

  const startContext = currentPageContext();
  await browserApi.setStorage({ recordingState: { ...state, startContext } });
  return startContext;
}

async function getRecorderMeta() {
  const stored = await browserApi.getStorage<{ recorderConfig?: RecorderConfig; recorderStatus?: RecorderStatus }>({
    recorderConfig: undefined,
    recorderStatus: { configured: false, postedCount: 0 }
  });

  if (stored.recorderConfig) {
    return stored;
  }

  if (stored.recorderStatus?.configured === false) {
    window.localStorage.removeItem("scoutRecorderConfig");
    return stored;
  }

  const localConfig = window.localStorage.getItem("scoutRecorderConfig");

  if (!localConfig) {
    return stored;
  }

  try {
    return {
      ...stored,
      recorderConfig: JSON.parse(localConfig) as RecorderConfig,
      recorderStatus: stored.recorderStatus ?? { configured: true, postedCount: 0 }
    };
  } catch {
    return stored;
  }
}

function showToast(message: string, tone: "success" | "error" | "info" = "info") {
  document.getElementById(toastId)?.remove();

  const toast = document.createElement("div");
  toast.id = toastId;
  toast.textContent = message;
  const background = tone === "error" ? "#991b1b" : tone === "success" ? "#065f46" : "#1e293b";
  toast.style.cssText = `position:fixed;right:${toolbarPosition.right + 54}px;bottom:${toolbarPosition.bottom}px;z-index:2147483647;max-width:min(360px,calc(100vw - 90px));background:${background};color:white;border-radius:10px;padding:10px 12px;font:12px system-ui,sans-serif;font-weight:650;box-shadow:0 12px 34px rgba(15,23,42,.35)`;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), tone === "error" ? 5000 : 3200);
}

async function sendAction(action: ReturnType<typeof createRecordedAction>, skipConfirmation = false) {
  if (!action) return;

  await ensureStartContext();
  const state = await getState();

  // Only check confirmation if recording is active
  if (!skipConfirmation && state.isRecording && !state.isPaused) {
    // Check if element needs user confirmation (low confidence)
    if (action.elementIdentity?.needsUserConfirmation) {
      showConfirmationDialog(action);
      return; // Wait for user to confirm or reselect
    }
  }

  const meta = await getRecorderMeta();
  await browserApi.sendMessage({
    type: "SCOUT_RECORDING_ACTION",
    action,
    recorderConfig: meta.recorderConfig,
  });
  window.setTimeout(async () => {
    const updated = await getState();
    const saved = updated.actions.some((item) => item.id === action.id);
    showToast(saved ? `Step ${action.stepOrder ?? updated.actions.length} saved locally. Sync pending.` : "Step was not saved. Please try again.", saved ? "success" : "error");
    await renderToolbar();
  }, 300);
}

/**
 * Show confirmation dialog for low-confidence element capture
 */
function showConfirmationDialog(
  action: ReturnType<typeof createRecordedAction>
) {
  if (!action) return;

  // Remove any existing dialog
  document.getElementById(confirmationDialogId)?.remove();

  pendingConfirmationAction = action;

  const dialog = document.createElement("div");
  dialog.id = confirmationDialogId;
  dialog.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 2147483647;
    background: #1e293b;
    color: #f1f5f9;
    padding: 20px;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    font: 14px system-ui, sans-serif;
    max-width: 400px;
    min-width: 320px;
  `;

  const confidence = Math.round(
    (action.elementIdentity?.confidenceScore ?? 0) * 100
  );
  const bestSelector = action.elementIdentity?.selectorCandidates[0];

  dialog.innerHTML = `
    <div style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
        <span style="font-size: 20px;">⚠️</span>
        <strong style="font-size: 16px;">Uncertain Control Identity</strong>
      </div>
      <div style="color: #cbd5e1; line-height: 1.6;">
        Control identity is uncertain. Confirm or reselect.
        <span style="color: #fbbf24; font-weight: 700;">${confidence}% confidence</span>
      </div>
      ${
        bestSelector
          ? `
        <div style="margin-top: 12px; padding: 10px; background: #0f172a; border-radius: 6px; font-size: 12px;">
          <div style="color: #94a3b8;">Best selector:</div>
          <div style="color: #e2e8f0; font-family: monospace; margin-top: 4px;">
            ${escapeHtml(`${bestSelector.type}: ${bestSelector.value}`)}
          </div>
        </div>
      `
          : ""
      }
    </div>
    <div style="display: flex; gap: 8px; justify-content: flex-end;">
      <button id="scout-confirm-ignore" style="padding: 8px 16px; background: #334155; color: #f1f5f9; border: none; border-radius: 6px; cursor: pointer; font: inherit;">
        Ignore Warning
      </button>
      <button id="scout-confirm-reselect" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font: inherit;">
        Reselect Control
      </button>
      <button id="scout-confirm-accept" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font: inherit;">
        Accept Anyway
      </button>
    </div>
  `;

  document.body.appendChild(dialog);

  // Handle button clicks
  document.getElementById("scout-confirm-accept")?.addEventListener("click", async () => {
    closeConfirmationDialog();
    if (pendingConfirmationAction) {
      const meta = await getRecorderMeta();
      await browserApi.sendMessage({
        type: "SCOUT_RECORDING_ACTION",
        action: pendingConfirmationAction,
        recorderConfig: meta.recorderConfig,
      });
      window.setTimeout(() => void renderToolbar(), 300);
    }
    pendingConfirmationAction = null;
  });

  document.getElementById("scout-confirm-reselect")?.addEventListener("click", async () => {
    closeConfirmationDialog();
    pendingConfirmationAction = null;
    await startPickerMode();
  });

  document.getElementById("scout-confirm-ignore")?.addEventListener("click", () => {
    closeConfirmationDialog();
    pendingConfirmationAction = null;
  });
}

/**
 * Close confirmation dialog
 */
function closeConfirmationDialog() {
  document.getElementById(confirmationDialogId)?.remove();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

function sanitizeGuideHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["A", "B", "BLOCKQUOTE", "BR", "CODE", "COL", "COLGROUP", "DIV", "EM", "FONT", "H1", "H2", "H3", "H4", "H5", "H6", "I", "IMG", "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG", "SUB", "SUP", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "U", "UL"]);
  template.content.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const allowedHref = element.tagName === "A" && attribute.name === "href" && /^(https?:\/\/|\/|#scout-guide:)/i.test(attribute.value);
      const allowedImageSrc = element.tagName === "IMG" && attribute.name === "src" && /^(https?:\/\/|data:image\/(?:png|jpe?g|gif|webp);base64,)/i.test(attribute.value);
      const allowedFont = element.tagName === "FONT" && ["color", "face"].includes(attribute.name);
      const allowedStyle = attribute.name === "style";
      const allowedClass = attribute.name === "class";
      const allowedTableAttribute = ["border", "cellpadding", "cellspacing", "colspan", "rowspan", "scope"].includes(attribute.name);
      const allowedMediaAttribute = element.tagName === "IMG" && ["alt", "height", "title", "width"].includes(attribute.name);
      if (allowedStyle) {
        const safeRules = attribute.value.split(";").map((rule) => rule.trim()).filter((rule) => /^(color|background-color|font-family|font-size|font-weight|font-style|text-align|text-decoration|width|height|border|border-collapse|vertical-align|padding|margin)\s*:/i.test(rule) && !/url|expression|javascript/i.test(rule));
        if (safeRules.length > 0) element.setAttribute("style", safeRules.join("; "));
        else element.removeAttribute("style");
      } else if (allowedClass) {
        const safeClasses = attribute.value.split(/\s+/).filter((className) => /^(ql-align-|ql-direction-rtl|ql-indent-|ql-size-|jodit-)/.test(className));
        if (safeClasses.length > 0) element.setAttribute("class", safeClasses.join(" "));
        else element.removeAttribute("class");
      } else if (!allowedHref && !allowedImageSrc && !allowedFont && !allowedTableAttribute && !allowedMediaAttribute) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML.replace(/<div><br><\/div>/g, "<br>").trim();
}

function plainTextFromHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  return (template.content.textContent ?? "").replace(/\s+/g, " ").trim();
}

function controlSummary(identity: NonNullable<typeof lastPickedIdentity>) {
  return identity.text || identity.labelText || identity.ariaLabel || identity.placeholder || identity.name || identity.id || identity.tagName;
}

function modalButtonStyle(background: string, color = "white") {
  return `padding:7px 10px;background:${background};color:${color};border:none;border-radius:7px;cursor:pointer;font:12px system-ui,sans-serif;font-weight:600`;
}

function ensurePickerEditorStyles() {
  if (document.getElementById("scout-picker-editor-styles")) return;
  const style = document.createElement("style");
  style.id = "scout-picker-editor-styles";
  style.textContent = `
    ${typeof SCOUT_JODIT_CSS === "string" ? SCOUT_JODIT_CSS : ""}
    #${pickerReviewDialogId} .jodit-container {
      border-color: #334155;
      color: #0f172a;
      max-width: 100%;
    }
    #${pickerReviewDialogId} .jodit-workplace {
      min-height: 130px;
      max-height: 230px;
    }
    #${pickerReviewDialogId} .jodit-wysiwyg {
      font: 12px/1.45 system-ui, sans-serif;
    }
    #${pickerReviewDialogId} .jodit-wysiwyg a {
      color: #93c5fd;
      text-decoration: underline;
    }
  `;
  document.head.appendChild(style);
}

function createPickerRichTextEditor(container: Element | null) {
  const JoditEditor = window.Jodit;
  if (!container || !JoditEditor) return null;

  return JoditEditor.make(container, {
    askBeforePasteHTML: false,
    askBeforePasteFromWord: false,
    defaultActionOnPaste: "insert_clear_html",
    height: 260,
    minHeight: 150,
    placeholder: "Example: Click Save to finish the request.",
    showCharsCounter: false,
    showWordsCounter: false,
    showXPathInStatusbar: false,
    uploader: {
      insertImageAsBase64URI: true
    }
  });
}

function isRecorderConfigured(config: RecorderConfig | undefined) {
  return Boolean(config?.scoutBaseUrl && config.recorderToken && config.sessionTitle);
}

function attachDialogDrag(dialog: HTMLElement, handle: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  handle.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button,input,select,textarea")) return;
    const rect = dialog.getBoundingClientRect();
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startLeft = rect.left;
    startTop = rect.top;
    dialog.style.left = `${rect.left}px`;
    dialog.style.top = `${rect.top}px`;
    dialog.style.right = "auto";
    dialog.style.bottom = "auto";
    handle.setPointerCapture(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const rect = dialog.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
    const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
    const nextLeft = Math.min(Math.max(8, startLeft + event.clientX - startX), maxLeft);
    const nextTop = Math.min(Math.max(8, startTop + event.clientY - startY), maxTop);
    dialog.style.left = `${nextLeft}px`;
    dialog.style.top = `${nextTop}px`;
  });

  handle.addEventListener("pointerup", () => {
    dragging = false;
  });
}

async function showPickedControlReview(identity: NonNullable<typeof lastPickedIdentity>, stepOrder: number): Promise<{
  action: "accept" | "reselect" | "cancel";
  description?: string;
  purpose: GuideStepPurpose;
  navigationMode?: NavigationStepMode;
  trigger: GuideStepTrigger;
}> {
  document.getElementById(pickerReviewDialogId)?.remove();

  const meta = await getRecorderMeta();
  const sessionTitle = meta.recorderConfig?.sessionTitle?.trim();
  const bestSelector = identity.selectorCandidates[0];
  const confidence = Math.round(identity.confidenceScore * 100);
  const defaultTrigger = defaultTriggerForElementIdentity(identity);
  ensurePickerEditorStyles();
  const dialog = document.createElement("div");
  dialog.id = pickerReviewDialogId;
  dialog.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 2147483647;
    width: min(420px, calc(100vw - 16px));
    max-height: calc(100vh - 32px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #0f172a;
    color: #f8fafc;
    border: 1px solid rgba(148, 163, 184, .25);
    border-radius: 12px;
    box-shadow: 0 18px 50px rgba(15, 23, 42, .45);
    font: 12px system-ui, sans-serif;
  `;

  dialog.innerHTML = `
    <style>
      #${pickerReviewDialogId}, #${pickerReviewDialogId} * { box-sizing: border-box; }
      #${pickerReviewDialogId} { max-width: calc(100vw - 32px); }
      #scout-picker-scroll-area { overflow-x: hidden; }
    </style>
    <div id="scout-picker-drag-handle" style="display:flex;justify-content:space-between;gap:10px;align-items:start;padding:14px 14px 10px;border-bottom:1px solid rgba(148,163,184,.18);cursor:move;user-select:none">
      <div style="min-width:0">
        <div style="font-weight:700;font-size:13px">Review selected control</div>
        ${sessionTitle ? `<div style="margin-top:3px;color:#93c5fd">Session: ${escapeHtml(sessionTitle)}</div>` : ""}
      </div>
      <div style="border-radius:999px;background:${identity.confidenceScore >= 0.75 ? "#064e3b" : "#78350f"};color:${identity.confidenceScore >= 0.75 ? "#d1fae5" : "#fef3c7"};padding:3px 8px;font-weight:700">${confidence}%</div>
    </div>
    <div id="scout-picker-scroll-area" style="overflow:auto;padding:12px 14px;min-height:0">
    ${
      identity.needsUserConfirmation
        ? `<div style="margin-top:10px;border-radius:8px;background:#451a03;color:#fde68a;padding:8px">Control identity is uncertain. Confirm or reselect.</div>`
        : ""
    }
    <div style="margin-top:10px;border-radius:8px;background:#020617;padding:9px">
      <div style="color:#94a3b8">Best selector</div>
      <div style="margin-top:3px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-all">${escapeHtml(bestSelector ? `${bestSelector.type}: ${bestSelector.value}` : "No selector")}</div>
      <div style="margin-top:6px;color:#94a3b8">${escapeHtml(bestSelector?.reason ?? "")}</div>
    </div>
    <div style="margin-top:10px;color:#94a3b8;display:grid;gap:3px">
      <div>Tag: ${escapeHtml(identity.tagName)}</div>
      ${identity.role ? `<div>Role: ${escapeHtml(identity.role)}</div>` : ""}
      ${identity.labelText ? `<div>Label: ${escapeHtml(identity.labelText)}</div>` : ""}
    </div>
    <div style="display:block;margin-top:12px;color:#cbd5e1">
      <span style="display:block;margin-bottom:5px;font-weight:700">Step description shown to users</span>
      <textarea id="scout-picker-description"></textarea>
    </div>
    <label style="display:block;margin-top:12px;color:#cbd5e1">
      <span style="display:block;margin-bottom:5px;font-weight:700">Step purpose</span>
      <select id="scout-picker-purpose" style="box-sizing:border-box;width:100%;border:1px solid #334155;border-radius:8px;background:#020617;color:#f8fafc;padding:8px;font:12px system-ui,sans-serif;outline:none">
        <option value="main">Main Training Step</option>
        <option value="navigation">Navigation Step</option>
      </select>
    </label>
    <label id="scout-picker-trigger-field" style="display:block;margin-top:12px;color:#cbd5e1">
      <span style="display:block;margin-bottom:5px;font-weight:700">Trigger</span>
      <select id="scout-picker-trigger" style="box-sizing:border-box;width:100%;border:1px solid #334155;border-radius:8px;background:#020617;color:#f8fafc;padding:8px;font:12px system-ui,sans-serif;outline:none">
        <option value="click"${defaultTrigger === "click" ? " selected" : ""}>Click</option>
        <option value="change"${defaultTrigger === "change" ? " selected" : ""}>Change</option>
        <option value="blur"${defaultTrigger === "blur" ? " selected" : ""}>Blur</option>
        <option value="focus"${defaultTrigger === "focus" ? " selected" : ""}>Focus</option>
        <option value="manualNext"${defaultTrigger === "manualNext" ? " selected" : ""}>Manual next</option>
      </select>
    </label>
    <div id="scout-picker-navigation-controls" style="display:none;margin-top:12px;border:1px solid #1e293b;border-radius:10px;padding:10px;background:#020617;color:#cbd5e1">
      <div style="font-weight:700;color:#f8fafc">Navigation behavior</div>
      <select id="scout-picker-navigation-mode" style="box-sizing:border-box;width:100%;margin-top:7px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#f8fafc;padding:8px;font:12px system-ui,sans-serif;outline:none">
        <option value="waitForUser">Wait for user click</option>
        <option value="autoClick">Auto-click this control</option>
      </select>
      <div style="margin-top:6px;color:#94a3b8;line-height:1.35">Use auto-click for entry/menu links that can safely move the user to the target page.</div>
    </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px 14px;border-top:1px solid rgba(148,163,184,.18);background:#0f172a">
      <button id="scout-picker-cancel" style="${modalButtonStyle("#334155")}">Cancel</button>
      <button id="scout-picker-reselect" style="${modalButtonStyle("#1d4ed8")}">Reselect</button>
      <button id="scout-picker-accept" style="${modalButtonStyle("#059669")}">Use Control</button>
    </div>
  `;

  document.body.appendChild(dialog);
  const dragHandle = document.getElementById("scout-picker-drag-handle");
  if (dragHandle) attachDialogDrag(dialog, dragHandle);
  const descriptionEditor = createPickerRichTextEditor(document.getElementById("scout-picker-description"));
  const purposeSelect = document.getElementById("scout-picker-purpose") as HTMLSelectElement | null;
  const navigationControls = document.getElementById("scout-picker-navigation-controls");
  const triggerField = document.getElementById("scout-picker-trigger-field");
  const syncNavigationControls = () => {
    if (navigationControls) {
      navigationControls.style.display = purposeSelect?.value === "navigation" ? "block" : "none";
    }
    if (triggerField) {
      triggerField.style.display = purposeSelect?.value === "navigation" ? "none" : "block";
    }
  };
  purposeSelect?.addEventListener("change", syncNavigationControls);
  syncNavigationControls();

  return new Promise((resolve) => {
    const finish = (value: "accept" | "reselect" | "cancel") => {
      const rawDescriptionHtml = descriptionEditor?.value ?? "";
      const descriptionHtml = sanitizeGuideHtml(rawDescriptionHtml);
      const description = plainTextFromHtml(descriptionHtml) ? descriptionHtml : undefined;
      const purposeValue = (document.getElementById("scout-picker-purpose") as HTMLSelectElement | null)?.value;
      const purpose: GuideStepPurpose = purposeValue === "navigation" ? "navigation" : "main";
      const navigationModeValue = (document.getElementById("scout-picker-navigation-mode") as HTMLSelectElement | null)?.value;
      const navigationMode: NavigationStepMode | undefined = purpose === "navigation" && navigationModeValue === "autoClick" ? "autoClick" : purpose === "navigation" ? "waitForUser" : undefined;
      const triggerValue = (document.getElementById("scout-picker-trigger") as HTMLSelectElement | null)?.value;
      const trigger: GuideStepTrigger =
        purpose === "navigation"
          ? "click"
          : triggerValue === "change" || triggerValue === "blur" || triggerValue === "focus" || triggerValue === "manualNext"
          ? triggerValue
          : "click";
      dialog.remove();
      descriptionEditor?.destruct();
      resolve({ action: value, description, purpose, navigationMode, trigger });
    };

    document.getElementById("scout-picker-accept")?.addEventListener("click", () => finish("accept"));
    document.getElementById("scout-picker-reselect")?.addEventListener("click", () => finish("reselect"));
    document.getElementById("scout-picker-cancel")?.addEventListener("click", () => finish("cancel"));
  });
}

/**
 * Start element picker mode
 */
async function startPickerMode() {
  if (isInPickerMode) return;

  const meta = await getRecorderMeta();
  if (!isRecorderConfigured(meta.recorderConfig)) {
    showToast("Configure a training session before creating steps.", "error");
    return;
  }
  await ensureStartContext();

  isInPickerMode = true;
  await renderToolbar(); // Update toolbar to show picker mode

  const identity = await enterPickerMode();

  isInPickerMode = false;
  await renderToolbar(); // Update toolbar after exiting picker mode

  if (identity) {
    lastPickedIdentity = identity;
    await renderToolbar();

    const currentState = await getState();
    const stepOrder = currentState.actions.length + 1;
    const reviewResult = await showPickedControlReview(identity, stepOrder);
    if (reviewResult.action === "reselect") {
      await startPickerMode();
      return;
    }

    if (reviewResult.action === "accept") {
      const action = createManualSelectAction(identity, reviewResult.description, stepOrder, reviewResult.purpose, reviewResult.navigationMode, reviewResult.trigger);
      await sendAction(action, true);
    }
  }
}

function smallButtonStyle(background: string, color = "white") {
  return `height:34px;width:34px;display:inline-flex;align-items:center;justify-content:center;background:${background};border:none;color:${color};border-radius:10px;cursor:pointer;font:12px system-ui,sans-serif;font-weight:600;white-space:nowrap`;
}

function icon(path: string) {
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

const icons = {
  scout: icon(`<path d="M12 3l7 4v5c0 4.5-2.8 7.6-7 9-4.2-1.4-7-4.5-7-9V7l7-4z"/><path d="M9 12l2 2 4-5"/>`),
  config: icon(`<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.1 2.1-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V20h-3v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1-2.1-2.1.1-.1A1.7 1.7 0 0 0 5 15.6a1.7 1.7 0 0 0-1.5-1H3v-3h.5a1.7 1.7 0 0 0 1.5-1A1.7 1.7 0 0 0 4.7 8.7l-.1-.1 2.1-2.1.1.1A1.7 1.7 0 0 0 8.7 7a1.7 1.7 0 0 0 1-1.5V5h3v.5a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.1 2.1-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.5 1h.5v3h-.5a1.7 1.7 0 0 0-1.5 1z"/>`),
  start: icon(`<polygon points="8 5 19 12 8 19 8 5"/>`),
  stop: icon(`<rect x="7" y="7" width="10" height="10" rx="1"/>`),
  pause: icon(`<path d="M10 5v14"/><path d="M14 5v14"/>`),
  resume: icon(`<polygon points="8 5 19 12 8 19 8 5"/>`),
  select: icon(`<circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/>`),
  clear: icon(`<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M7 6l1 14h8l1-14"/>`),
  preview: icon(`<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="3"/>`),
  sync: icon(`<path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 16h5v5"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 8h-5V3"/>`),
  spinner: icon(`<path d="M21 12a9 9 0 0 1-9 9"/><path d="M3 12a9 9 0 0 1 9-9"/>`),
  goal: icon(`<path d="M12 21V3"/><path d="M6 4h11l-2 4 2 4H6"/>`),
  export: icon(`<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>`),
  minimize: icon(`<path d="M6 12h12"/>`)
};

function iconButton(title: string, iconMarkup: string, onClick: () => void | Promise<void>, background = "#334155") {
  const element = document.createElement("button");
  element.type = "button";
  element.innerHTML = iconMarkup;
  element.title = title;
  element.setAttribute("aria-label", title);
  element.style.cssText = smallButtonStyle(background);
  element.addEventListener("click", async (event) => {
    event.stopPropagation();
    await onClick();
  });
  return element;
}

function addBadge(buttonElement: HTMLElement, value: number) {
  if (value <= 0) return buttonElement;

  buttonElement.style.position = "relative";
  const badge = document.createElement("span");
  badge.textContent = value > 9 ? "9+" : String(value);
  badge.style.cssText = "position:absolute;right:-5px;top:-5px;min-width:16px;height:16px;padding:0 3px;border-radius:999px;background:#ef4444;color:white;font:10px system-ui,sans-serif;font-weight:800;line-height:16px;text-align:center;box-shadow:0 0 0 2px #cbd5e1";
  buttonElement.appendChild(badge);
  return buttonElement;
}

function closePreview() {
  document.getElementById(previewOverlayId)?.remove();
}

async function deleteLocalStep(actionId: string) {
  const state = await getState();
  const meta = await getRecorderMeta();
  const actions = state.actions.filter((action) => action.id !== actionId);
  await browserApi.setStorage({
    recordingState: { ...state, actions },
    recorderStatus: {
      ...(meta.recorderStatus ?? { configured: Boolean(meta.recorderConfig), postedCount: 0 }),
      postedCount: Math.min(meta.recorderStatus?.postedCount ?? 0, actions.length),
      lastPostStatus: "Step deleted locally",
      lastError: ""
    }
  });
  showToast("Step deleted from local recording.", "success");
  await renderToolbar();
  await previewCreatedSteps();
}

async function previewCreatedSteps() {
  closePreview();
  const state = await getState();
  const actions = state.actions.filter((action) => action.elementIdentity);

  if (actions.length === 0) {
    showToast("No created steps to preview yet.", "info");
    return;
  }

  const root = document.createElement("div");
  root.id = previewOverlayId;
  root.style.cssText = "position:absolute;inset:0;z-index:2147483644;pointer-events:none;font:12px system-ui,sans-serif";

  const summary = document.createElement("div");
  summary.style.cssText = "position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:2147483647;pointer-events:auto;display:flex;align-items:center;gap:10px;border:1px solid rgba(148,163,184,.32);border-radius:999px;background:#020617;color:white;padding:8px 10px 8px 14px;box-shadow:0 16px 40px rgba(15,23,42,.38)";
  summary.innerHTML = `<strong>${actions.length} selected step${actions.length === 1 ? "" : "s"}</strong><span style="color:#cbd5e1">Review before syncing</span>`;
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.style.cssText = "height:28px;border:none;border-radius:999px;background:#334155;color:white;padding:0 10px;cursor:pointer;font:12px system-ui,sans-serif;font-weight:700";
  close.addEventListener("click", closePreview);
  summary.appendChild(close);
  root.appendChild(summary);

  for (const action of actions) {
    const identity = action.elementIdentity;
    if (!identity) continue;

    const element = findElement(identity);
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    const highlight = document.createElement("div");
    highlight.style.cssText = `position:absolute;left:${rect.left + window.scrollX}px;top:${rect.top + window.scrollY}px;width:${rect.width}px;height:${rect.height}px;border:2px solid #2563eb;background:rgba(37,99,235,.12);border-radius:8px;box-shadow:0 0 0 3px rgba(37,99,235,.16);pointer-events:none`;
    root.appendChild(highlight);

    const label = document.createElement("div");
    const order = action.stepOrder ?? actions.indexOf(action) + 1;
    const description = action.stepDescription || action.elementText || action.labelText || action.ariaLabel || action.tagName || "Selected control";
    const purpose = action.stepPurpose === "navigation" ? "Navigation" : "Main";
    const mode = action.stepPurpose === "navigation" ? action.navigationMode === "autoClick" ? "Auto-click" : "Wait" : "";
    label.style.cssText = `position:absolute;left:${rect.left + window.scrollX}px;top:${Math.max(8, rect.top + window.scrollY - 62)}px;max-width:320px;border-radius:12px;background:#0f172a;color:white;padding:8px 9px 9px;box-shadow:0 12px 32px rgba(15,23,42,.36);pointer-events:auto`;
    label.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:999px;background:#2563eb;font-weight:800">${order}</span>
        <strong style="flex:1">Step ${order}</strong>
        <button type="button" aria-label="Delete step ${order}" title="Delete step" data-scout-delete-step="${escapeHtml(action.id)}" style="display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:1px solid rgba(248,113,113,.42);border-radius:999px;background:rgba(127,29,29,.6);color:#fecaca;cursor:pointer;font:14px system-ui,sans-serif;font-weight:800;line-height:1">x</button>
      </div>
      <div style="margin-top:7px;display:flex;flex-wrap:wrap;gap:5px">
        <span style="border-radius:999px;background:${action.stepPurpose === "navigation" ? "#78350f" : "#064e3b"};color:${action.stepPurpose === "navigation" ? "#fde68a" : "#d1fae5"};padding:2px 7px;font-size:10px;font-weight:800">${purpose} Step</span>
        ${mode ? `<span style="border-radius:999px;background:#1e3a8a;color:#dbeafe;padding:2px 7px;font-size:10px;font-weight:800">${escapeHtml(mode)}</span>` : ""}
      </div>
      <div style="margin-top:7px;color:#dbeafe;line-height:1.35">${escapeHtml(description)}</div>
    `;
    label.querySelector<HTMLButtonElement>("[data-scout-delete-step]")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await deleteLocalStep(action.id);
    });
    root.appendChild(label);
  }

  document.body.appendChild(root);
  showToast("Preview is showing all created steps.", "success");
}

function attachDrag(root: HTMLElement) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;

  root.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    startRight = toolbarPosition.right;
    startBottom = toolbarPosition.bottom;
    root.setPointerCapture(event.pointerId);
  });

  root.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    toolbarPosition = {
      right: Math.max(4, startRight - (event.clientX - startX)),
      bottom: Math.max(4, startBottom - (event.clientY - startY))
    };
    root.style.right = `${toolbarPosition.right}px`;
    root.style.bottom = `${toolbarPosition.bottom}px`;
  });

  root.addEventListener("pointerup", () => {
    dragging = false;
  });
}

function button(label: string, messageType: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.style.cssText = smallButtonStyle("#334155");
  element.addEventListener("click", async () => {
    await browserApi.sendMessage({ type: messageType });
    await renderToolbar();
  });
  return element;
}

function syncButton() {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = "Sync";
  element.style.cssText = smallButtonStyle("#059669");
  element.addEventListener("click", async () => {
    const meta = await getRecorderMeta();
    await browserApi.sendMessage({
      type: "SCOUT_RECORDING_SYNC",
      recorderConfig: meta.recorderConfig,
    });
    window.setTimeout(() => void renderToolbar(), 600);
  });
  return element;
}

async function configureRecorder() {
  const rawConfig = window.prompt("Paste Scout recorder config JSON for this training session.");

  if (!rawConfig) {
    return;
  }

  try {
    const recorderConfig = JSON.parse(rawConfig);

    if (!recorderConfig?.scoutBaseUrl || !recorderConfig?.recorderToken || !recorderConfig?.sessionTitle) {
      window.alert("Recorder config must include scoutBaseUrl, recorderToken, and sessionTitle.");
      return;
    }

    await browserApi.setStorage({
      recorderConfig,
      recorderStatus: {
        configured: true,
        postedCount: 0,
        lastPostStatus: "Configured",
        lastError: ""
      }
    });
    await new Promise<void>((resolve) => {
      chrome?.storage?.local?.set?.({
        recorderConfig,
        recorderStatus: {
          configured: true,
          postedCount: 0,
          lastPostStatus: "Configured",
          lastError: ""
        }
      }, () => resolve());
    });
    window.localStorage.setItem("scoutRecorderConfig", JSON.stringify(recorderConfig));
    await browserApi.sendMessage({
      type: "SCOUT_RECORDER_CONFIGURE",
      recorderConfig
    });
    await ensureStartContext();
    const readBack = await getRecorderMeta();

    if (!readBack.recorderConfig) {
      window.alert("Config was accepted but could not be read back from extension storage.");
    }
    showToast(`Configured for ${recorderConfig.sessionTitle}.`, "success");
    await renderToolbar();
  } catch {
    showToast("Recorder config JSON is invalid.", "error");
  }
}

async function clearRecorderConfig() {
  const state = await getState();
  const meta = await getRecorderMeta();
  const pendingSyncCount = Math.max(0, state.actions.length - (meta.recorderStatus?.postedCount ?? 0));

  if (pendingSyncCount > 0) {
    showToast(`Sync ${pendingSyncCount} pending step${pendingSyncCount === 1 ? "" : "s"} before clearing config.`, "error");
    return;
  }

  try {
    await browserApi.sendMessage({ type: "SCOUT_RECORDER_CLEAR_CONFIG" });
    window.localStorage.removeItem("scoutRecorderConfig");
    showToast("Recorder config cleared. You can paste a new session config now.", "success");
    await renderToolbar();
  } catch {
    showToast("Unable to clear recorder config.", "error");
  }
}

async function exportJson() {
  const state = await getState();
  const startContext = state.startContext ?? currentPageContext();
  const firstMainStep = state.actions.find((action) => action.stepPurpose !== "navigation");
  const goalContext = firstMainStep
    ? {
      url: firstMainStep.url,
      title: document.title,
      capturedAt: new Date(firstMainStep.timestamp).toISOString()
    }
    : startContext;
  const entrySteps = state.actions.filter((action) => action.stepPurpose === "navigation");
  const mainSteps = state.actions.filter((action) => action.stepPurpose !== "navigation");
  const payload = {
    startContext,
    goalContext,
    entrySteps,
    mainSteps
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "scout-recording.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast(`Exported ${entrySteps.length} entry and ${mainSteps.length} main step${mainSteps.length === 1 ? "" : "s"}.`, "success");
}

async function renderToolbar() {
  document.getElementById(toolbarId)?.remove();
  const state = await getState();
  const meta = await getRecorderMeta();
  const configured = isRecorderConfigured(meta.recorderConfig);
  const pendingSyncCount = Math.max(0, state.actions.length - (meta.recorderStatus?.postedCount ?? 0));
  const root = document.createElement("div");
  root.id = toolbarId;
  root.style.cssText = `position:fixed;right:${toolbarPosition.right}px;bottom:${toolbarPosition.bottom}px;z-index:2147483647;display:flex;flex-direction:column;gap:7px;align-items:center;background:#cbd5e1;color:#0f172a;border:1px solid rgba(100,116,139,.55);border-radius:${toolbarMinimized ? "999px" : "18px"};padding:${toolbarMinimized ? "7px" : "8px"};box-shadow:0 14px 34px rgba(15,23,42,.22);font:12px system-ui,sans-serif;cursor:grab;user-select:none`;
  attachDrag(root);

  if (toolbarMinimized) {
    root.append(iconButton("Open Scout recorder", icons.scout, async () => {
      toolbarMinimized = false;
      await renderToolbar();
    }, "#2563eb"));
    document.body.appendChild(root);
    return;
  }

  root.append(iconButton("Minimize", icons.minimize, async () => {
    toolbarMinimized = true;
    await renderToolbar();
  }, "#1e293b"));

  if (!configured) {
    root.append(iconButton("Config", icons.config, configureRecorder, "#b45309"));
  } else {
    root.append(iconButton("Clear config", icons.config, clearRecorderConfig, pendingSyncCount > 0 ? "#7f1d1d" : "#334155"));
    root.append(iconButton(isInPickerMode ? "Creating step" : "Create step", icons.select, startPickerMode, isInPickerMode ? "#2563eb" : "#4f46e5"));
    root.append(iconButton("Preview created steps", icons.preview, previewCreatedSteps, "#334155"));
    root.append(iconButton("Clear recording", icons.clear, async () => {
      try {
        await browserApi.sendMessage({ type: "SCOUT_RECORDING_CLEAR" });
        showToast("Local recording cleared.", "success");
      } catch {
        showToast("Unable to clear local recording.", "error");
      }
      await renderToolbar();
    }, "#334155"));
    const sync = iconButton(syncInProgress ? "Syncing to Scout" : pendingSyncCount > 0 ? `Sync to Scout (${pendingSyncCount} pending)` : "Sync to Scout", syncInProgress ? icons.spinner : icons.sync, async () => {
      if (syncInProgress) return;
      syncInProgress = true;
      await renderToolbar();
      try {
        const before = await getState();
        const recorderMeta = await getRecorderMeta();
        const beforePending = Math.max(0, before.actions.length - (recorderMeta.recorderStatus?.postedCount ?? 0));
        await browserApi.sendMessage({
          type: "SCOUT_RECORDING_SYNC",
          recorderConfig: recorderMeta.recorderConfig,
        });
        window.setTimeout(async () => {
          syncInProgress = false;
          const after = await getState();
          const afterMeta = await getRecorderMeta();
          const afterPending = Math.max(0, after.actions.length - (afterMeta.recorderStatus?.postedCount ?? 0));
          if (afterMeta.recorderStatus?.lastError) {
            showToast(afterMeta.recorderStatus.lastError, "error");
          } else if (beforePending === 0) {
            showToast("No pending steps to sync.", "info");
          } else if (after.actions.length === 0 || afterPending === 0) {
            showToast(`Synced ${beforePending} step${beforePending === 1 ? "" : "s"} to Scout and cleared local recording.`, "success");
          } else {
            showToast(`${beforePending - afterPending} synced, ${afterPending} still pending.`, "error");
          }
          await renderToolbar();
        }, 900);
      } catch {
        syncInProgress = false;
        showToast("Unable to sync to Scout.", "error");
        await renderToolbar();
      }
    }, pendingSyncCount > 0 ? "#dc2626" : "#0f766e");
    root.append(addBadge(sync, pendingSyncCount));
    root.append(iconButton(`Export JSON (${state.actions.length})`, icons.export, exportJson, "#334155"));
  }

  // Add pulse animation style
  if (!document.getElementById("scout-toolbar-styles")) {
    const style = document.createElement("style");
    style.id = "scout-toolbar-styles";
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @keyframes scout-spin {
        to { transform: rotate(360deg); }
      }
      #${toolbarId} button[title="Syncing to Scout"] svg {
        animation: scout-spin .8s linear infinite;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(root);
}

// Event listeners for recording user actions
document.addEventListener(
  "click",
  async (event) => {
    // Skip if targeting toolbar
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${toolbarId}`)) return;

    // Skip if in picker mode (picker handles its own clicks)
    if (isPickerActive()) return;

    // Skip if in confirmation dialog
    if (target?.closest(`#${confirmationDialogId}`)) return;
    if (target?.closest(`#${pickerReviewDialogId}`)) return;

    // Only record if actively recording
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("click", event.target, "click"));
  },
  true
);

document.addEventListener(
  "change",
  async (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${toolbarId}`) || target?.closest(`#${confirmationDialogId}`) || target?.closest(`#${pickerReviewDialogId}`)) return;
    if (isPickerActive()) return;
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("change", event.target, "change"));
  },
  true
);

document.addEventListener(
  "input",
  async (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${toolbarId}`) || target?.closest(`#${confirmationDialogId}`) || target?.closest(`#${pickerReviewDialogId}`)) return;
    if (isPickerActive()) return;
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("input", event.target, "input"));
  },
  true
);

document.addEventListener(
  "submit",
  async (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(`#${toolbarId}`) || target?.closest(`#${confirmationDialogId}`) || target?.closest(`#${pickerReviewDialogId}`)) return;
    if (isPickerActive()) return;
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("submit", event.target, "submit"));
  },
  true
);

function notifyNavigation() {
  return;
}

const originalPushState = history.pushState;
history.pushState = function pushState(...args) {
  originalPushState.apply(this, args);
  notifyNavigation();
};

const originalReplaceState = history.replaceState;
history.replaceState = function replaceState(...args) {
  originalReplaceState.apply(this, args);
  notifyNavigation();
};

window.addEventListener("popstate", notifyNavigation);
window.addEventListener("resize", () => {
  toolbarPosition = {
    right: Math.min(toolbarPosition.right, Math.max(4, window.innerWidth - 54)),
    bottom: Math.min(toolbarPosition.bottom, Math.max(4, window.innerHeight - 54))
  };
  void renderToolbar();
});
void renderToolbar();
