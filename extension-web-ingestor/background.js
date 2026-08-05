// Scout Web Ingestor — background service worker.
// Runs entirely in the admin's browser, so every page fetch automatically
// carries the session cookies of the site the admin is already logged into.
// Captured HTML is posted to Scout's /api/admin/documents/ingest-html endpoint,
// authorized by a short-lived pairing token generated inside Scout.

const HARD_PAGE_CEILING = 5000; // Absolute cap even when "entire site" is on.
const DEFAULT_MAX_PAGES = 200;
const REQUEST_DELAY_MS = 300; // Politeness delay between page fetches.
const FETCH_TIMEOUT_MS = 20000;

let crawlState = { running: false, cancel: false };

function log(message, level) {
  chrome.runtime.sendMessage({ type: "log", message, level: level || "info" }).catch(() => {});
}

function setProgress(progress) {
  chrome.storage.local.set({ progress });
  chrome.runtime.sendMessage({ type: "progress", progress }).catch(() => {});
}

function canonicalUrl(rawUrl, base) {
  const url = new URL(rawUrl, base);
  url.hash = "";
  for (const key of Array.from(url.searchParams.keys())) {
    if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  }
  if (Array.from(url.searchParams.keys()).length === 0) url.search = "";
  return url;
}

function extractTitle(html, fallback) {
  const match = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const title = match && match[1] ? match[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : "";
  return title || fallback;
}

function extractLinks(html, baseUrl, rootOrigin) {
  const links = [];
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    let candidate;
    try {
      candidate = canonicalUrl(match[1], baseUrl);
    } catch {
      continue;
    }
    if (candidate.origin !== rootOrigin) continue;
    if (!["http:", "https:"].includes(candidate.protocol)) continue;
    if (/\.(?:jpg|jpeg|png|gif|svg|webp|ico|css|js|woff2?|ttf|eot|mp4|mp3|zip|pdf)(?:$|\?)/i.test(candidate.pathname)) continue;
    if (/\/(?:logout|signout|sign-out|cart|checkout)(?:\/|$)/i.test(candidate.pathname)) continue;
    links.push(candidate.href);
  }
  return links;
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      credentials: "include",
      redirect: "follow",
      headers: { Accept: "text/html,application/xhtml+xml" },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

async function postPage(config, page) {
  const endpoint = new URL("/api/admin/documents/ingest-html", config.scoutBaseUrl).toString();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Scout-Ingest-Token": config.token
    },
    body: JSON.stringify(page)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.success !== true) {
    const message = (payload && payload.message) || `Scout responded with HTTP ${response.status}.`;
    throw new Error(message);
  }
  return payload;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCrawl(config) {
  if (crawlState.running) {
    log("A crawl is already running.", "error");
    return;
  }
  crawlState = { running: true, cancel: false };

  let root;
  try {
    root = canonicalUrl(config.startUrl);
  } catch {
    log("Start URL is not valid.", "error");
    crawlState.running = false;
    return;
  }

  const maxPages = config.entireSite
    ? HARD_PAGE_CEILING
    : Math.min(HARD_PAGE_CEILING, Math.max(1, Number(config.maxPages) || DEFAULT_MAX_PAGES));

  const pending = [root.href];
  const queued = new Set([root.href]);
  const visited = new Set();
  let ingested = 0;
  let failed = 0;

  log(`Starting crawl of ${root.origin}${config.entireSite ? " (entire site)" : ` (up to ${maxPages} pages)`}.`);

  while (pending.length && ingested < maxPages) {
    if (crawlState.cancel) {
      log("Crawl cancelled.", "warn");
      break;
    }
    const current = pending.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    let response;
    try {
      response = await fetchWithTimeout(current);
    } catch {
      failed += 1;
      continue;
    }
    if (!response.ok || !(response.headers.get("content-type") || "").toLowerCase().includes("text/html")) {
      continue;
    }

    const finalUrl = canonicalUrl(response.url || current);
    if (finalUrl.origin !== root.origin) continue;

    const html = await response.text();
    const title = extractTitle(html, finalUrl.pathname || finalUrl.hostname);

    try {
      await postPage(config, { url: finalUrl.href, title, html });
      ingested += 1;
      setProgress({ ingested, failed, queued: pending.length, running: true });
      log(`Ingested (${ingested}) ${finalUrl.href}`);
    } catch (error) {
      failed += 1;
      log(`Failed to ingest ${finalUrl.href}: ${error.message}`, "error");
      if (/token/i.test(error.message)) {
        log("Stopping — the pairing token is invalid or expired. Generate a new one in Scout.", "error");
        break;
      }
    }

    for (const link of extractLinks(html, finalUrl.href, root.origin)) {
      if (!queued.has(link)) {
        queued.add(link);
        pending.push(link);
      }
    }

    await sleep(REQUEST_DELAY_MS);
  }

  crawlState.running = false;
  setProgress({ ingested, failed, queued: pending.length, running: false });
  log(`Done. Ingested ${ingested} page(s)${failed ? `, ${failed} failed` : ""}.`, "success");
}

async function captureActiveTab(config) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) {
    log("No active tab to capture.", "error");
    return;
  }
  let result;
  try {
    const injection = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => ({ url: location.href, title: document.title, html: document.documentElement.outerHTML })
    });
    result = injection && injection[0] && injection[0].result;
  } catch (error) {
    log(`Unable to read the current tab: ${error.message}`, "error");
    return;
  }
  if (!result || !result.html) {
    log("The current tab returned no content.", "error");
    return;
  }
  try {
    await postPage(config, { url: result.url, title: result.title, html: result.html });
    log(`Captured current tab: ${result.url}`, "success");
    setProgress({ ingested: 1, failed: 0, queued: 0, running: false });
  } catch (error) {
    log(`Failed to ingest current tab: ${error.message}`, "error");
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message.type !== "string") return;

  if (message.type === "start-crawl") {
    runCrawl(message.config);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "capture-tab") {
    captureActiveTab(message.config);
    sendResponse({ ok: true });
    return;
  }
  if (message.type === "cancel-crawl") {
    crawlState.cancel = true;
    sendResponse({ ok: true });
    return;
  }
});
