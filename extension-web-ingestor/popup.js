// Scout Web Ingestor — popup UI logic.

const fields = {
  scoutBaseUrl: document.getElementById("scoutBaseUrl"),
  token: document.getElementById("token"),
  startUrl: document.getElementById("startUrl"),
  entireSite: document.getElementById("entireSite"),
  maxPages: document.getElementById("maxPages")
};

const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");
const connectionEl = document.getElementById("connection");

function appendLog(message, level) {
  const line = document.createElement("div");
  if (level && level !== "info") line.className = `log-${level}`;
  line.textContent = message;
  logEl.prepend(line);
}

function showProgress(progress) {
  if (!progress) return;
  const parts = [`Ingested: ${progress.ingested || 0}`];
  if (progress.failed) parts.push(`Failed: ${progress.failed}`);
  if (progress.running) parts.push(`Queued: ${progress.queued || 0}`);
  statusEl.textContent = `${progress.running ? "Running…  " : "Idle.  "}${parts.join("  •  ")}`;
}

async function loadConfig() {
  const stored = await chrome.storage.local.get(["config", "progress"]);
  const config = stored.config || {};
  fields.scoutBaseUrl.value = config.scoutBaseUrl || "";
  fields.token.value = config.token || "";
  fields.startUrl.value = config.startUrl || "";
  fields.entireSite.checked = Boolean(config.entireSite);
  fields.maxPages.value = config.maxPages || 200;
  showProgress(stored.progress);
  if (!config.scoutBaseUrl || !config.token) {
    connectionEl.open = true;
  }
}

function readConfig() {
  return {
    scoutBaseUrl: fields.scoutBaseUrl.value.trim().replace(/\/+$/, ""),
    token: fields.token.value.trim(),
    startUrl: fields.startUrl.value.trim(),
    entireSite: fields.entireSite.checked,
    maxPages: Number(fields.maxPages.value) || 200
  };
}

async function saveConfig(config) {
  await chrome.storage.local.set({ config });
}

function validate(config, requireStartUrl) {
  if (!config.scoutBaseUrl) return "Enter the Scout URL.";
  if (!config.token) return "Paste the pairing token from Scout.";
  if (requireStartUrl && !config.startUrl) return "Enter a start URL.";
  return null;
}

document.getElementById("crawlBtn").addEventListener("click", async () => {
  const config = readConfig();
  const error = validate(config, true);
  if (error) {
    appendLog(error, "error");
    connectionEl.open = true;
    return;
  }
  await saveConfig(config);
  logEl.innerHTML = "";
  chrome.runtime.sendMessage({ type: "start-crawl", config });
});

document.getElementById("captureBtn").addEventListener("click", async () => {
  const config = readConfig();
  const error = validate(config, false);
  if (error) {
    appendLog(error, "error");
    connectionEl.open = true;
    return;
  }
  await saveConfig(config);
  chrome.runtime.sendMessage({ type: "capture-tab", config });
});

document.getElementById("stopBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "cancel-crawl" });
  appendLog("Stopping…", "warn");
});

chrome.runtime.onMessage.addListener((message) => {
  if (!message || typeof message.type !== "string") return;
  if (message.type === "log") appendLog(message.message, message.level);
  if (message.type === "progress") showProgress(message.progress);
});

// Persist every field as it changes, so nothing is lost when the popup closes
// (e.g. when you switch tabs to copy the pairing token).
function persist() {
  saveConfig(readConfig());
}
Object.values(fields).forEach((field) => {
  field.addEventListener("input", persist);
  field.addEventListener("change", persist);
});

// Re-open the same UI as a standalone window that does NOT close when you
// switch tabs — makes copy/paste of the token painless.
document.getElementById("popoutBtn")?.addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("popup.html"),
    type: "popup",
    width: 430,
    height: 700
  });
});

loadConfig();
