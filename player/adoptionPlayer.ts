import type { GoalContext, Guide, GuideStep } from "@/shared/guideTypes";
import { findTargetElement, findVisibleControlByText, isVisible } from "./elementFinder";
import { createTooltip, injectTooltipStyles } from "./tooltip";

const GOAL_TIMEOUT_MS = 45000;
const AUTO_CLICK_PREVIEW_MS = 350;
type PlayerPhase = "pre" | "entry" | "main";

function focusTarget(element: HTMLElement) {
  if (!element.matches("input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1']), [role='button'], [role='link'], [role='combobox'], [role='textbox']")) return;
  window.setTimeout(() => {
    try {
      element.focus({ preventScroll: true });
    } catch {
      element.focus();
    }
  }, 120);
}

function isScoutPlayerEvent(event: Event) {
  if (event.target instanceof Element && event.target.closest(".scout-adoption-tooltip, .scout-adoption-overlay, .scout-adoption-missing, .scout-adoption-recovery")) return true;
  if ("clientX" in event && "clientY" in event) {
    const pointer = event as MouseEvent;
    return Array.from(document.querySelectorAll(".scout-adoption-tooltip")).some((tooltip) => {
      const rect = tooltip.getBoundingClientRect();
      return pointer.clientX >= rect.left && pointer.clientX <= rect.right && pointer.clientY >= rect.top && pointer.clientY <= rect.bottom;
    });
  }
  return false;
}

export class AdoptionPlayer {
  private guide: Guide;
  private guideResolver?: (guideId: string) => Guide | null | undefined;
  private index = 0;
  private steps: GuideStep[] = [];
  private tooltip: HTMLElement | null = null;
  private highlighted: HTMLElement | null = null;
  private stopped = false;
  private preWorkflowConfirmationShown = false;

  constructor(guide: Guide, options: { guideResolver?: (guideId: string) => Guide | null | undefined } = {}) {
    this.guide = guide;
    this.guideResolver = options.guideResolver;
  }

  async start(options: { resetProgress?: boolean } = {}) {
    injectTooltipStyles();
    this.stopped = false;
    if (options.resetProgress !== false) {
      this.resetProgress();
      this.preWorkflowConfirmationShown = false;
    }

    if (!this.preWorkflowConfirmationShown && this.guide.preWorkflowConfirmationEnabled && this.guide.preWorkflowConfirmationHtml?.trim()) {
      this.preWorkflowConfirmationShown = true;
      this.runSteps([preWorkflowConfirmationStep(this.guide)], "pre", () => this.start({ resetProgress: false }));
      return;
    }

    const mainSteps = stepsForGuide(this.guide, true);
    const entrySteps = stepsForGuide(this.guide, false);
    const goalContext = resolveGoalContext(this.guide, mainSteps);
    const isOnGoalContext = goalContext ? detectContext(goalContext) : mainSteps.some((step) => Boolean(findTargetElement(step.target)));

    if (isOnGoalContext) {
      this.runSteps(mainSteps, "main");
      return;
    }

    if (entrySteps.length === 0) {
      await this.waitForGoalOrRecover(goalContext);
      this.runSteps(mainSteps, "main");
      return;
    }

    this.runSteps(entrySteps, "entry", async () => {
      await this.waitForGoalOrRecover(goalContext);
      this.runSteps(mainSteps, "main");
    });
  }

  stop() {
    this.stopped = true;
    this.preWorkflowConfirmationShown = false;
    this.clear();
    this.resetProgress();
  }

  private storageKey(phase = "main") {
    return `scout-adoption-progress:${this.guide.id}:${phase}`;
  }

  private resetProgress() {
    localStorage.removeItem(this.storageKey("pre"));
    localStorage.removeItem(this.storageKey("entry"));
    localStorage.removeItem(this.storageKey("main"));
  }

  private currentStep(): GuideStep | null {
    return this.steps[this.index] ?? null;
  }

  private clear() {
    (this.tooltip as (HTMLElement & { __scoutCleanup?: () => void }) | null)?.__scoutCleanup?.();
    this.tooltip?.remove();
    this.highlighted?.classList.remove("scout-adoption-highlight");
    document.querySelector(".scout-adoption-missing")?.remove();
    document.querySelector(".scout-adoption-recovery")?.remove();
    this.tooltip = null;
    this.highlighted = null;
  }

  private runSteps(steps: GuideStep[], phase: PlayerPhase, onComplete?: () => void | Promise<void>) {
    this.steps = steps;
    this.index = Number(localStorage.getItem(this.storageKey(phase)) ?? 0);
    this.render(phase, onComplete);
  }

  private async render(phase: PlayerPhase, onComplete?: () => void | Promise<void>) {
    this.clear();
    const step = this.currentStep();

    if (!step) {
      localStorage.removeItem(this.storageKey(phase));
      await onComplete?.();
      return;
    }

    if (this.stopped) return;

    if (step.type === "manualInstruction" && !hasTargetIdentity(step)) {
      this.showManualInstruction(step, phase, onComplete);
      return;
    }

    const target = findTargetElement(step.target);

    if (!target) {
      this.showMissing(step, phase, onComplete);
      return;
    }

    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    target.classList.add("scout-adoption-highlight");
    focusTarget(target);
    this.highlighted = target;
    this.tooltip = createTooltip({
      title: step.title,
      message: step.message,
      index: this.index,
        total: this.steps.length,
      target,
      controls: {
        onBack: () => this.previous(phase, onComplete),
        onNext: () => this.next(phase, onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      }
    });

    if (step.type === "click" || step.trigger === "click") {
      if (step.autoClick === true && isSafeAutoClickTarget(target)) {
        await delay(AUTO_CLICK_PREVIEW_MS);
        if (this.stopped) return;
        target.click();
        if (!this.stopped) this.next(phase, onComplete);
        return;
      }

      const advanceOnClick = (event: MouseEvent) => {
        if (isScoutPlayerEvent(event)) return;
        target.removeEventListener("click", advanceOnClick);
        this.next(phase, onComplete);
      };
      target.addEventListener("click", advanceOnClick);
    }

    if (step.type === "input" || step.trigger === "input" || step.trigger === "change" || step.trigger === "blur" || step.trigger === "focus") {
      const eventName = step.trigger === "change" || step.trigger === "blur" || step.trigger === "focus" ? step.trigger : "input";
      target.addEventListener(eventName, () => this.next(phase, onComplete), { once: true });
    }
  }

  private showManualInstruction(step: GuideStep, phase: PlayerPhase = "main", onComplete?: () => void | Promise<void>) {
    const anchor = document.body;
    this.tooltip = createTooltip({
      title: step.title,
      message: step.message,
      index: this.index,
      total: this.steps.length,
      target: anchor,
      hideStepCount: phase === "pre",
      primaryLabel: phase === "pre" ? "Start" : undefined,
      controls: {
        onBack: () => this.previous(phase, onComplete),
        onNext: () => this.next(phase, onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      }
    });
  }

  private showMissing(step: GuideStep, phase: PlayerPhase, onComplete?: () => void | Promise<void>) {
    const banner = document.createElement("div");
    banner.className = "scout-adoption-missing";
    banner.innerHTML = `Element not found on this page <button type="button" data-action="retry">Retry</button> <button type="button" data-action="skip">Skip</button> <button type="button" data-action="stop">Stop</button> <button type="button" data-action="recover">Try Smart Recovery</button>`;
    banner.querySelector('[data-action="retry"]')?.addEventListener("click", () => this.render(phase, onComplete));
    banner.querySelector('[data-action="skip"]')?.addEventListener("click", () => this.next(phase, onComplete));
    banner.querySelector('[data-action="stop"]')?.addEventListener("click", () => this.stop());
    banner.querySelector('[data-action="recover"]')?.addEventListener("click", () => this.trySmartRecovery(step));
    document.body.appendChild(banner);
  }

  private previous(phase: PlayerPhase, onComplete?: () => void | Promise<void>) {
    this.index = Math.max(0, this.index - 1);
    localStorage.setItem(this.storageKey(phase), String(this.index));
    this.render(phase, onComplete);
  }

  private next(phase: PlayerPhase, onComplete?: () => void | Promise<void>) {
    this.index += 1;
    localStorage.setItem(this.storageKey(phase), String(this.index));
    this.render(phase, onComplete);
  }

  private async waitForGoalOrRecover(goalContext?: GoalContext | null) {
    if (!goalContext) return;

    const reachedGoal = await waitForCondition(() => detectContext(goalContext), GOAL_TIMEOUT_MS);

    if (!reachedGoal) {
      this.trySmartRecovery(contextToStep(goalContext, this.guide.title));
    }
  }

  private trySmartRecovery(step: GuideStep) {
    document.querySelector(".scout-adoption-recovery")?.remove();
    const targetText = [step.title, step.message, step.target?.fallbackText, this.guide.title].filter(Boolean) as string[];
    const suggestion = findVisibleControlByText(targetText.flatMap((text) => text.split(/\s+/).filter((word) => word.length > 3)));

    if (!suggestion) {
      this.showRecoveryMessage("I could not find a safe matching control. Please navigate closer to the target page, then retry.");
      return;
    }

    suggestion.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    suggestion.classList.add("scout-adoption-highlight");
    this.highlighted = suggestion;
    this.showRecoveryMessage(`I found ${suggestion.innerText || suggestion.getAttribute("aria-label") || "a matching control"}. Click it to continue.`);
  }

  private showRecoveryMessage(message: string) {
    const banner = document.createElement("div");
    banner.className = "scout-adoption-recovery scout-adoption-missing";
    banner.textContent = message;
    document.body.appendChild(banner);
  }

  private openGuideLink(guideId: string) {
    const linkedGuide = this.guideResolver?.(guideId);
    if (!linkedGuide) return;
    this.stop();
    new AdoptionPlayer(linkedGuide, { guideResolver: this.guideResolver }).start();
  }
}

export function detectContext(goalContext?: GoalContext | null) {
  if (!goalContext) return true;
  const urlMatches = !goalContext.url || normalizeUrl(window.location.href).includes(normalizeUrl(goalContext.url));
  const requiredTarget = goalContext.requiredElement ?? goalContext.target;

  if (!urlMatches) return false;
  if (!requiredTarget) return true;

  const element = findTargetElement(requiredTarget);
  return Boolean(element && isVisible(element));
}

export function playGuide(guide: Guide) {
  const player = new AdoptionPlayer(guide);
  player.start();
  return player;
}

function stepsForGuide(guide: Guide, main: boolean) {
  const source = main && Array.isArray(guide.mainSteps)
    ? guide.mainSteps
    : !main && Array.isArray(guide.entrySteps)
    ? guide.entrySteps
    : (guide.steps ?? []).filter((step) => main ? step.stepPurpose !== "navigation" : step.stepPurpose === "navigation");

  return source.map((step) => {
    const stepPurpose = step.stepPurpose ?? "main";
    const navigationMode = stepPurpose === "navigation" ? step.navigationMode ?? "waitForUser" : undefined;

    return {
      ...step,
      type: step.type === "manualInstruction" && hasTargetIdentity(step)
        ? "highlight"
        : step.type ?? (stepPurpose === "navigation" || step.trigger === "click" ? "click" : step.trigger === "input" || step.trigger === "change" || step.trigger === "blur" || step.trigger === "focus" ? "input" : "highlight"),
      navigationMode,
      autoClick: step.autoClick ?? navigationMode === "autoClick",
      trigger: stepPurpose === "navigation" ? "click" : step.trigger
    };
  });
}

function preWorkflowConfirmationStep(guide: Guide): GuideStep {
  return {
    id: `${guide.id}-pre-workflow-confirmation`,
    order: 0,
    type: "manualInstruction",
    urlMatch: guide.startContext?.url ?? "",
    target: emptyTarget(),
    title: "Before you begin",
    message: guide.preWorkflowConfirmationHtml ?? "",
    trigger: "manualNext",
    actionSourceId: `${guide.id}:pre-workflow-confirmation`
  };
}

function hasTargetIdentity(step: GuideStep) {
  const target = step.target;
  if (!target) return false;
  return Boolean(
    target.selectorCandidates?.length
      || target.labelText
      || target.accessibleName
      || target.ariaLabel
      || target.placeholder
      || target.text
      || target.cssFallback
      || target.xpathFallback
  );
}

function emptyTarget() {
  return {
    selectorCandidates: []
  };
}

function resolveGoalContext(guide: Guide, mainSteps: GuideStep[]): GoalContext | undefined {
  if (guide.goalContext) return guide.goalContext;
  const firstMainStep = mainSteps[0];

  if (!firstMainStep) return undefined;

  return {
    url: firstMainStep.urlMatch,
    target: firstMainStep.target,
    requiredElement: firstMainStep.target
  };
}

function waitForCondition(predicate: () => boolean, timeoutMs: number) {
  patchHistoryEvents();

  return new Promise<boolean>((resolve) => {
    if (predicate()) {
      resolve(true);
      return;
    }

    const startedAt = Date.now();
    let observer: MutationObserver | null = null;
    let timer = 0;

    const check = () => {
      if (predicate()) {
        cleanup();
        resolve(true);
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        cleanup();
        resolve(false);
      }
    };

    const cleanup = () => {
      observer?.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("scout:locationchange", check);
      window.removeEventListener("popstate", check);
      window.removeEventListener("hashchange", check);
    };

    observer = new MutationObserver(check);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    timer = window.setInterval(check, 250);
    window.addEventListener("scout:locationchange", check);
    window.addEventListener("popstate", check);
    window.addEventListener("hashchange", check);
  });
}

function patchHistoryEvents() {
  const historyWithFlag = window.history as History & { __scoutPatched?: boolean };
  if (historyWithFlag.__scoutPatched) return;

  historyWithFlag.__scoutPatched = true;
  const notify = () => window.dispatchEvent(new Event("scout:locationchange"));
  const pushState = window.history.pushState;
  const replaceState = window.history.replaceState;

  window.history.pushState = function patchedPushState(...args) {
    const result = pushState.apply(this, args);
    notify();
    return result;
  };
  window.history.replaceState = function patchedReplaceState(...args) {
    const result = replaceState.apply(this, args);
    notify();
    return result;
  };
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

function contextToStep(goalContext: GoalContext, title: string): GuideStep {
  return {
    id: "goal-context",
    order: 0,
    type: "manualInstruction",
    urlMatch: goalContext.url,
    target: goalContext.requiredElement ?? goalContext.target ?? { selectorCandidates: [] },
    title,
    message: "Navigate to the target page to continue.",
    trigger: "manualNext",
    actionSourceId: "goal-context"
  };
}

function isSafeAutoClickTarget(target: HTMLElement) {
  const text = [target.innerText, target.getAttribute("aria-label"), target.getAttribute("title")].filter(Boolean).join(" ").toLowerCase();
  return !/\b(delete|remove|submit|save|publish|confirm|approve|pay|send)\b/.test(text);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
