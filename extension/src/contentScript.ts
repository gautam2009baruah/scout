import { browserApi } from "./browserApi";
import {
  createNavigationAction,
  createRecordedAction,
  createManualSelectAction,
} from "./recorder";
import type { RecorderConfig, RecorderStatus, RecordingState } from "./types";
import { enterPickerMode, isPickerActive } from "./elementPicker";

const toolbarId = "scout-guided-workflow-recorder";
const confirmationDialogId = "scout-confirmation-dialog";
const recorderBuild = "202606241500";
declare const chrome: any;

let isInPickerMode = false;
let pendingConfirmationAction: ReturnType<typeof createRecordedAction> | null =
  null;

async function getState() {
  const stored = await browserApi.getStorage<{ recordingState?: RecordingState }>({ recordingState: { isRecording: false, isPaused: false, actions: [] } });
  return stored.recordingState ?? { isRecording: false, isPaused: false, actions: [] };
}

async function getRecorderMeta() {
  const stored = await browserApi.getStorage<{ recorderConfig?: RecorderConfig; recorderStatus?: RecorderStatus }>({
    recorderConfig: undefined,
    recorderStatus: { configured: false, postedCount: 0 }
  });

  if (stored.recorderConfig) {
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

async function sendAction(action: ReturnType<typeof createRecordedAction>) {
  if (!action) return;

  const state = await getState();

  // Only check confirmation if recording is active
  if (state.isRecording && !state.isPaused) {
    // Check if element needs user confirmation (low confidence)
    if (action.elementIdentity?.needsUserConfirmation) {
      showConfirmationDialog(action);
      return; // Wait for user to confirm or reselect
    }
  }

  // Send action normally
  const meta = await getRecorderMeta();
  await browserApi.sendMessage({
    type: "SCOUT_RECORDING_ACTION",
    action,
    recorderConfig: meta.recorderConfig,
  });
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
        The recorded control has low confidence (<strong style="color: #fbbf24;">${confidence}%</strong>).
        This may cause playback issues.
      </div>
      ${
        bestSelector
          ? `
        <div style="margin-top: 12px; padding: 10px; background: #0f172a; border-radius: 6px; font-size: 12px;">
          <div style="color: #94a3b8;">Best selector:</div>
          <div style="color: #e2e8f0; font-family: monospace; margin-top: 4px;">
            ${bestSelector.type}
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

/**
 * Start element picker mode
 */
async function startPickerMode() {
  if (isInPickerMode) return;

  isInPickerMode = true;
  await renderToolbar(); // Update toolbar to show picker mode

  const identity = await enterPickerMode();

  isInPickerMode = false;
  await renderToolbar(); // Update toolbar after exiting picker mode

  if (identity) {
    // User selected an element
    const action = createManualSelectAction(identity);
    await sendAction(action);
  }
}

function button(label: string, messageType: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.style.cssText = "padding:6px 10px;background:#334155;border:none;color:white;border-radius:6px;cursor:pointer;font:inherit";
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
  element.style.cssText = "padding:6px 10px;background:#10b981;border:none;color:white;border-radius:6px;cursor:pointer;font:inherit";
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
  const rawConfig = window.prompt("Paste Scout recorder extension config JSON");

  if (!rawConfig) {
    return;
  }

  try {
    const recorderConfig = JSON.parse(rawConfig);

    if (!recorderConfig?.scoutBaseUrl || !recorderConfig?.recorderToken) {
      window.alert("Recorder config must include scoutBaseUrl and recorderToken.");
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
    const readBack = await getRecorderMeta();

    if (!readBack.recorderConfig) {
      window.alert("Config was accepted but could not be read back from extension storage.");
    }
    await renderToolbar();
  } catch {
    window.alert("Recorder config JSON is invalid.");
  }
}

async function exportJson() {
  const state = await getState();
  const blob = new Blob([JSON.stringify(state.actions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "scout-recording.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function renderToolbar() {
  document.getElementById(toolbarId)?.remove();
  const state = await getState();
  const meta = await getRecorderMeta();
  const root = document.createElement("div");
  root.id = toolbarId;
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:#020617;color:white;border-radius:10px;padding:8px;box-shadow:0 16px 40px rgb(15 23 42 / .35);font:12px system-ui,sans-serif;flex-wrap:wrap;max-width:800px";

  // Configure button
  const configureButton = document.createElement("button");
  configureButton.type = "button";
  configureButton.textContent = "Configure";
  configureButton.style.cssText = "padding:6px 10px;background:#334155;border:none;color:white;border-radius:6px;cursor:pointer;font:inherit";
  configureButton.addEventListener("click", configureRecorder);
  root.append(configureButton);

  // Start button
  root.append(button("Start", "SCOUT_RECORDING_START"));

  // Stop button
  root.append(button("Stop", "SCOUT_RECORDING_STOP"));

  // Pause/Resume buttons
  if (state.isRecording && !state.isPaused) {
    root.append(button("Pause", "SCOUT_RECORDING_PAUSE"));
  } else if (state.isPaused) {
    root.append(button("Resume", "SCOUT_RECORDING_RESUME"));
  }

  // Select Control button
  const selectButton = document.createElement("button");
  selectButton.type = "button";
  selectButton.textContent = isInPickerMode ? "Selecting..." : "Select Control";
  selectButton.style.cssText = `padding:6px 10px;background:${isInPickerMode ? "#3b82f6" : "#6366f1"};border:none;color:white;border-radius:6px;cursor:pointer;font:inherit`;
  selectButton.disabled = isInPickerMode;
  selectButton.addEventListener("click", startPickerMode);
  root.append(selectButton);

  // Clear button
  root.append(button("Clear", "SCOUT_RECORDING_CLEAR"));

  // Sync button
  root.append(syncButton());

  // Export button
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = `Export (${state.actions.length})`;
  exportButton.style.cssText = "padding:6px 10px;background:#334155;border:none;color:white;border-radius:6px;cursor:pointer;font:inherit";
  exportButton.addEventListener("click", exportJson);
  root.append(exportButton);

  // Recording state indicator
  if (state.isRecording && !state.isPaused) {
    const recordingIndicator = document.createElement("span");
    recordingIndicator.textContent = "🔴 Recording";
    recordingIndicator.style.cssText = "color:#ef4444;font-weight:600;animation:pulse 2s ease-in-out infinite";
    root.append(recordingIndicator);
  } else if (state.isPaused) {
    const pausedIndicator = document.createElement("span");
    pausedIndicator.textContent = "⏸️ Paused";
    pausedIndicator.style.cssText = "color:#fbbf24;font-weight:600";
    root.append(pausedIndicator);
  }

  if (isInPickerMode) {
    const pickerIndicator = document.createElement("span");
    pickerIndicator.textContent = "🎯 Picker Mode";
    pickerIndicator.style.cssText = "color:#3b82f6;font-weight:600";
    root.append(pickerIndicator);
  }

  // Status
  const status = document.createElement("span");
  status.style.cssText = "max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1";
  status.title =
    meta.recorderStatus?.lastError ||
    meta.recorderStatus?.lastPostStatus ||
    "";
  status.textContent = meta.recorderConfig
    ? `Scout: ${
        meta.recorderStatus?.lastError
          ? meta.recorderStatus.lastError
          : `${meta.recorderStatus?.postedCount ?? 0} uploaded`
      }`
    : "Scout: not configured";
  root.append(status);

  // Version
  const version = document.createElement("span");
  version.style.cssText = "color:#94a3b8;font-size:10px";
  version.textContent = `v${recorderBuild}`;
  root.append(version);

  // Add pulse animation style
  if (!document.getElementById("scout-toolbar-styles")) {
    const style = document.createElement("style");
    style.id = "scout-toolbar-styles";
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(root);
}

window.setInterval(() => {
  if (document.getElementById(toolbarId)) {
    void renderToolbar();
  }
}, 3000);

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
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("change", event.target, "change"));
  },
  true
);

document.addEventListener(
  "input",
  async (event) => {
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("input", event.target, "input"));
  },
  true
);

document.addEventListener(
  "submit",
  async (event) => {
    const state = await getState();
    if (!state.isRecording || state.isPaused) return;

    void sendAction(createRecordedAction("submit", event.target, "submit"));
  },
  true
);

function notifyNavigation() {
  void browserApi.sendMessage({ type: "SCOUT_RECORDING_ACTION", action: createNavigationAction(location.href) });
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
void renderToolbar();
