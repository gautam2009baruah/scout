(function () {
  const DEFAULTS = {
    scoutBaseUrl: "",
    targetAppId: "",
    autoShowLauncher: true
  };

  function escapeCss(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function byXPath(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue instanceof HTMLElement ? result.singleNodeValue : null;
    } catch {
      return null;
    }
  }

  function byRoleText(value) {
    const parts = String(value).split("::");
    const role = parts[0];
    const text = (parts.slice(1).join("::") || "").trim().toLowerCase();

    return Array.from(document.querySelectorAll(`[role="${escapeCss(role)}"]`))
      .find((element) => element instanceof HTMLElement && element.innerText.trim().toLowerCase() === text) || null;
  }

  function findTarget(target) {
    const candidates = [...(target.selectorCandidates || [])].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));

    for (const candidate of candidates) {
      try {
        if (candidate.type === "xpath") {
          const element = byXPath(candidate.value);
          if (element) return element;
        } else if (candidate.type === "role-text") {
          const element = byRoleText(candidate.value);
          if (element) return element;
        } else {
          const element = document.querySelector(candidate.value);
          if (element instanceof HTMLElement) return element;
        }
      } catch {
        // Try the next selector candidate.
      }
    }

    return null;
  }

  function isScoutPlayerEvent(event) {
    if (event.target instanceof Element && event.target.closest(".scout-adoption-tooltip, .scout-adoption-missing")) return true;
    if ("clientX" in event && "clientY" in event) {
      return Array.from(document.querySelectorAll(".scout-adoption-tooltip")).some((tooltip) => {
        const rect = tooltip.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
    }
    return false;
  }

  function injectStyles() {
    if (document.getElementById("scout-adoption-player-style")) return;
    const style = document.createElement("style");
    style.id = "scout-adoption-player-style";
    style.textContent = `
      .scout-adoption-launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; border: 0; border-radius: 999px; background: #020617; color: #fff; padding: 12px 16px; font: 600 14px system-ui, sans-serif; box-shadow: 0 16px 44px rgb(15 23 42 / .28); cursor: pointer; }
      .scout-adoption-menu { position: fixed; right: 20px; bottom: 72px; z-index: 2147483646; width: min(320px, calc(100vw - 40px)); border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 18px 52px rgb(15 23 42 / .22); padding: 8px; font: 14px system-ui, sans-serif; }
      .scout-adoption-menu button { display: block; width: 100%; border: 0; border-radius: 6px; background: transparent; padding: 10px; text-align: left; color: #0f172a; cursor: pointer; }
      .scout-adoption-menu button:hover { background: #f8fafc; }
      .scout-adoption-highlight { outline: 3px solid #0ea5e9 !important; outline-offset: 4px !important; border-radius: 6px !important; }
      .scout-adoption-tooltip { position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 32px)); border: 1px solid #bfdbfe; border-radius: 8px; background: #fff; box-shadow: 0 20px 60px rgb(15 23 42 / .24); padding: 14px; color: #0f172a; font: 14px/1.45 system-ui, sans-serif; }
      .scout-adoption-tooltip h3 { margin: 0 0 6px; font-size: 15px; line-height: 1.35; }
      .scout-adoption-tooltip p { margin: 0; color: #475569; }
      .scout-adoption-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; color: #64748b; font-size: 12px; }
      .scout-adoption-footer button { margin-left: 6px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 6px 9px; color: #0f172a; cursor: pointer; }
      .scout-adoption-footer button[data-next] { border-color: #020617; background: #020617; color: #fff; }
      .scout-adoption-missing { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; border-radius: 8px; background: #020617; color: #fff; padding: 12px 14px; font: 14px system-ui, sans-serif; }
      .scout-adoption-missing button { margin-left: 8px; border: 1px solid #475569; border-radius: 6px; background: #fff; padding: 5px 8px; color: #020617; cursor: pointer; }
    `;
    document.head.appendChild(style);
  }

  class Player {
    constructor(guide) {
      this.guide = guide;
      this.index = 0;
      this.tooltip = null;
      this.highlighted = null;
    }

    start() {
      injectStyles();
      this.index = Number(localStorage.getItem(this.storageKey()) || 0);
      this.render();
    }

    storageKey() {
      return `scout-adoption-progress:${this.guide.id}`;
    }

    clear() {
      if (this.tooltip) this.tooltip.remove();
      if (this.highlighted) this.highlighted.classList.remove("scout-adoption-highlight");
      const missing = document.querySelector(".scout-adoption-missing");
      if (missing) missing.remove();
      this.tooltip = null;
      this.highlighted = null;
    }

    render() {
      this.clear();
      const step = this.guide.steps[this.index];

      if (!step) {
        localStorage.removeItem(this.storageKey());
        
        // Fire completion event for orchestration integration
        window.dispatchEvent(new CustomEvent('scout-workflow-complete', {
          detail: {
            workflowId: this.guide.id,
            workflowTitle: this.guide.title,
            success: true
          }
        }));
        console.log(`✅ Scout workflow completed: ${this.guide.title} (ID: ${this.guide.id})`);
        
        return;
      }

      const target = findTarget(step.target || {});

      if (!target) {
        this.showMissing();
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      target.classList.add("scout-adoption-highlight");
      this.highlighted = target;
      this.tooltip = this.createTooltip(step, target);

      if (step.trigger === "click") {
        const advanceOnClick = (event) => {
          if (isScoutPlayerEvent(event)) return;
          target.removeEventListener("click", advanceOnClick);
          this.next();
        };
        target.addEventListener("click", advanceOnClick);
      }
      if (step.trigger === "input") target.addEventListener("input", () => this.next(), { once: true });
    }

    createTooltip(step, target) {
      const tooltip = document.createElement("div");
      tooltip.className = "scout-adoption-tooltip";
      tooltip.innerHTML = `
        <h3></h3>
        <p></p>
        <div class="scout-adoption-footer">
          <span>${this.index + 1} / ${this.guide.steps.length}</span>
          <span>
            <button type="button" data-back>Back</button>
            <button type="button" data-skip>Skip</button>
            <button type="button" data-next>${this.index + 1 === this.guide.steps.length ? "Done" : "Next"}</button>
          </span>
        </div>
      `;
      tooltip.addEventListener("pointerdown", (event) => event.stopPropagation());
      tooltip.addEventListener("click", (event) => event.stopPropagation());
      tooltip.querySelector("h3").textContent = step.title || `Step ${this.index + 1}`;
      tooltip.querySelector("p").textContent = step.message || "";
      tooltip.querySelector("[data-back]").addEventListener("click", () => this.previous());
      tooltip.querySelector("[data-skip]").addEventListener("click", () => this.next());
      tooltip.querySelector("[data-next]").addEventListener("click", () => this.next());
      document.body.appendChild(tooltip);
      const rect = target.getBoundingClientRect();
      tooltip.style.top = `${Math.min(window.innerHeight - tooltip.offsetHeight - 16, Math.max(16, rect.bottom + 12))}px`;
      tooltip.style.left = `${Math.min(window.innerWidth - tooltip.offsetWidth - 16, Math.max(16, rect.left))}px`;
      return tooltip;
    }

    showMissing() {
      const banner = document.createElement("div");
      banner.className = "scout-adoption-missing";
      banner.innerHTML = `Element not found on this page <button type="button" data-retry>Retry</button><button type="button" data-skip>Skip</button>`;
      banner.querySelector("[data-retry]").addEventListener("click", () => this.render());
      banner.querySelector("[data-skip]").addEventListener("click", () => this.next());
      document.body.appendChild(banner);
    }

    previous() {
      this.index = Math.max(0, this.index - 1);
      localStorage.setItem(this.storageKey(), String(this.index));
      this.render();
    }

    next() {
      this.index += 1;
      localStorage.setItem(this.storageKey(), String(this.index));
      this.render();
    }
  }

  async function loadGuides(options) {
    const url = new URL("/api/guided-workflow-player/guides", options.scoutBaseUrl || window.location.origin);
    url.searchParams.set("targetAppId", options.targetAppId);
    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(payload && payload.message ? payload.message : "Unable to load guided workflows.");
    }

    return payload.guides || [];
  }

  function showLauncher(guides) {
    injectStyles();
    const launcher = document.createElement("button");
    launcher.className = "scout-adoption-launcher";
    launcher.type = "button";
    launcher.textContent = "Guides";
    launcher.addEventListener("click", () => {
      const existing = document.querySelector(".scout-adoption-menu");
      if (existing) {
        existing.remove();
        return;
      }
      const menu = document.createElement("div");
      menu.className = "scout-adoption-menu";
      guides.forEach((guide) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = guide.title;
        item.addEventListener("click", () => {
          menu.remove();
          new Player(guide).start();
        });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
    });
    document.body.appendChild(launcher);
  }

  window.ScoutAdoptionPlayer = {
    async init(options) {
      const config = Object.assign({}, DEFAULTS, options || {});
      if (!config.targetAppId) throw new Error("targetAppId is required.");
      const guides = await loadGuides(config);
      if (config.autoShowLauncher && guides.length > 0) showLauncher(guides);
      return {
        guides,
        play(guideId) {
          const guide = guides.find((item) => item.id === guideId) || guides[0];
          if (guide) new Player(guide).start();
        }
      };
    }
  };

  if (window.ScoutAdoptionPlayerConfig) {
    window.ScoutAdoptionPlayer.init(window.ScoutAdoptionPlayerConfig).catch((error) => {
      console.error("[ScoutAdoptionPlayer]", error);
    });
  }
})();
