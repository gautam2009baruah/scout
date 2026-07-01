import type { ElementIdentity } from "@/shared/guideTypes";

/**
 * Build a complete ElementIdentity object from an HTML element
 * Used to capture metadata from found controls during smart recovery
 */
export function buildElementIdentity(element: HTMLElement): ElementIdentity {
  const tagName = element.tagName.toLowerCase();
  const role = element.getAttribute("role") || undefined;
  const ariaLabel = element.getAttribute("aria-label") || undefined;
  const text = element.innerText?.trim() || element.textContent?.trim() || undefined;
  
  // Get accessible name
  let accessibleName: string | undefined;
  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelElement = document.getElementById(ariaLabelledBy);
    accessibleName = labelElement?.textContent?.trim() || undefined;
  } else if (ariaLabel) {
    accessibleName = ariaLabel;
  } else if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    accessibleName = label?.textContent?.trim() || undefined;
  } else {
    const parentLabel = element.closest("label");
    accessibleName = parentLabel?.textContent?.trim() || undefined;
  }

  // Get label text (for form inputs)
  let labelText: string | undefined;
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    labelText = label?.textContent?.trim() || undefined;
  } else {
    const parentLabel = element.closest("label");
    labelText = parentLabel?.textContent?.trim() || undefined;
  }

  // Get placeholder (for inputs)
  let placeholder: string | undefined;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    placeholder = element.placeholder || undefined;
  }

  // Get input type
  let inputType: string | undefined;
  if (element instanceof HTMLInputElement) {
    inputType = element.type;
  }

  // Get selected option text (for selects)
  let selectedOptionText: string | undefined;
  if (element instanceof HTMLSelectElement && element.selectedOptions.length > 0) {
    selectedOptionText = element.selectedOptions[0].textContent?.trim() || undefined;
  }

  // Get name and id
  const name = element.getAttribute("name") || undefined;
  const id = element.id || undefined;

  // Get data attributes
  const dataAttributes: Record<string, string> = {};
  Array.from(element.attributes).forEach((attr) => {
    if (attr.name.startsWith("data-")) {
      dataAttributes[attr.name] = attr.value;
    }
  });

  // Get nearby heading
  let nearbyHeading: string | undefined;
  let current: Element | null = element;
  while (current && current !== document.body) {
    const heading = current.querySelector("h1, h2, h3, h4, h5, h6");
    if (heading?.textContent) {
      nearbyHeading = heading.textContent.trim();
      break;
    }
    current = current.parentElement;
  }

  // Get parent container text
  let parentContainerText: string | undefined;
  if (element.parentElement) {
    parentContainerText = element.parentElement.innerText?.slice(0, 100).trim() || undefined;
  }

  // Get sibling text
  let previousSiblingText: string | undefined;
  let nextSiblingText: string | undefined;
  if (element.previousElementSibling) {
    previousSiblingText = element.previousElementSibling.textContent?.slice(0, 50).trim() || undefined;
  }
  if (element.nextElementSibling) {
    nextSiblingText = element.nextElementSibling.textContent?.slice(0, 50).trim() || undefined;
  }

  // Get parent info
  const parent = element.parentElement;
  const parentTagName = parent?.tagName.toLowerCase();
  const parentRole = parent?.getAttribute("role") || undefined;
  const parentAccessibleName = parent?.getAttribute("aria-label") || undefined;
  const parentText = parent?.innerText?.slice(0, 100).trim() || undefined;

  // Get form title
  let formTitle: string | undefined;
  const form = element.closest("form");
  if (form) {
    const legend = form.querySelector("legend");
    if (legend) {
      formTitle = legend.textContent?.trim() || undefined;
    } else {
      const heading = form.querySelector("h1, h2, h3, h4, h5, h6");
      formTitle = heading?.textContent?.trim() || undefined;
    }
  }

  // Get dialog title
  let dialogTitle: string | undefined;
  const dialog = element.closest('[role="dialog"], [role="alertdialog"], dialog');
  if (dialog) {
    const title = dialog.querySelector('[role="heading"], h1, h2, h3, .modal-title, .dialog-title');
    dialogTitle = title?.textContent?.trim() || undefined;
  }

  // Get card title
  let cardTitle: string | undefined;
  const card = element.closest('[class*="card"], [role="article"]');
  if (card) {
    const title = card.querySelector('[class*="card-title"], [class*="card-header"], h1, h2, h3, h4');
    cardTitle = title?.textContent?.trim() || undefined;
  }

  // Get bounding box
  const rect = element.getBoundingClientRect();
  const boundingBox = {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };

  // Build selector candidates (will be added separately)
  const selectorCandidates = buildSelectorsFromElement(element);

  return {
    tagName,
    role,
    accessibleName,
    text,
    ariaLabel,
    labelText,
    placeholder,
    inputType,
    selectedOptionText,
    name,
    id,
    dataAttributes,
    nearbyHeading,
    parentContainerText,
    previousSiblingText,
    nextSiblingText,
    parentTagName,
    parentRole,
    parentAccessibleName,
    parentText,
    formTitle,
    dialogTitle,
    cardTitle,
    url: window.location.href,
    path: window.location.pathname,
    selectorCandidates,
    confidenceScore: 75, // Smart recovery default confidence
    needsUserConfirmation: false,
    boundingBox,
  };
}

/**
 * Build selector candidates from an element
 */
export function buildSelectorsFromElement(element: HTMLElement) {
  const candidates: Array<{ type: string; value: string; confidence: number; reason: string }> = [];

  // Data attributes (highest priority)
  const dataAttrs = [
    "data-adoption-id",
    "data-testid",
    "data-test",
    "data-cy",
  ];
  for (const attr of dataAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      candidates.push({
        type: attr,
        value,
        confidence: 95,
        reason: `Has ${attr} attribute`,
      });
    }
  }

  // ID
  if (element.id) {
    candidates.push({
      type: "id",
      value: element.id,
      confidence: 90,
      reason: "Has unique ID",
    });
  }

  // Name attribute
  const name = element.getAttribute("name");
  if (name) {
    candidates.push({
      type: "name",
      value: name,
      confidence: 85,
      reason: "Has name attribute",
    });
  }

  // Aria label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    candidates.push({
      type: "aria-label",
      value: ariaLabel,
      confidence: 80,
      reason: "Has aria-label",
    });
  }

  // Role + text
  const role = element.getAttribute("role");
  const text = element.innerText?.trim() || element.textContent?.trim();
  if (role && text) {
    candidates.push({
      type: "role-text",
      value: `${role}::${text}`,
      confidence: 75,
      reason: "Has role and text content",
    });
  }

  // Label text
  let labelText: string | undefined;
  if (element.id) {
    const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
    labelText = label?.textContent?.trim() || undefined;
  } else {
    const parentLabel = element.closest("label");
    labelText = parentLabel?.textContent?.trim() || undefined;
  }
  if (labelText) {
    candidates.push({
      type: "label-text",
      value: labelText,
      confidence: 75,
      reason: "Has associated label",
    });
  }

  // Placeholder
  if (element instanceof HTMLInputElement && element.placeholder) {
    candidates.push({
      type: "placeholder",
      value: element.placeholder,
      confidence: 70,
      reason: "Has placeholder text",
    });
  }

  // Text context
  if (text && text.length < 100) {
    candidates.push({
      type: "text-context",
      value: text,
      confidence: 65,
      reason: "Has text content",
    });
  }

  // CSS fallback
  const cssSelector = buildCssSelector(element);
  if (cssSelector) {
    candidates.push({
      type: "css",
      value: cssSelector,
      confidence: 50,
      reason: "CSS selector path",
    });
  }

  return candidates;
}

function buildCssSelector(element: HTMLElement): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();

    if (current.id) {
      selector += `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }

    const siblings = current.parentElement ? Array.from(current.parentElement.children) : [];
    const sameTagSiblings = siblings.filter((s) => s.tagName === current?.tagName);

    if (sameTagSiblings.length > 1) {
      const index = sameTagSiblings.indexOf(current) + 1;
      selector += `:nth-of-type(${index})`;
    }

    path.unshift(selector);
    current = current.parentElement;

    if (path.length > 5) break;
  }

  return path.join(" > ");
}
