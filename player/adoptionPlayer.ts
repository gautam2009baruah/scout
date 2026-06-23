import type { Guide, GuideStep } from "@/shared/guideTypes";
import { findTargetElement } from "./elementFinder";
import { createTooltip, injectTooltipStyles } from "./tooltip";

export class AdoptionPlayer {
  private guide: Guide;
  private index = 0;
  private tooltip: HTMLElement | null = null;
  private highlighted: HTMLElement | null = null;

  constructor(guide: Guide) {
    this.guide = guide;
  }

  start() {
    injectTooltipStyles();
    this.index = Number(localStorage.getItem(this.storageKey()) ?? 0);
    this.render();
  }

  stop() {
    this.clear();
    localStorage.removeItem(this.storageKey());
  }

  private storageKey() {
    return `scout-adoption-progress:${this.guide.id}`;
  }

  private currentStep(): GuideStep | null {
    return this.guide.steps[this.index] ?? null;
  }

  private clear() {
    this.tooltip?.remove();
    this.highlighted?.classList.remove("scout-adoption-highlight");
    document.querySelector(".scout-adoption-missing")?.remove();
    this.tooltip = null;
    this.highlighted = null;
  }

  private render() {
    this.clear();
    const step = this.currentStep();

    if (!step) {
      this.stop();
      return;
    }

    const target = findTargetElement(step.target);

    if (!target) {
      this.showMissing();
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    target.classList.add("scout-adoption-highlight");
    this.highlighted = target;
    this.tooltip = createTooltip({
      title: step.title,
      message: step.message,
      index: this.index,
      total: this.guide.steps.length,
      target,
      controls: {
        onBack: () => this.previous(),
        onNext: () => this.next(),
        onSkip: () => this.next()
      }
    });

    if (step.trigger === "click") {
      target.addEventListener("click", () => this.next(), { once: true });
    }

    if (step.trigger === "input") {
      target.addEventListener("input", () => this.next(), { once: true });
    }
  }

  private showMissing() {
    const banner = document.createElement("div");
    banner.className = "scout-adoption-missing";
    banner.innerHTML = `Element not found on this page <button type="button" data-action="retry">Retry</button> <button type="button" data-action="skip">Skip</button>`;
    banner.querySelector('[data-action="retry"]')?.addEventListener("click", () => this.render());
    banner.querySelector('[data-action="skip"]')?.addEventListener("click", () => this.next());
    document.body.appendChild(banner);
  }

  private previous() {
    this.index = Math.max(0, this.index - 1);
    localStorage.setItem(this.storageKey(), String(this.index));
    this.render();
  }

  private next() {
    this.index += 1;
    localStorage.setItem(this.storageKey(), String(this.index));
    this.render();
  }
}

export function playGuide(guide: Guide) {
  const player = new AdoptionPlayer(guide);
  player.start();
  return player;
}
