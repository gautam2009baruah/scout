(function () {
  const DEFAULTS = {
    assistantName: "Scout Assistant",
    badge: "AI",
    subtitle: "Online now",
    welcomeMessage:
      "Hi, I am Scout. I can help visitors find answers, compare options, and get support without leaving this website.",
    placeholder: "Ask anything...",
    launcherLabel: "Open chat",
    position: "bottom-right",
    brandColor: "#111827",
    accentColor: "#0ea5e9",
    apiUrl: "",
    companyId: "",
    userId: "",
    conversationId: "",
    quickPrompts: ["Show pricing options", "Help me choose a plan", "Contact support"],
    modeNotice: "Demo mode: connect apiUrl to route messages to your backend.",
    width: 440,
    heightRatio: 0.75
  };

  const fallbackReplies = [
    "This widget is running from a plain script tag. No React app is required on the host website.",
    "When your backend is ready, set apiUrl and I will POST the message plus visible history to that endpoint.",
    "You can customize the assistant name, colors, prompts, welcome message, and launcher position from the embed config."
  ];

  function init(userOptions) {
    const options = Object.assign({}, DEFAULTS, userOptions || {});
    const mount = resolveMount(options);

    if (!mount) {
      console.warn("[ScoutChatbot] Mount element was not found.");
      return null;
    }

    ensureStyles();
    mount.innerHTML = "";

    const state = {
      isOpen: options.defaultOpen !== false,
      isMinimized: false,
      isTyping: false,
      position: null,
      size: null,
      messages: normalizeMessages(
        options.initialMessages && options.initialMessages.length
          ? options.initialMessages
          : [{ role: "assistant", text: options.welcomeMessage, time: "09:41" }]
      )
    };

    function render() {
      mount.innerHTML = "";
      mount.style.setProperty("--scout-brand", options.brandColor);
      mount.style.setProperty("--scout-accent", options.accentColor);
      mount.style.setProperty("--scout-focus", hexToRgba(options.accentColor, 0.16));

      initializeLayout(options, state);

      const root = document.createElement("div");
      root.className = "scout-chatbot-root";

      if (!state.isOpen) {
        root.classList.add("is-launcher");
        root.style.width = "64px";
        root.style.height = "64px";
        state.position = getBottomRightPosition({ width: 64, height: 64 });
        root.style.left = state.position.left + "px";
        root.style.top = state.position.top + "px";
        root.appendChild(createLauncher(options, function () {
          state.isOpen = true;
          state.isMinimized = false;
          state.position = getBottomRightPosition(state.size);
          render();
        }));
        mount.appendChild(root);
        return;
      }

      state.position = clampPosition(
        state.position,
        state.isMinimized ? getMinimizedSize(state.size) : state.size
      );
      root.style.left = state.position.left + "px";
      root.style.top = state.position.top + "px";
      root.style.width = state.size.width + "px";
      root.style.height = state.isMinimized ? "76px" : state.size.height + "px";
      root.appendChild(createPanel(options, state, render, sendMessage));
      mount.appendChild(root);
      scrollMessagesToBottom(mount);
    }

    async function sendMessage(text) {
      const trimmed = String(text || "").trim();

      if (!trimmed || state.isTyping) {
        return;
      }

      state.messages.push({
        id: "message-" + Date.now(),
        role: "user",
        text: trimmed,
        time: formatTime()
      });
      state.isTyping = true;
      render();

      try {
        const reply = await getAssistantReply(options, trimmed, state.messages);

        window.setTimeout(function () {
          state.messages.push({
            id: "message-" + Date.now() + "-reply",
            role: "assistant",
            text: reply.text,
            time: reply.time || formatTime()
          });
          state.isTyping = false;
          render();
        }, options.apiUrl ? 120 : 650);
      } catch (error) {
        state.messages.push({
          id: "message-" + Date.now() + "-error",
          role: "assistant",
          text: error && error.message ? error.message : "I could not reach the assistant service. Please try again in a moment.",
          time: formatTime()
        });
        state.isTyping = false;
        render();
      }
    }

    render();

    return {
      open: function () {
        state.isOpen = true;
        render();
      },
      close: function () {
        state.isOpen = false;
        render();
      },
      sendMessage: sendMessage,
      destroy: function () {
        mount.innerHTML = "";
      }
    };
  }

  function createLauncher(options, onClick) {
    const button = document.createElement("button");
    button.className = "scout-chatbot-launcher";
    button.type = "button";
    button.setAttribute("aria-label", options.launcherLabel);
    button.innerHTML = icon("message");
    button.addEventListener("click", onClick);
    return button;
  }

  function createPanel(options, state, render, sendMessage) {
    const panel = document.createElement("section");
    panel.className = "scout-chatbot-panel" + (state.isMinimized ? " is-minimized" : "");
    panel.setAttribute("aria-label", options.assistantName + " chat widget");

    panel.appendChild(createHeader(options, state, render));

    if (state.isMinimized) {
      return panel;
    }

    panel.appendChild(createMetaBar());
    panel.appendChild(createMessages(options, state));
    panel.appendChild(createComposer(options, state, sendMessage));
    panel.appendChild(createResizeHandle(state));

    return panel;
  }

  function createHeader(options, state, render) {
    const header = document.createElement("header");
    header.className = "scout-chatbot-header";
    enableDrag(header, state);
    header.innerHTML =
      '<div class="scout-chatbot-identity">' +
      '<div class="scout-chatbot-avatar">' +
      icon("bot") +
      '<span></span>' +
      "</div>" +
      '<div class="scout-chatbot-title-wrap">' +
      '<div class="scout-chatbot-title-line">' +
      '<h2>' +
      escapeHtml(options.assistantName) +
      "</h2>" +
      (options.badge ? "<strong>" + escapeHtml(options.badge) + "</strong>" : "") +
      "</div>" +
      '<p><span></span>' +
      escapeHtml(state.isTyping ? options.assistantName + " is typing" : options.subtitle) +
      "</p>" +
      "</div>" +
      "</div>";

    const actions = document.createElement("div");
    actions.className = "scout-chatbot-actions";
    actions.appendChild(iconButton("Search conversations", "search", function () {}));
    actions.appendChild(
      iconButton("Restore size and position", "restore", function () {
        state.size = getDefaultSize(options);
        state.position = getDefaultPosition(options, state.size);
        render();
      })
    );
    actions.appendChild(
      iconButton(state.isMinimized ? "Expand chat" : "Minimize chat", state.isMinimized ? "chevron" : "minus", function () {
        const nextMinimized = !state.isMinimized;
        state.isMinimized = nextMinimized;
        state.position = getBottomRightPosition(
          nextMinimized ? getMinimizedSize(state.size) : state.size
        );
        render();
      })
    );
    actions.appendChild(
      iconButton("Close chat", "x", function () {
        state.isOpen = false;
        state.isMinimized = false;
        state.position = getBottomRightPosition({ width: 64, height: 64 });
        render();
      })
    );
    header.appendChild(actions);

    return header;
  }

  function createMetaBar() {
    const meta = document.createElement("div");
    meta.className = "scout-chatbot-meta";
    meta.innerHTML =
      '<span>' + icon("clock") + " Universal script embed</span>" +
      '<div><button aria-label="Open settings" type="button">' +
      icon("settings") +
      '</button><button aria-label="Expand widget" type="button">' +
      icon("maximize") +
      "</button></div>";
    return meta;
  }

  function createMessages(options, state) {
    const list = document.createElement("div");
    list.className = "scout-chatbot-messages";

    if (options.modeNotice) {
      const notice = document.createElement("div");
      notice.className = "scout-chatbot-notice";
      notice.innerHTML =
        '<div>' + icon("sparkles") + "<strong>Integration mode</strong></div>" +
        "<p>" +
        escapeHtml(options.modeNotice) +
        "</p>";
      list.appendChild(notice);
    }

    state.messages.forEach(function (message) {
      list.appendChild(createMessage(message));
    });

    if (state.isTyping) {
      const typing = document.createElement("div");
      typing.className = "scout-chatbot-message-row assistant";
      typing.innerHTML =
        '<div class="scout-chatbot-small-avatar">' +
        icon("bot") +
        '</div><div class="scout-chatbot-typing"><span></span><span></span><span></span></div>';
      list.appendChild(typing);
    }

    return list;
  }

  function createMessage(message) {
    const row = document.createElement("div");
    row.className = "scout-chatbot-message-row " + message.role;

    const bubble = document.createElement("div");
    bubble.className = "scout-chatbot-message-wrap";
    bubble.innerHTML =
      '<div class="scout-chatbot-bubble">' +
      escapeHtml(message.text) +
      '</div><div class="scout-chatbot-time">' +
      (message.role === "user" ? icon("check") : "") +
      escapeHtml(message.time || "") +
      "</div>";

    if (message.role === "assistant") {
      const avatar = document.createElement("div");
      avatar.className = "scout-chatbot-small-avatar";
      avatar.innerHTML = icon("bot");
      row.appendChild(avatar);
      row.appendChild(bubble);
      return row;
    }

    row.appendChild(bubble);
    const userAvatar = document.createElement("div");
    userAvatar.className = "scout-chatbot-user-avatar";
    userAvatar.innerHTML = icon("user");
    row.appendChild(userAvatar);
    return row;
  }

  function createComposer(options, state, sendMessage) {
    const footer = document.createElement("footer");
    footer.className = "scout-chatbot-composer-wrap";

    if (options.quickPrompts && options.quickPrompts.length) {
      const prompts = document.createElement("div");
      prompts.className = "scout-chatbot-prompts";
      options.quickPrompts.forEach(function (prompt) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = prompt;
        button.addEventListener("click", function () {
          sendMessage(prompt);
        });
        prompts.appendChild(button);
      });
      footer.appendChild(prompts);
    }

    const form = document.createElement("form");
    form.className = "scout-chatbot-composer";
    form.innerHTML =
      '<textarea aria-label="Message ' +
      escapeHtml(options.assistantName) +
      '" rows="2" placeholder="' +
      escapeHtml(options.placeholder) +
      '"></textarea>' +
      '<div><div class="scout-chatbot-composer-actions">' +
      '<button aria-label="Attach file" type="button">' +
      icon("paperclip") +
      '</button><button aria-label="Voice input" type="button">' +
      icon("mic") +
      '</button></div><button class="scout-chatbot-send" aria-label="Send message" type="submit">' +
      icon("arrow") +
      "</button></div>";

    const textarea = form.querySelector("textarea");
    const send = form.querySelector(".scout-chatbot-send");

    textarea.addEventListener("input", function () {
      send.disabled = !textarea.value.trim() || state.isTyping;
    });
    textarea.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      sendMessage(textarea.value);
      textarea.value = "";
      send.disabled = true;
    });
    send.disabled = true;

    footer.appendChild(form);
    return footer;
  }

  function createResizeHandle(state) {
    const handle = document.createElement("button");
    handle.className = "scout-chatbot-resize";
    handle.type = "button";
    handle.setAttribute("aria-label", "Resize chat");
    handle.innerHTML = icon("grip");
    enableResize(handle, state);
    return handle;
  }

  async function getAssistantReply(options, message, history) {
    if (!options.apiUrl) {
      return {
        text: fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)]
      };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(function () {
      controller.abort();
    }, Number(options.requestTimeoutMs) || 60000);
    let response;

    try {
      response = await fetch(options.apiUrl, {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, options.headers || {}),
        body: JSON.stringify({
          company_id: options.companyId,
          user_id: options.userId,
          question: message,
          conversation_id: options.conversationId || undefined,
          history: history
        }),
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error("The assistant is taking too long to respond. Please check that the AI service is running.");
      }

      throw error;
    } finally {
      window.clearTimeout(timeout);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(function () { return null; });
      throw new Error(errorData && errorData.message ? errorData.message : "Chat API request failed");
    }

    const data = await response.json();

    if (data && data.conversation_id) {
      options.conversationId = data.conversation_id;
    }

    if (typeof data === "string") {
      return { text: data };
    }

    return {
      text: data.answer || data.text || data.message || data.reply || "I received your message.",
      time: data.time
    };
  }

  function iconButton(label, name, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scout-chatbot-icon-button";
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = icon(name);
    button.addEventListener("click", onClick);
    return button;
  }

  function resolveMount(options) {
    if (options.mount instanceof HTMLElement) {
      return options.mount;
    }

    if (options.mount) {
      return document.querySelector(options.mount);
    }

    let mount = document.getElementById("scout-chatbot");

    if (!mount) {
      mount = document.createElement("div");
      mount.id = "scout-chatbot";
      document.body.appendChild(mount);
    }

    return mount;
  }

  function normalizeMessages(messages) {
    return messages.map(function (message, index) {
      return {
        id: message.id || "initial-" + (index + 1),
        role: message.role || "assistant",
        text: message.text || "",
        time: message.time || formatTime()
      };
    });
  }

  function initializeLayout(options, state) {
    if (!state.size) {
      state.size = getDefaultSize(options);
    }

    if (!state.position) {
      state.position = getDefaultPosition(options, state.size);
    }

    state.size = clampSize(state.size);
    state.position = clampPosition(
      state.position,
      state.isMinimized ? getMinimizedSize(state.size) : state.size
    );
  }

  function getDefaultSize(options) {
    return clampSize({
      width: Number(options.width) || 440,
      height: Math.round(window.innerHeight * (Number(options.heightRatio) || 0.75))
    });
  }

  function getDefaultPosition(options, size) {
    const gap = 20;

    return clampPosition(
      {
        left: options.position === "bottom-left" ? gap : window.innerWidth - size.width - gap,
        top: window.innerHeight - size.height - gap
      },
      size
    );
  }

  function getBottomRightPosition(size) {
    const gap = 20;

    return clampPosition(
      {
        left: window.innerWidth - size.width - gap,
        top: window.innerHeight - size.height - gap
      },
      size
    );
  }

  function getMinimizedSize(size) {
    return {
      width: size.width,
      height: 76
    };
  }

  function clampSize(size) {
    const maxWidth = Math.max(320, window.innerWidth - 24);
    const maxHeight = Math.max(420, window.innerHeight - 24);

    return {
      width: Math.min(Math.max(size.width, 340), maxWidth),
      height: Math.min(Math.max(size.height, 440), maxHeight)
    };
  }

  function clampPosition(position, size) {
    const gap = 12;

    return {
      left: Math.min(Math.max(position.left, gap), Math.max(gap, window.innerWidth - size.width - gap)),
      top: Math.min(Math.max(position.top, gap), Math.max(gap, window.innerHeight - size.height - gap))
    };
  }

  function enableDrag(header, state) {
    header.addEventListener("pointerdown", function (event) {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      const root = header.closest(".scout-chatbot-root");
      const rect = root.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = rect.left;
      const startTop = rect.top;
      header.setPointerCapture(event.pointerId);
      document.body.classList.add("scout-chatbot-moving");

      function move(moveEvent) {
        const nextPosition = clampPosition(
          {
            left: startLeft + moveEvent.clientX - startX,
            top: startTop + moveEvent.clientY - startY
          },
          state.isMinimized ? { width: rect.width, height: rect.height } : state.size
        );
        state.position = nextPosition;
        root.style.left = nextPosition.left + "px";
        root.style.top = nextPosition.top + "px";
      }

      function stop() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.body.classList.remove("scout-chatbot-moving");
      }

      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop);
    });
  }

  function enableResize(handle, state) {
    handle.addEventListener("pointerdown", function (event) {
      event.preventDefault();
      event.stopPropagation();

      const root = handle.closest(".scout-chatbot-root");
      const startX = event.clientX;
      const startY = event.clientY;
      const startSize = {
        width: state.size.width,
        height: state.size.height
      };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add("scout-chatbot-resizing");

      function move(moveEvent) {
        const nextSize = clampSize({
          width: startSize.width + moveEvent.clientX - startX,
          height: startSize.height + moveEvent.clientY - startY
        });
        state.size = nextSize;
        state.position = clampPosition(state.position, nextSize);
        root.style.width = nextSize.width + "px";
        root.style.height = nextSize.height + "px";
        root.style.left = state.position.left + "px";
        root.style.top = state.position.top + "px";
      }

      function stop() {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", stop);
        document.body.classList.remove("scout-chatbot-resizing");
      }

      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", stop);
    });
  }

  function scrollMessagesToBottom(mount) {
    const list = mount.querySelector(".scout-chatbot-messages");
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function formatTime() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex || "#0ea5e9").replace("#", "");
    const full = clean.length === 3 ? clean.split("").map(function (char) { return char + char; }).join("") : clean;
    const intValue = parseInt(full, 16);
    const red = (intValue >> 16) & 255;
    const green = (intValue >> 8) & 255;
    const blue = intValue & 255;
    return "rgba(" + red + ", " + green + ", " + blue + ", " + alpha + ")";
  }

  function icon(name) {
    const icons = {
      arrow: '<svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
      bot: '<svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>',
      check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
      chevron: '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
      clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
      maximize: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="M9 21H3v-6"/><path d="m3 21 7-7"/></svg>',
      grip: '<svg viewBox="0 0 24 24"><path d="M21 14v7h-7"/><path d="M21 21 3 3"/></svg>',
      message: '<svg viewBox="0 0 24 24"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/></svg>',
      mic: '<svg viewBox="0 0 24 24"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v3"/></svg>',
      minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
      paperclip: '<svg viewBox="0 0 24 24"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
      search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
      settings: '<svg viewBox="0 0 24 24"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z"/><circle cx="12" cy="12" r="3"/></svg>',
      restore: '<svg viewBox="0 0 24 24"><path d="M3 7V3h4"/><path d="M21 17v4h-4"/><path d="M7 3a9 9 0 0 1 8.5 6"/><path d="M17 21a9 9 0 0 1-8.5-6"/></svg>',
      sparkles: '<svg viewBox="0 0 24 24"><path d="m12 3-1.9 5.8L4 11l6.1 2.2L12 19l1.9-5.8L20 11l-6.1-2.2Z"/><path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 17v4"/><path d="M17 19h4"/></svg>',
      user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
    };

    return icons[name] || "";
  }

  function ensureStyles() {
    if (document.getElementById("scout-chatbot-styles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "scout-chatbot-styles";
    style.textContent = `
      .scout-chatbot-root, .scout-chatbot-root * { box-sizing: border-box; }
      .scout-chatbot-root { position: fixed; z-index: 2147483000; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; }
      .scout-chatbot-moving, .scout-chatbot-resizing { user-select: none; }
      .scout-chatbot-root svg { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      .scout-chatbot-launcher { display: flex; width: 64px; height: 64px; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: var(--scout-brand); color: #fff; box-shadow: 0 24px 70px -32px rgb(10 14 29 / 0.5); cursor: pointer; transition: transform 180ms ease, filter 180ms ease; }
      .scout-chatbot-launcher:hover { transform: translateY(-2px); filter: brightness(1.08); }
      .scout-chatbot-launcher:focus { outline: 0; box-shadow: 0 0 0 4px var(--scout-focus), 0 24px 70px -32px rgb(10 14 29 / 0.5); }
      .scout-chatbot-launcher svg { width: 28px; height: 28px; }
      .scout-chatbot-panel { position: relative; display: flex; width: 100%; height: 100%; min-height: 440px; flex-direction: column; overflow: hidden; border: 1px solid rgb(255 255 255 / 0.82); border-radius: 28px; background: #fff; box-shadow: 0 24px 70px -32px rgb(10 14 29 / 0.5); animation: scoutSlideUp 220ms ease-out both; }
      .scout-chatbot-panel.is-minimized { min-height: 0; height: 76px; }
      .scout-chatbot-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid rgb(241 245 249 / 0.28); background: var(--scout-brand); color: #fff; cursor: move; touch-action: none; }
      .scout-chatbot-identity { display: flex; min-width: 0; align-items: center; gap: 12px; }
      .scout-chatbot-avatar { position: relative; display: flex; width: 44px; height: 44px; flex: 0 0 auto; align-items: center; justify-content: center; border-radius: 16px; background: #fff; color: var(--scout-brand); }
      .scout-chatbot-avatar svg { width: 24px; height: 24px; }
      .scout-chatbot-avatar span { position: absolute; top: -2px; right: -2px; width: 14px; height: 14px; border: 2px solid var(--scout-brand); border-radius: 999px; background: #34d399; }
      .scout-chatbot-title-wrap { min-width: 0; }
      .scout-chatbot-title-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .scout-chatbot-title-line h2 { overflow: hidden; margin: 0; color: #fff; font-size: 16px; font-weight: 700; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
      .scout-chatbot-title-line strong { border-radius: 999px; background: rgb(255 255 255 / 0.12); padding: 2px 8px; color: #e2e8f0; font-size: 11px; font-weight: 700; }
      .scout-chatbot-title-wrap p { display: flex; align-items: center; gap: 6px; margin: 2px 0 0; color: #cbd5e1; font-size: 12px; }
      .scout-chatbot-title-wrap p span { width: 6px; height: 6px; border-radius: 999px; background: #34d399; }
      .scout-chatbot-actions { display: flex; align-items: center; gap: 4px; }
      .scout-chatbot-icon-button { display: flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: transparent; color: #cbd5e1; cursor: pointer; transition: background 160ms ease, color 160ms ease; }
      .scout-chatbot-icon-button:hover { background: rgb(255 255 255 / 0.1); color: #fff; }
      .scout-chatbot-meta { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; background: rgb(248 250 252 / 0.82); }
      .scout-chatbot-meta span { display: flex; align-items: center; gap: 8px; color: #475569; font-size: 12px; font-weight: 700; }
      .scout-chatbot-meta span svg { width: 16px; height: 16px; color: #94a3b8; }
      .scout-chatbot-meta div { display: flex; gap: 8px; }
      .scout-chatbot-meta button { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; color: #475569; cursor: pointer; }
      .scout-chatbot-messages { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 16px; overflow-y: auto; padding: 20px; background: #fff; scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
      .scout-chatbot-messages::-webkit-scrollbar { width: 8px; }
      .scout-chatbot-messages::-webkit-scrollbar-thumb { border-radius: 999px; background: #cbd5e1; }
      .scout-chatbot-notice { border: 1px solid #bae6fd; border-radius: 8px; background: #f0f9ff; padding: 12px 16px; color: #334155; font-size: 14px; line-height: 1.55; }
      .scout-chatbot-notice div { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; color: #020617; font-weight: 700; }
      .scout-chatbot-notice p { margin: 0; }
      .scout-chatbot-notice svg { color: var(--scout-accent); }
      .scout-chatbot-message-row { display: flex; gap: 12px; }
      .scout-chatbot-message-row.user { justify-content: flex-end; }
      .scout-chatbot-small-avatar, .scout-chatbot-user-avatar { display: flex; width: 32px; height: 32px; flex: 0 0 auto; align-items: center; justify-content: center; margin-top: 4px; border-radius: 999px; }
      .scout-chatbot-small-avatar { background: var(--scout-brand); color: #fff; }
      .scout-chatbot-user-avatar { background: #e0f2fe; color: #0369a1; }
      .scout-chatbot-message-wrap { max-width: 78%; }
      .scout-chatbot-bubble { border-radius: 16px; padding: 12px 16px; font-size: 14px; line-height: 1.55; box-shadow: 0 1px 2px rgb(15 23 42 / 0.06); }
      .scout-chatbot-message-row.assistant .scout-chatbot-bubble { border: 1px solid #f1f5f9; border-top-left-radius: 6px; background: #f8fafc; color: #1f2937; }
      .scout-chatbot-message-row.user .scout-chatbot-bubble { border-top-right-radius: 6px; background: var(--scout-brand); color: #fff; }
      .scout-chatbot-time { display: flex; align-items: center; gap: 6px; margin-top: 4px; color: #94a3b8; font-size: 11px; }
      .scout-chatbot-message-row.user .scout-chatbot-time { justify-content: flex-end; }
      .scout-chatbot-time svg { width: 12px; height: 12px; }
      .scout-chatbot-typing { display: flex; align-items: center; gap: 4px; border: 1px solid #f1f5f9; border-radius: 16px; border-top-left-radius: 6px; background: #f8fafc; padding: 16px; box-shadow: 0 1px 2px rgb(15 23 42 / 0.06); }
      .scout-chatbot-typing span { width: 8px; height: 8px; border-radius: 999px; background: #94a3b8; animation: scoutBlink 1.2s infinite ease-in-out; }
      .scout-chatbot-typing span:nth-child(2) { animation-delay: 160ms; }
      .scout-chatbot-typing span:nth-child(3) { animation-delay: 320ms; }
      .scout-chatbot-composer-wrap { border-top: 1px solid #f1f5f9; background: rgb(248 250 252 / 0.72); padding: 16px 20px; }
      .scout-chatbot-prompts { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 10px; }
      .scout-chatbot-prompts button { flex: 0 0 auto; border: 1px solid #e2e8f0; border-radius: 999px; background: #fff; padding: 6px 12px; color: #334155; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 1px 2px rgb(15 23 42 / 0.04); }
      .scout-chatbot-prompts button:hover { border-color: #bae6fd; color: #0369a1; }
      .scout-chatbot-composer { border: 1px solid #e2e8f0; border-radius: 22px; background: #fff; padding: 8px; box-shadow: 0 1px 2px rgb(15 23 42 / 0.05); }
      .scout-chatbot-composer:focus-within { border-color: var(--scout-accent); box-shadow: 0 0 0 4px var(--scout-focus); }
      .scout-chatbot-composer textarea { width: 100%; min-height: 54px; max-height: 112px; resize: none; border: 0; outline: 0; background: transparent; padding: 8px 12px; color: #0f172a; font: inherit; font-size: 14px; line-height: 1.55; }
      .scout-chatbot-composer textarea::placeholder { color: #94a3b8; }
      .scout-chatbot-composer > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 4px 4px; }
      .scout-chatbot-composer-actions { display: flex; gap: 4px; }
      .scout-chatbot-composer-actions button { display: flex; width: 36px; height: 36px; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: transparent; color: #64748b; cursor: pointer; }
      .scout-chatbot-composer-actions button:hover { background: #f1f5f9; color: #0f172a; }
      .scout-chatbot-send { display: flex; width: 40px; height: 40px; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: var(--scout-brand); color: #fff; cursor: pointer; transition: transform 160ms ease, opacity 160ms ease; }
      .scout-chatbot-send:hover { transform: translateY(-1px); }
      .scout-chatbot-send:disabled { cursor: not-allowed; background: #cbd5e1; transform: none; }
      .scout-chatbot-resize { position: absolute; right: 10px; bottom: 10px; display: flex; width: 26px; height: 26px; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: rgb(15 23 42 / 0.06); color: #64748b; cursor: nwse-resize; touch-action: none; }
      .scout-chatbot-resize:hover { background: rgb(15 23 42 / 0.1); color: #0f172a; }
      @keyframes scoutSlideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes scoutBlink { 0%, 80%, 100% { opacity: 0.28; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
      @media (max-width: 520px) {
        .scout-chatbot-panel { border-radius: 22px; }
        .scout-chatbot-resize { display: none; }
      }
    `;
    document.head.appendChild(style);
  }

  window.ScoutChatbot = {
    init: init
  };
})();
