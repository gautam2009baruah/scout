import type { Guide, GuideStep, RecordedAction } from "@/shared/guideTypes";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function compactText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function bestElementName(action: RecordedAction) {
  return compactText(action.labelText)
    || compactText(action.ariaLabel)
    || compactText(action.elementText)
    || compactText(action.nearbyText)
    || compactText(action.tagName?.toLowerCase())
    || "this element";
}

function titleForAction(action: RecordedAction) {
  const name = bestElementName(action);

  if (action.type === "input") {
    return `Enter ${name}`;
  }

  if (action.type === "submit") {
    return "Submit the form";
  }

  if (action.type === "navigation") {
    return "Navigate to the next page";
  }

  return `Click ${name}`;
}

function messageForAction(action: RecordedAction) {
  const name = bestElementName(action);

  if (action.type === "input") {
    return `Enter the required value in ${name}.`;
  }

  if (action.type === "submit") {
    return "Submit the form to continue.";
  }

  if (action.type === "navigation") {
    return "Continue once this page is loaded.";
  }

  return `Click ${name} to continue.`;
}

function triggerForAction(action: RecordedAction): GuideStep["trigger"] {
  if (action.type === "input") return "input";
  if (action.type === "click" || action.type === "submit") return "click";
  return "manualNext";
}

function isDuplicate(previous: RecordedAction | undefined, action: RecordedAction) {
  if (!previous) return false;
  const previousSelector = previous.selectorCandidates[0]?.value ?? "";
  const selector = action.selectorCandidates[0]?.value ?? "";

  return previous.type === action.type
    && previous.url === action.url
    && previousSelector === selector
    && Math.abs(action.timestamp - previous.timestamp) < 600;
}

export function generateGuideFromRecording(actions: RecordedAction[], input?: { title?: string; description?: string }): Guide {
  const now = new Date().toISOString();
  const cleanedActions = actions.filter((action, index) => !isDuplicate(actions[index - 1], action));
  const steps = cleanedActions
    .filter((action) => action.type !== "navigation" || action.selectorCandidates.length > 0)
    .map((action, index): GuideStep => ({
      id: createId("step"),
      order: index + 1,
      urlMatch: action.url,
      target: {
        selectorCandidates: action.selectorCandidates,
        fallbackText: bestElementName(action),
        role: action.role,
        tagName: action.tagName
      },
      title: titleForAction(action),
      message: messageForAction(action),
      trigger: triggerForAction(action),
      actionSourceId: action.id
    }));

  return {
    id: createId("guide"),
    title: input?.title?.trim() || "New guided workflow",
    description: input?.description?.trim() || "",
    status: "draft",
    createdAt: now,
    updatedAt: now,
    steps
  };
}
