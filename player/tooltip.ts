export type TooltipControls = {
  onBack(): void;
  onNext(): void;
  onSkip(): void;
};

export function createTooltip(input: {
  title: string;
  message: string;
  index: number;
  total: number;
  target: HTMLElement;
  controls: TooltipControls;
}) {
  const tooltip = document.createElement("div");
  tooltip.className = "scout-adoption-tooltip";
  tooltip.innerHTML = `
    <div class="scout-adoption-tooltip__title"></div>
    <div class="scout-adoption-tooltip__message"></div>
    <div class="scout-adoption-tooltip__footer">
      <span>${input.index + 1} / ${input.total}</span>
      <div>
        <button type="button" data-action="back">Back</button>
        <button type="button" data-action="skip">Skip</button>
        <button type="button" data-action="next">${input.index + 1 === input.total ? "Done" : "Next"}</button>
      </div>
    </div>
  `;
  tooltip.querySelector(".scout-adoption-tooltip__title")!.textContent = input.title;
  tooltip.querySelector(".scout-adoption-tooltip__message")!.textContent = input.message;
  tooltip.querySelector('[data-action="back"]')?.addEventListener("click", input.controls.onBack);
  tooltip.querySelector('[data-action="next"]')?.addEventListener("click", input.controls.onNext);
  tooltip.querySelector('[data-action="skip"]')?.addEventListener("click", input.controls.onSkip);
  document.body.appendChild(tooltip);
  positionTooltip(tooltip, input.target);

  return tooltip;
}

export function injectTooltipStyles() {
  if (document.getElementById("scout-adoption-player-style")) return;
  const style = document.createElement("style");
  style.id = "scout-adoption-player-style";
  style.textContent = `
    .scout-adoption-highlight { outline: 3px solid #0ea5e9 !important; outline-offset: 4px !important; border-radius: 6px !important; }
    .scout-adoption-tooltip { position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 32px)); border: 1px solid #dbeafe; border-radius: 8px; background: #fff; box-shadow: 0 20px 60px rgb(15 23 42 / 0.24); padding: 14px; color: #0f172a; font: 14px/1.45 system-ui, sans-serif; }
    .scout-adoption-tooltip__title { font-weight: 700; margin-bottom: 6px; }
    .scout-adoption-tooltip__message { color: #475569; }
    .scout-adoption-tooltip__footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 14px; color: #64748b; font-size: 12px; }
    .scout-adoption-tooltip button { margin-left: 6px; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; padding: 6px 9px; color: #0f172a; cursor: pointer; }
    .scout-adoption-tooltip button[data-action="next"] { border-color: #020617; background: #020617; color: #fff; }
    .scout-adoption-missing { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; border-radius: 8px; background: #020617; color: #fff; padding: 12px 14px; font: 14px system-ui, sans-serif; }
  `;
  document.head.appendChild(style);
}

export function positionTooltip(tooltip: HTMLElement, target: HTMLElement) {
  const rect = target.getBoundingClientRect();
  const top = Math.min(window.innerHeight - tooltip.offsetHeight - 16, Math.max(16, rect.bottom + 12));
  const left = Math.min(window.innerWidth - tooltip.offsetWidth - 16, Math.max(16, rect.left));

  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;
}
