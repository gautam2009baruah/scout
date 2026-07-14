(function (global) {
  "use strict";

  var VERSION = "1.1.0";
  var instances = [];
  var playerPromise = null;

  function install(options) {
    var config = Object.assign({
      scoutUrl: "",
      position: "bottom-right",
      assistantName: "Scout Assistant"
    }, options || {});

    requireValue(config.scoutUrl, "scoutUrl");
    requireValue(config.apiUrl, "apiUrl");
    requireValue(config.apiKey, "apiKey");
    requireValue(config.companyId, "companyId");
    requireValue(config.companyName, "companyName");
    requireValue(config.userId, "userId");

    var scoutOrigin = new URL(config.scoutUrl, global.location.href).origin;
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
    iframe.style.colorScheme = "light";
    iframe.style.transition = "width 180ms ease, height 180ms ease";
    iframe.style[config.position === "bottom-left" ? "left" : "right"] = "12px";
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
      iframe.style[config.position === "bottom-left" ? "left" : "right"] = "12px";
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

  function getPlayer(config) {
    if (playerPromise) return playerPromise;
    playerPromise = new Promise(function (resolve, reject) {
      function initialize() {
        global.ScoutAdoptionPlayer.init({
          scoutBaseUrl: config.scoutUrl,
          targetAppId: config.targetAppId,
          autoShowLauncher: false
        }).then(resolve).catch(reject);
      }
      if (global.ScoutAdoptionPlayer) return initialize();
      var script = document.createElement("script");
      script.src = config.scoutUrl.replace(/\/$/, "") + "/scout-orchestration-player.js";
      script.async = true;
      script.onload = initialize;
      script.onerror = function () { reject(new Error("Scout orchestration player failed to load.")); };
      document.head.appendChild(script);
    });
    return playerPromise;
  }

  global.ScoutChatbot = { install: install, version: VERSION };
})(window);
