import { browserApi } from "./browserApi";
import type { RecordedAction, RecorderConfig, RecorderStatus, RecordingState } from "./types";

const defaultState: RecordingState = {
  isRecording: false,
  isPaused: false,
  actions: []
};

async function getState() {
  const stored = await browserApi.getStorage<{ recordingState?: RecordingState }>({ recordingState: defaultState });
  return { ...defaultState, ...(stored.recordingState ?? defaultState), actions: stored.recordingState?.actions ?? [] };
}

async function setState(recordingState: RecordingState) {
  await browserApi.setStorage({ recordingState });
}

async function getRecorderConfig() {
  const stored = await browserApi.getStorage<{ recorderConfig?: RecorderConfig }>({ recorderConfig: undefined });
  return stored.recorderConfig;
}

async function getRecorderStatus() {
  const stored = await browserApi.getStorage<{ recorderStatus?: RecorderStatus }>({
    recorderStatus: { configured: false, postedCount: 0 }
  });
  return stored.recorderStatus ?? { configured: false, postedCount: 0 };
}

async function setRecorderStatus(patch: Partial<RecorderStatus>) {
  const current = await getRecorderStatus();
  await browserApi.setStorage({ recorderStatus: { ...current, ...patch } });
}

function shouldClearConfig(responseStatus: number, message: string) {
  const normalized = message.toLowerCase();
  return [401, 404, 409].includes(responseStatus)
    || normalized.includes("recording session was not found")
    || normalized.includes("recording session is closed")
    || normalized.includes("session token");
}

async function postAction(action: RecordedAction, configOverride?: RecorderConfig) {
  const config = configOverride ?? await getRecorderConfig();

  if (!config?.scoutBaseUrl || !config.recorderToken) {
    await setRecorderStatus({ configured: false, lastError: "Recorder is not configured with a Scout session token." });
    return;
  }

  try {
    const endpoint = new URL(config.ingestPath || "/api/guided-workflow-recorder/actions", config.scoutBaseUrl);
    const response = await fetch(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recorderToken: config.recorderToken,
        action
      })
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = typeof payload?.message === "string" ? payload.message : `Scout upload failed with HTTP ${response.status}.`;
      if (shouldClearConfig(response.status, message)) {
        await browserApi.setStorage({ recorderConfig: undefined });
        await setRecorderStatus({
          configured: false,
          lastPostStatus: "Recorder config expired",
          lastError: "Recorder config expired or is no longer valid. Paste a fresh config."
        });
      }
      throw new Error(message);
    }

    const status = await getRecorderStatus();
    await setRecorderStatus({
      configured: true,
      postedCount: status.postedCount + 1,
      lastPostStatus: "Uploaded to Scout",
      lastPostedAt: new Date().toISOString(),
      lastError: ""
    });
  } catch (error) {
    const currentStatus = await getRecorderStatus();
    if (currentStatus.configured === false) {
      return;
    }
    await setRecorderStatus({
      configured: true,
      lastPostStatus: "Upload failed",
      lastError: error instanceof Error ? error.message : "Unable to upload action to Scout."
    });
  }
}

async function syncActionsToScout(configOverride?: RecorderConfig) {
  const config = configOverride ?? await getRecorderConfig();
  if (!config?.scoutBaseUrl || !config.recorderToken || !config.sessionTitle) {
    await setRecorderStatus({ configured: false, lastPostStatus: "Sync blocked", lastError: "Configure a Scout training session before syncing." });
    return;
  }

  const state = await getState();
  const status = await getRecorderStatus();
  const alreadyPosted = status.postedCount ?? 0;
  const pending = state.actions.slice(alreadyPosted);

  if (pending.length === 0) {
    await setRecorderStatus({ lastPostStatus: "No pending actions to sync", lastError: "" });
    return;
  }

  for (let pendingIndex = 0; pendingIndex < pending.length; pendingIndex++) {
    const action = pending[pendingIndex];
    await postAction(action, config);
  }

  const nextStatus = await getRecorderStatus();
  if (!nextStatus.lastError) {
    await setState(defaultState);
    await setRecorderStatus({ postedCount: 0, lastPostStatus: "Synced and cleared local recording", lastError: "" });
  }
}

browserApi.onMessage(async (message) => {
  if (!message || typeof message !== "object") return;
  const type = (message as { type?: string }).type;
  const state = await getState();
  const status = await getRecorderStatus();

  if (type === "SCOUT_RECORDER_CONFIGURE") {
    const recorderConfig = (message as { recorderConfig?: RecorderConfig }).recorderConfig;
    if (recorderConfig?.scoutBaseUrl && recorderConfig.recorderToken && recorderConfig.sessionTitle) {
      await browserApi.setStorage({ recorderConfig });
      await setState(defaultState);
      await setRecorderStatus({ configured: true, postedCount: 0, lastPostStatus: "Configured", lastError: "" });
    }
  }
  if (type === "SCOUT_RECORDER_CLEAR_CONFIG") {
    await browserApi.setStorage({ recorderConfig: undefined });
    await setState(defaultState);
    await setRecorderStatus({ configured: false, postedCount: 0, lastPostStatus: "Config cleared", lastError: "" });
  }
  if (type === "SCOUT_RECORDING_START") await setState({ isRecording: true, isPaused: false, actions: [] });
  if (type === "SCOUT_RECORDING_STOP") await setState({ ...state, isRecording: false, isPaused: false });
  if (type === "SCOUT_RECORDING_PAUSE") await setState({ ...state, isPaused: true });
  if (type === "SCOUT_RECORDING_RESUME") await setState({ ...state, isRecording: true, isPaused: false });
  if (type === "SCOUT_RECORDING_CLEAR") {
    await setState(defaultState);
    await setRecorderStatus({ postedCount: 0, lastPostStatus: "Recording cleared", lastError: "" });
  }
  if (type === "SCOUT_RECORDING_DELETE_ACTION") {
    const actionId = (message as { actionId?: string }).actionId;
    const actions = state.actions.filter((action) => action.id !== actionId);
    await setState({ ...state, isRecording: false, isPaused: false, actions });
    await setRecorderStatus({
      postedCount: Math.min(status.postedCount ?? 0, actions.length),
      lastPostStatus: "Step deleted locally",
      lastError: ""
    });
  }
  if (type === "SCOUT_RECORDING_SYNC") {
    const recorderConfig = (message as { recorderConfig?: RecorderConfig }).recorderConfig;
    if (recorderConfig?.scoutBaseUrl && recorderConfig.recorderToken && recorderConfig.sessionTitle) {
      await browserApi.setStorage({ recorderConfig });
      await setRecorderStatus({ configured: true });
    }
    await syncActionsToScout(recorderConfig);
  }
  if (type === "SCOUT_RECORDING_ACTION") {
    const action = (message as { action: RecordedAction }).action;
    const recorderConfig = (message as { recorderConfig?: RecorderConfig }).recorderConfig;
    if (recorderConfig?.scoutBaseUrl && recorderConfig.recorderToken && recorderConfig.sessionTitle) {
      await browserApi.setStorage({ recorderConfig });
      await setRecorderStatus({ configured: true });
    }
    await setState({ ...state, isRecording: false, isPaused: false, actions: [...state.actions, action] });
    await setRecorderStatus({ lastPostStatus: "Step saved locally", lastError: "" });
  }
});
