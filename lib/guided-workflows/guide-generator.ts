import type { Guide, GuideStep, GuideStepTrigger, RecordedAction } from "@/shared/guideTypes";

function createId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function compactText(value?: string) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function plainTextFromHtml(value?: string) {
  return compactText(value?.replace(/<[^>]+>/g, " "));
}

function trainerDescription(action: RecordedAction) {
  return compactText(action.stepDescription);
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
  const description = trainerDescription(action);
  if (description) return plainTextFromHtml(description) || "Guide step";

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
  const description = trainerDescription(action);
  if (description) return description;

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

function isGuideStepTrigger(value: unknown): value is GuideStepTrigger {
  return value === "click"
    || value === "change"
    || value === "blur"
    || value === "focus"
    || value === "input"
    || value === "manualNext";
}

function defaultTriggerForActionTarget(action: RecordedAction): GuideStep["trigger"] {
  const tagName = (action.elementIdentity?.tagName ?? action.tagName ?? "").toLowerCase();
  const role = (action.elementIdentity?.role ?? action.role ?? "").toLowerCase();
  const inputType = (action.elementIdentity?.inputType ?? action.inputType ?? "text").toLowerCase();

  if (tagName === "textarea") return "blur";
  if (tagName === "select") return "change";

  if (tagName === "input") {
    if (["button", "submit", "reset", "image"].includes(inputType)) return "click";
    if (["checkbox", "radio", "file", "range", "color", "date", "datetime-local", "month", "time", "week"].includes(inputType)) return "change";
    return "blur";
  }

  if (["checkbox", "radio", "switch", "combobox", "listbox", "option", "slider"].includes(role)) return "change";
  if (["button", "link", "menuitem", "tab"].includes(role)) return "click";

  return "click";
}

function triggerForAction(action: RecordedAction): GuideStep["trigger"] {
  if (isGuideStepTrigger(action.trigger)) return action.trigger;
  if (action.type === "input") return "blur";
  if (action.type === "change") return "change";
  if (action.type === "click" || action.type === "submit" || action.type === "manual-select") return defaultTriggerForActionTarget(action);
  return "manualNext";
}

function isDuplicate(previous: RecordedAction | undefined, action: RecordedAction) {
  if (!previous) return false;
  const previousSelector = previous.selectorCandidates?.[0]?.value ?? "";
  const selector = action.selectorCandidates?.[0]?.value ?? "";

  return previous.type === action.type
    && previous.url === action.url
    && previousSelector === selector
    && Math.abs(action.timestamp - previous.timestamp) < 600;
}

function relativeUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}${url.hash}` || "/";
  } catch {
    return value || "/";
  }
}

export function generateGuideFromRecording(actions: RecordedAction[], input?: { title?: string; description?: string }): Guide {
  const now = new Date().toISOString();
  const cleanedActions = actions.filter((action, index) => !isDuplicate(actions[index - 1], action));
  const steps = cleanedActions
    .filter((action) => action.type !== "navigation" || (action.selectorCandidates?.length ?? 0) > 0)
    .map((action, index): GuideStep => ({
      id: createId("step"),
      order: index + 1,
      urlMatch: relativeUrl(action.url),
      target: {
        selectorCandidates: action.selectorCandidates ?? [],
        fallbackText: bestElementName(action),
        role: action.elementIdentity?.role ?? action.role,
        tagName: action.elementIdentity?.tagName ?? action.tagName,
        accessibleName: action.elementIdentity?.accessibleName,
        text: action.elementIdentity?.text ?? action.elementText,
        ariaLabel: action.elementIdentity?.ariaLabel ?? action.ariaLabel,
        labelText: action.elementIdentity?.labelText ?? action.labelText,
        placeholder: action.elementIdentity?.placeholder,
        inputType: action.elementIdentity?.inputType ?? action.inputType,
        selectedOptionText: action.elementIdentity?.selectedOptionText ?? action.selectedOptionText,
        name: action.elementIdentity?.name,
        id: action.elementIdentity?.id,
        dataAttributes: action.elementIdentity?.dataAttributes,
        nearbyHeading: action.elementIdentity?.nearbyHeading,
        parentContainerText: action.elementIdentity?.parentContainerText,
        previousSiblingText: action.elementIdentity?.previousSiblingText,
        nextSiblingText: action.elementIdentity?.nextSiblingText,
        parentTagName: action.elementIdentity?.parentTagName,
        parentRole: action.elementIdentity?.parentRole,
        parentAccessibleName: action.elementIdentity?.parentAccessibleName,
        parentText: action.elementIdentity?.parentText,
        formTitle: action.elementIdentity?.formTitle,
        dialogTitle: action.elementIdentity?.dialogTitle,
        cardTitle: action.elementIdentity?.cardTitle,
        cssFallback: action.elementIdentity?.cssFallback,
        xpathFallback: action.elementIdentity?.xpathFallback,
        boundingBox: action.elementIdentity?.boundingBox
      },
      title: titleForAction(action),
      message: messageForAction(action),
      stepPurpose: action.stepPurpose ?? "main",
      navigationMode: action.stepPurpose === "navigation" ? action.navigationMode ?? "waitForUser" : undefined,
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
