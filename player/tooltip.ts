export type TooltipControls = {
  onBack(): void;
  onNext(): void;
  onClose(): void;
  onGuideLink?(guideId: string): void;
};

type AnchoredTooltip = HTMLElement & {
  __scoutCleanup?: () => void;
};

export function createTooltip(input: {
  title: string;
  message: string;
  index: number;
  total: number;
  target: HTMLElement;
  hideStepCount?: boolean;
  primaryLabel?: string;
  controls: TooltipControls;
}) {
  const tooltip = document.createElement("div") as AnchoredTooltip;
  const overlay = input.target === document.body ? document.createElement("div") : null;
  if (overlay) {
    overlay.className = "scout-adoption-overlay";
    document.body.appendChild(overlay);
  }
  tooltip.className = "scout-adoption-tooltip";
  tooltip.innerHTML = `
    <div class="scout-adoption-tooltip__arrow"></div>
    <button type="button" class="scout-adoption-tooltip__close" data-action="close" aria-label="Close guide">&times;</button>
    <div class="scout-adoption-tooltip__message"></div>
    <div class="scout-adoption-tooltip__footer">
      <span>${input.hideStepCount ? "" : `${input.index + 1} / ${input.total}`}</span>
      <div>
        ${input.index > 0 ? '<button type="button" data-action="back">Back</button>' : ""}
        <button type="button" data-action="next">${input.primaryLabel ?? (input.index + 1 === input.total ? "Done" : "Next")}</button>
      </div>
    </div>
  `;
  tooltip.addEventListener("pointerdown", (event) => event.stopPropagation());
  tooltip.addEventListener("click", (event) => event.stopPropagation());
  tooltip.querySelector(".scout-adoption-tooltip__message")!.innerHTML = sanitizeGuideHtml(input.message);
  tooltip.querySelectorAll<HTMLAnchorElement>(".scout-adoption-tooltip__message a[href]").forEach((link) => {
    link.addEventListener("pointerdown", (event) => event.stopPropagation());
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      const href = link.getAttribute("href") ?? "";
      const guideId = link.dataset.scoutGuideId || href.replace(/^#scout-guide:/, "");
      if (href.startsWith("#scout-guide:") && guideId && input.controls.onGuideLink) {
        input.controls.onGuideLink(guideId);
        return;
      }
      window.open(href, "_blank", "noopener,noreferrer");
    });
  });
  tooltip.querySelector('[data-action="back"]')?.addEventListener("click", input.controls.onBack);
  tooltip.querySelector('[data-action="next"]')?.addEventListener("click", input.controls.onNext);
  tooltip.querySelector('[data-action="close"]')?.addEventListener("click", input.controls.onClose);
  document.body.appendChild(tooltip);
  if (overlay) {
    tooltip.__scoutCleanup = () => overlay.remove();
  }
  attachAnchoredPositioning(tooltip, input.target);

  return tooltip;
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
      const safeHref = element.tagName === "A" && attribute.name === "href" ? normalizeSafeHref(attribute.value) : "";
      const allowedHref = Boolean(safeHref);
      const allowedGuideId = element.tagName === "A" && attribute.name === "data-scout-guide-id" && /^[a-z0-9-]+$/i.test(attribute.value);
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
      } else if (allowedHref && safeHref) {
        element.setAttribute("href", safeHref);
      } else if (!allowedHref && !allowedGuideId && !allowedImageSrc && !allowedFont && !allowedTableAttribute && !allowedMediaAttribute) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      const href = element.getAttribute("href") ?? "";
      if (!href.startsWith("#scout-guide:")) {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noopener noreferrer");
      }
    }
  });
  return template.innerHTML;
}

function normalizeSafeHref(value: string) {
  const href = value.trim();
  if (!href) return "";
  if (/^(https?:\/\/|\/|#scout-guide:)/i.test(href)) return href;
  if (/^(www\.|[a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:[/:?#].*)?$/i.test(href) && !/\s/.test(href)) {
    return `https://${href}`;
  }
  return "";
}

export function injectTooltipStyles() {
  if (document.getElementById("scout-adoption-player-style")) return;
  const style = document.createElement("style");
  style.id = "scout-adoption-player-style";
  style.textContent = `
    .scout-adoption-highlight { outline: 3px solid #0ea5e9 !important; outline-offset: 4px !important; border-radius: 6px !important; }
    .scout-adoption-overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgb(15 23 42 / .52); box-shadow: inset 0 0 140px rgb(15 23 42 / .46); }
    .scout-adoption-tooltip { position: fixed; z-index: 2147483647; width: max-content; max-width: min(292px, calc(100vw - 32px)); border: 1px solid rgba(14, 165, 233, .22); border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 18px 48px rgb(15 23 42 / .20), 0 2px 10px rgb(15 23 42 / .08); padding: 12px 14px 11px; color: #0f172a; font: 13px/1.4 system-ui, sans-serif; backdrop-filter: blur(10px); }
    .scout-adoption-tooltip__close { position: absolute; top: 7px; right: 8px; width: 22px; height: 22px; display: inline-grid; place-items: center; border: 0 !important; border-radius: 999px !important; background: transparent !important; color: #64748b !important; padding: 0 !important; margin: 0 !important; font: 18px/1 system-ui, sans-serif !important; cursor: pointer; }
    .scout-adoption-tooltip__close:hover { background: #f1f5f9 !important; color: #0f172a !important; }
    .scout-adoption-tooltip__title { max-width: 238px; padding-right: 20px; font-weight: 750; font-size: 13px; margin-bottom: 4px; }
    .scout-adoption-tooltip__message { max-width: 252px; color: #475569; font-size: 12.5px; }
    .scout-adoption-tooltip__message p, .scout-adoption-tooltip__message div { margin: 0 0 4px; }
    .scout-adoption-tooltip__message h1, .scout-adoption-tooltip__message h2, .scout-adoption-tooltip__message h3 { margin: 0 0 5px; font-weight: 750; line-height: 1.2; }
    .scout-adoption-tooltip__message h1 { font-size: 17px; }
    .scout-adoption-tooltip__message h2 { font-size: 15px; }
    .scout-adoption-tooltip__message h3 { font-size: 13.5px; }
    .scout-adoption-tooltip__message blockquote { margin: 4px 0; border-left: 3px solid #cbd5e1; padding-left: 8px; color: #64748b; }
    .scout-adoption-tooltip__message pre { overflow: auto; border-radius: 6px; background: #f1f5f9; padding: 6px; font-size: 11px; }
    .scout-adoption-tooltip__message img { max-width: 100%; height: auto; border-radius: 6px; }
    .scout-adoption-tooltip__message table { max-width: 100%; border-collapse: collapse; font-size: 11px; }
    .scout-adoption-tooltip__message th, .scout-adoption-tooltip__message td { border: 1px solid #cbd5e1; padding: 3px 5px; }
    .scout-adoption-tooltip__message ul, .scout-adoption-tooltip__message ol { margin: 4px 0 0 18px; padding: 0; }
    .scout-adoption-tooltip__message li { margin: 2px 0; }
    .scout-adoption-tooltip__message .ql-align-center { text-align: center; }
    .scout-adoption-tooltip__message .ql-align-right { text-align: right; }
    .scout-adoption-tooltip__message .ql-align-justify { text-align: justify; }
    .scout-adoption-tooltip__message .ql-size-small { font-size: .75em; }
    .scout-adoption-tooltip__message .ql-size-large { font-size: 1.35em; }
    .scout-adoption-tooltip__message .ql-size-huge { font-size: 1.8em; }
    .scout-adoption-tooltip__message .ql-indent-1 { padding-left: 1.5em; }
    .scout-adoption-tooltip__message .ql-indent-2 { padding-left: 3em; }
    .scout-adoption-tooltip__message .ql-indent-3 { padding-left: 4.5em; }
    .scout-adoption-tooltip__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; color: #64748b; font-size: 11.5px; }
    .scout-adoption-tooltip button:not(.scout-adoption-tooltip__close) { margin-left: 6px; border: 1px solid #dbe3ee; border-radius: 999px; background: #fff; padding: 5px 9px; color: #0f172a; cursor: pointer; font: 600 12px system-ui, sans-serif; }
    .scout-adoption-tooltip button[data-action="next"] { border-color: #0f172a; background: #0f172a; color: #fff; }
    .scout-adoption-tooltip__arrow { position: absolute; width: 12px; height: 12px; background: rgba(255,255,255,.98); border: 1px solid rgba(14, 165, 233, .22); transform: rotate(45deg); }
    .scout-adoption-tooltip[data-floating="center"] { max-width: min(420px, calc(100vw - 32px)); padding: 18px 18px 15px; box-shadow: 0 30px 80px rgb(15 23 42 / .28), 0 8px 22px rgb(15 23 42 / .14); }
    .scout-adoption-tooltip[data-floating="center"] .scout-adoption-tooltip__arrow { display: none; }
    .scout-adoption-tooltip[data-floating="center"] .scout-adoption-tooltip__message { max-width: 360px; font-size: 13px; }
    .scout-adoption-tooltip[data-placement="bottom"] .scout-adoption-tooltip__arrow { top: -7px; left: var(--arrow-left, 22px); border-right: 0; border-bottom: 0; }
    .scout-adoption-tooltip[data-placement="top"] .scout-adoption-tooltip__arrow { bottom: -7px; left: var(--arrow-left, 22px); border-left: 0; border-top: 0; }
    .scout-adoption-tooltip[data-placement="right"] .scout-adoption-tooltip__arrow { left: -7px; top: var(--arrow-top, 20px); border-right: 0; border-top: 0; }
    .scout-adoption-tooltip[data-placement="left"] .scout-adoption-tooltip__arrow { right: -7px; top: var(--arrow-top, 20px); border-left: 0; border-bottom: 0; }
    .scout-adoption-missing { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; border-radius: 8px; background: #020617; color: #fff; padding: 12px 14px; font: 14px system-ui, sans-serif; }
    .scout-adoption-recovery-toast { top: max(16px, env(safe-area-inset-top)); bottom: auto; max-width: min(420px, calc(100vw - 32px)); text-align: center; pointer-events: none; box-shadow: 0 18px 52px rgb(15 23 42 / .24); }
  `;
  document.head.appendChild(style);
}

function attachAnchoredPositioning(tooltip: AnchoredTooltip, target: HTMLElement) {
  let frame = 0;
  let followFrames = 0;
  const update = () => {
    frame = 0;
    if (!tooltip.isConnected) return;
    positionTooltip(tooltip, target);
  };
  const schedule = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(update);
  };
  const followDuringSmoothScroll = () => {
    schedule();
    followFrames += 1;
    if (followFrames < 40 && tooltip.isConnected) {
      window.requestAnimationFrame(followDuringSmoothScroll);
    }
  };

  window.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
  observer?.observe(target);
  observer?.observe(tooltip);
  followDuringSmoothScroll();

  const previousCleanup = tooltip.__scoutCleanup;
  tooltip.__scoutCleanup = () => {
    previousCleanup?.();
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    observer?.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

export function positionTooltip(tooltip: HTMLElement, target: HTMLElement) {
  if (target === document.body) {
    tooltip.dataset.placement = "bottom";
    tooltip.dataset.floating = "center";
    tooltip.style.top = "50%";
    tooltip.style.left = "50%";
    tooltip.style.transform = "translate(-50%, -50%)";
    return;
  }

  const gap = 14;
  const margin = 12;
  const rect = target.getBoundingClientRect();
  const width = tooltip.offsetWidth;
  const height = tooltip.offsetHeight;
  const spaces = {
    bottom: window.innerHeight - rect.bottom,
    top: rect.top,
    right: window.innerWidth - rect.right,
    left: rect.left
  };
  const placement = spaces.bottom >= height + gap ? "bottom"
    : spaces.top >= height + gap ? "top"
    : spaces.right >= width + gap ? "right"
    : spaces.left >= width + gap ? "left"
    : spaces.bottom >= spaces.top ? "bottom" : "top";

  let top = placement === "top" ? rect.top - height - gap
    : placement === "bottom" ? rect.bottom + gap
    : rect.top + rect.height / 2 - height / 2;
  let left = placement === "left" ? rect.left - width - gap
    : placement === "right" ? rect.right + gap
    : rect.left + rect.width / 2 - width / 2;

  top = Math.min(window.innerHeight - height - margin, Math.max(margin, top));
  left = Math.min(window.innerWidth - width - margin, Math.max(margin, left));

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
  tooltip.style.transform = "";
  delete tooltip.dataset.floating;
  tooltip.dataset.placement = placement;
  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  tooltip.style.setProperty("--arrow-left", `${Math.min(width - 22, Math.max(10, targetCenterX - left - 6))}px`);
  tooltip.style.setProperty("--arrow-top", `${Math.min(height - 22, Math.max(10, targetCenterY - top - 6))}px`);
}
