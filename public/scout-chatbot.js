(function (global) {
  "use strict";

  var VERSION = "1.1.3";
  // Must match PLAYER_VERSION in scout-smart-adoption-player.js — appended as a
  // cache-buster below so a browser that already cached an older copy of that
  // file (e.g. from earlier in the same session, before a fix landed) doesn't
  // silently keep reusing it on every page's fresh load.
  var PLAYER_VERSION = "20260728-guide-resume-race-fix";
  var instances = [];
  var playerPromise = null;
  var orchestrationPlayerLoaded = false;

  function install(options) {
    var config = Object.assign({
      scoutUrl: "",
      position: "bottom-right",
      assistantName: "Scout Assistant"
    }, options || {});

    requireValue(config.scoutUrl, "scoutUrl");
    requireValue(config.apiUrl, "apiUrl");
    requireValue(config.apiKey, "apiKey");
    requireValue(config.userId, "userId");

    var scoutOrigin = new URL(config.scoutUrl, global.location.href).origin;
    ensureOrchestrationPlayer(config, scoutOrigin);
    resumeGuideIfPending(config);
    var configuredPosition = config.theme && (config.theme.position === "bottom-left" || config.theme.position === "bottom-right")
      ? config.theme.position
      : config.position;
    var iframe = document.createElement("iframe");
    var instanceId = "scout-chatbot-frame-" + (instances.length + 1);
    iframe.id = instanceId;
    iframe.title = config.assistantName + " chatbot";
    iframe.src = scoutOrigin + "/embed/scout-chatbot";
    iframe.allow = "clipboard-write";
    iframe.style.position = "fixed";
    iframe.style.zIndex = String(config.zIndex || 2147482000);
    iframe.style.bottom = "12px";
    iframe.style.width = "80px";
    iframe.style.height = "80px";
    iframe.style.border = "0";
    iframe.style.background = "transparent";
    iframe.style.colorScheme = config.theme && config.theme.darkMode === true ? "dark" : "light";
    iframe.style.transition = "width 180ms ease, height 180ms ease";
    iframe.style[configuredPosition === "bottom-left" ? "left" : "right"] = "12px";
    document.body.appendChild(iframe);

    var isOpen = false;
    var openSize = { width: 480, height: 740 };
    var framePosition = null;

    function usePixelPosition() {
      if (framePosition) return;
      var rect = iframe.getBoundingClientRect();
      framePosition = { left: rect.left, top: rect.top };
      iframe.style.left = framePosition.left + "px";
      iframe.style.top = framePosition.top + "px";
      iframe.style.right = "auto";
      iframe.style.bottom = "auto";
    }

    function clampPosition() {
      if (!framePosition) return;
      var rect = iframe.getBoundingClientRect();
      framePosition.left = Math.min(Math.max(0, framePosition.left), Math.max(0, global.innerWidth - rect.width));
      framePosition.top = Math.min(Math.max(0, framePosition.top), Math.max(0, global.innerHeight - rect.height));
      iframe.style.left = framePosition.left + "px";
      iframe.style.top = framePosition.top + "px";
    }

    function restorePosition() {
      framePosition = null;
      iframe.style.left = "auto";
      iframe.style.top = "auto";
      iframe.style.right = "auto";
      iframe.style.bottom = "12px";
      iframe.style[configuredPosition === "bottom-left" ? "left" : "right"] = "12px";
    }

    function applyOpenSize() {
      var maxWidth = Math.max(80, global.innerWidth - 24);
      var maxHeight = Math.max(80, global.innerHeight - 24);
      iframe.style.width = Math.min(maxWidth, Math.max(340, openSize.width)) + "px";
      iframe.style.height = Math.min(maxHeight, Math.max(440, openSize.height)) + "px";
      clampPosition();
    }

    function onViewportResize() {
      if (isOpen) applyOpenSize();
    }

    function sendConfig() {
      if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: "scout-chatbot:configure", config: config }, scoutOrigin);
    }

    function onMessage(event) {
      if (event.origin !== scoutOrigin || event.source !== iframe.contentWindow) return;
      if (event.data?.type === "scout-chatbot:ready") sendConfig();
      if (event.data?.type === "scout-chatbot:open-change") {
        isOpen = event.data.isOpen === true;
        if (isOpen) applyOpenSize();
        else {
          iframe.style.width = "80px";
          iframe.style.height = "80px";
        }
      }
      if (event.data?.type === "scout-chatbot:size-change") {
        usePixelPosition();
        openSize = {
          width: Number(event.data.width) || openSize.width,
          height: Number(event.data.height) || openSize.height
        };
        if (isOpen) applyOpenSize();
      }
      if (event.data?.type === "scout-chatbot:move-by" && isOpen) {
        usePixelPosition();
        framePosition.left += Number(event.data.x) || 0;
        framePosition.top += Number(event.data.y) || 0;
        clampPosition();
      }
      if (event.data?.type === "scout-chatbot:restore-layout" && isOpen) {
        restorePosition();
        applyOpenSize();
      }
      if (event.data?.type === "scout-chatbot:start-workflow") {
        startWorkflow(config, event.data.guideId);
      }
    }

    global.addEventListener("message", onMessage);
    global.addEventListener("resize", onViewportResize);
    iframe.addEventListener("load", sendConfig);

    var handle = {
      id: instanceId,
      version: VERSION,
      destroy: function () {
        global.removeEventListener("message", onMessage);
        global.removeEventListener("resize", onViewportResize);
        iframe.remove();
        instances = instances.filter(function (item) { return item !== handle; });
      }
    };
    instances.push(handle);
    return handle;
  }

  function requireValue(value, name) {
    if (!String(value || "").trim()) throw new Error("ScoutChatbot.install requires " + name + ".");
  }

  function startWorkflow(config, guideId) {
    if (!config.targetAppId || !guideId) return;
    getPlayer(config).then(function (player) { player.play(guideId); }).catch(function (error) {
      console.error("Scout workflow could not start.", error);
    });
  }

  // Guide navigation steps can trigger a REAL page load, which destroys this
  // whole script (and any in-progress wait for the next page) before the guide's
  // main steps ever run. scout-smart-adoption-player.js saves a small marker to
  // sessionStorage right before such a click; on every fresh page load we check
  // for it here and, if found, resume the guide instead of leaving it stranded.
  // Key name and staleness window must stay in sync with that file's copy.
  var GUIDE_RESUME_STORAGE_KEY = "scout_guide_resume_state";
  var GUIDE_RESUME_MAX_AGE_MS = 5 * 60 * 1000;

  function consumePendingGuideResumeId() {
    try {
      var raw = sessionStorage.getItem(GUIDE_RESUME_STORAGE_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(GUIDE_RESUME_STORAGE_KEY);
      var state = JSON.parse(raw);
      if (!state || !state.guideId) return null;
      if (Date.now() - (state._savedAt || 0) > GUIDE_RESUME_MAX_AGE_MS) return null;
      return state.guideId;
    } catch {
      return null;
    }
  }

  function resumeGuideIfPending(config) {
    var guideId = consumePendingGuideResumeId();
    if (!guideId || !config.targetAppId) return;
    getPlayer(config).then(function (player) {
      if (player.resume) player.resume(guideId);
    }).catch(function (error) {
      console.error("Scout guided workflow could not resume after navigation.", error);
    });
  }

  function getPlayer(config) {
    if (playerPromise) return playerPromise;
    playerPromise = new Promise(function (resolve, reject) {
      function initialize() {
        global.ScoutAdoptionPlayer.init({
          scoutBaseUrl: config.scoutUrl,
          targetAppId: config.targetAppId,
          apiKey: config.apiKey,
          autoShowLauncher: false
        }).then(resolve).catch(reject);
      }
      if (global.ScoutAdoptionPlayer) return initialize();
      var script = document.createElement("script");
      script.src = config.scoutUrl.replace(/\/$/, "") + "/scout-smart-adoption-player.js?v=" + PLAYER_VERSION;
      script.async = true;
      script.onload = initialize;
      script.onerror = function () { reject(new Error("Scout guided workflow player failed to load.")); };
      document.head.appendChild(script);
    });
    return playerPromise;
  }

  // Loads the client-side orchestration engine (handles SCOUT_START_EXECUTION,
  // runs workflow/data_capture nodes in this same tab, defers other node types
  // back to the server). Mirrors the <script src="/scout-orchestration-player.js">
  // include the admin app loads globally via its own layout — the customer embed
  // needs the same listener registered on the host page.
  function ensureOrchestrationPlayer(config, scoutOrigin) {
    if (orchestrationPlayerLoaded || global.ScoutOrchestrationConfig) return;
    orchestrationPlayerLoaded = true;
    global.ScoutOrchestrationConfig = {
      apiBaseUrl: scoutOrigin,
      scoutPlayerUrl: scoutOrigin + "/scout-smart-adoption-player.js?v=" + PLAYER_VERSION,
      targetAppId: config.targetAppId || null
    };
    var script = document.createElement("script");
    script.src = scoutOrigin + "/scout-orchestration-player.js";
    script.async = true;
    script.onerror = function () { console.error("Scout orchestration player failed to load."); };
    document.head.appendChild(script);
  }

  global.ScoutChatbot = { install: install, version: VERSION };
})(window);
