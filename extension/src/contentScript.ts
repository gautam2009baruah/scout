import { browserApi } from "./browserApi";
import { createNavigationAction, createRecordedAction } from "./recorder";
import type { RecorderConfig, RecorderStatus, RecordingState } from "./types";

const toolbarId = "scout-guided-workflow-recorder";
const recorderBuild = "202606231052";
declare const chrome: any;

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
  if (action) {
    const meta = await getRecorderMeta();
    await browserApi.sendMessage({
      type: "SCOUT_RECORDING_ACTION",
      action,
      recorderConfig: meta.recorderConfig
    });
  }
}

function button(label: string, messageType: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.addEventListener("click", async () => {
    await browserApi.sendMessage({ type: messageType });
    await renderToolbar();
  });
  return element;
}

function syncButton() {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = "Sync to Scout";
  element.addEventListener("click", async () => {
    const meta = await getRecorderMeta();
    await browserApi.sendMessage({
      type: "SCOUT_RECORDING_SYNC",
      recorderConfig: meta.recorderConfig
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
  root.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:6px;align-items:center;background:#020617;color:white;border-radius:10px;padding:8px;box-shadow:0 16px 40px rgb(15 23 42 / .35);font:12px system-ui,sans-serif";
  root.append(
    (() => {
      const configureButton = document.createElement("button");
      configureButton.type = "button";
      configureButton.textContent = "Configure";
      configureButton.addEventListener("click", configureRecorder);
      return configureButton;
    })(),
    button("Start Recording", "SCOUT_RECORDING_START"),
    button("Stop Recording", "SCOUT_RECORDING_STOP"),
    button("Pause", "SCOUT_RECORDING_PAUSE"),
    button("Resume", "SCOUT_RECORDING_RESUME"),
    button("Clear", "SCOUT_RECORDING_CLEAR"),
    syncButton()
  );
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = `Export JSON (${state.actions.length})`;
  exportButton.addEventListener("click", exportJson);
  root.append(exportButton);
  const status = document.createElement("span");
  status.style.cssText = "max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#cbd5e1";
  status.title = meta.recorderStatus?.lastError || meta.recorderStatus?.lastPostStatus || "";
  status.textContent = meta.recorderConfig
    ? `Scout: ${meta.recorderStatus?.lastError ? meta.recorderStatus.lastError : `${meta.recorderStatus?.postedCount ?? 0} uploaded`}`
    : "Scout: not configured";
  root.append(status);
  const version = document.createElement("span");
  version.style.cssText = "color:#94a3b8";
  version.textContent = `v${recorderBuild}`;
  root.append(version);
  document.body.appendChild(root);
}

window.setInterval(() => {
  if (document.getElementById(toolbarId)) {
    void renderToolbar();
  }
}, 3000);

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest(`#${toolbarId}`)) return;
  void sendAction(createRecordedAction("click", event.target));
}, true);

document.addEventListener("change", (event) => {
  void sendAction(createRecordedAction("input", event.target));
}, true);

document.addEventListener("submit", (event) => {
  void sendAction(createRecordedAction("submit", event.target));
}, true);

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
