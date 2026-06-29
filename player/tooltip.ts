export type TooltipControls = {
  onBack(): void;
  onNext(): void;
  onClose(): void;
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
  controls: TooltipControls;
}) {
  const tooltip = document.createElement("div") as AnchoredTooltip;
  tooltip.className = "scout-adoption-tooltip";
  tooltip.innerHTML = `
    <div class="scout-adoption-tooltip__arrow"></div>
    <button type="button" class="scout-adoption-tooltip__close" data-action="close" aria-label="Close guide">&times;</button>
    <div class="scout-adoption-tooltip__title"></div>
    <div class="scout-adoption-tooltip__message"></div>
    <div class="scout-adoption-tooltip__footer">
      <span>${input.index + 1} / ${input.total}</span>
      <div>
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="next">${input.index + 1 === input.total ? "Done" : "Next"}</button>
      </div>
    </div>
  `;
  tooltip.querySelector(".scout-adoption-tooltip__title")!.textContent = input.title;
  tooltip.querySelector(".scout-adoption-tooltip__message")!.innerHTML = sanitizeGuideHtml(input.message);
  tooltip.querySelector('[data-action="back"]')?.addEventListener("click", input.controls.onBack);
  tooltip.querySelector('[data-action="next"]')?.addEventListener("click", input.controls.onNext);
  tooltip.querySelector('[data-action="close"]')?.addEventListener("click", input.controls.onClose);
  document.body.appendChild(tooltip);
  attachAnchoredPositioning(tooltip, input.target);

  return tooltip;
}

function sanitizeGuideHtml(value: string) {
  const template = document.createElement("template");
  template.innerHTML = value;
  const allowedTags = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "UL", "OL", "LI", "A", "FONT", "SPAN"]);
  template.content.querySelectorAll("*").forEach((element) => {
    if (!allowedTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      const allowedHref = element.tagName === "A" && attribute.name === "href" && /^(https?:\/\/|\/|#scout-guide:)/i.test(attribute.value);
      const allowedFont = element.tagName === "FONT" && ["color", "face"].includes(attribute.name);
      const allowedStyle = element.tagName === "SPAN" && attribute.name === "style";
      if (allowedStyle) {
        const safeRules = attribute.value.split(";").map((rule) => rule.trim()).filter((rule) => /^(color|background-color|font-family)\s*:/i.test(rule) && !/url|expression|javascript/i.test(rule));
        if (safeRules.length > 0) element.setAttribute("style", safeRules.join("; "));
        else element.removeAttribute("style");
      } else if (!allowedHref && !allowedFont) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML;
}

export function injectTooltipStyles() {
  if (document.getElementById("scout-adoption-player-style")) return;
  const style = document.createElement("style");
  style.id = "scout-adoption-player-style";
  style.textContent = `
    .scout-adoption-highlight { outline: 3px solid #0ea5e9 !important; outline-offset: 4px !important; border-radius: 6px !important; }
    .scout-adoption-tooltip { position: fixed; z-index: 2147483647; width: max-content; max-width: min(292px, calc(100vw - 32px)); border: 1px solid rgba(14, 165, 233, .22); border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 18px 48px rgb(15 23 42 / .20), 0 2px 10px rgb(15 23 42 / .08); padding: 12px 14px 11px; color: #0f172a; font: 13px/1.4 system-ui, sans-serif; backdrop-filter: blur(10px); }
    .scout-adoption-tooltip__close { position: absolute; top: 7px; right: 8px; width: 22px; height: 22px; display: inline-grid; place-items: center; border: 0 !important; border-radius: 999px !important; background: transparent !important; color: #64748b !important; padding: 0 !important; margin: 0 !important; font: 18px/1 system-ui, sans-serif !important; cursor: pointer; }
    .scout-adoption-tooltip__close:hover { background: #f1f5f9 !important; color: #0f172a !important; }
    .scout-adoption-tooltip__title { max-width: 238px; padding-right: 20px; font-weight: 750; font-size: 13px; margin-bottom: 4px; }
    .scout-adoption-tooltip__message { max-width: 252px; color: #475569; font-size: 12.5px; }
    .scout-adoption-tooltip__message p, .scout-adoption-tooltip__message div { margin: 0 0 4px; }
    .scout-adoption-tooltip__message ul, .scout-adoption-tooltip__message ol { margin: 4px 0 0 18px; padding: 0; }
    .scout-adoption-tooltip__message li { margin: 2px 0; }
    .scout-adoption-tooltip__footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; color: #64748b; font-size: 11.5px; }
    .scout-adoption-tooltip button:not(.scout-adoption-tooltip__close) { margin-left: 6px; border: 1px solid #dbe3ee; border-radius: 999px; background: #fff; padding: 5px 9px; color: #0f172a; cursor: pointer; font: 600 12px system-ui, sans-serif; }
    .scout-adoption-tooltip button[data-action="next"] { border-color: #0f172a; background: #0f172a; color: #fff; }
    .scout-adoption-tooltip__arrow { position: absolute; width: 12px; height: 12px; background: rgba(255,255,255,.98); border: 1px solid rgba(14, 165, 233, .22); transform: rotate(45deg); }
    .scout-adoption-tooltip[data-placement="bottom"] .scout-adoption-tooltip__arrow { top: -7px; left: var(--arrow-left, 22px); border-right: 0; border-bottom: 0; }
    .scout-adoption-tooltip[data-placement="top"] .scout-adoption-tooltip__arrow { bottom: -7px; left: var(--arrow-left, 22px); border-left: 0; border-top: 0; }
    .scout-adoption-tooltip[data-placement="right"] .scout-adoption-tooltip__arrow { left: -7px; top: var(--arrow-top, 20px); border-right: 0; border-top: 0; }
    .scout-adoption-tooltip[data-placement="left"] .scout-adoption-tooltip__arrow { right: -7px; top: var(--arrow-top, 20px); border-left: 0; border-bottom: 0; }
    .scout-adoption-missing { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; border-radius: 8px; background: #020617; color: #fff; padding: 12px 14px; font: 14px system-ui, sans-serif; }
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

  tooltip.__scoutCleanup = () => {
    window.removeEventListener("scroll", schedule, true);
    window.removeEventListener("resize", schedule);
    observer?.disconnect();
    if (frame) window.cancelAnimationFrame(frame);
  };
}

export function positionTooltip(tooltip: HTMLElement, target: HTMLElement) {
  if (target === document.body) {
    tooltip.dataset.placement = "bottom";
    tooltip.style.top = "20px";
    tooltip.style.left = "20px";
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
  tooltip.dataset.placement = placement;
  const targetCenterX = rect.left + rect.width / 2;
  const targetCenterY = rect.top + rect.height / 2;
  tooltip.style.setProperty("--arrow-left", `${Math.min(width - 22, Math.max(10, targetCenterX - left - 6))}px`);
  tooltip.style.setProperty("--arrow-top", `${Math.min(height - 22, Math.max(10, targetCenterY - top - 6))}px`);
}
