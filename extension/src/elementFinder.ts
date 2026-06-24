import type { ElementIdentity, SelectorCandidate } from "./types";

/**
 * Get visible text from an element
 */
function getVisibleText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Get label text associated with an element
 */
function getAssociatedLabelText(element: HTMLElement): string | undefined {
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(element.id)}"]`
    );
    if (label) return label.innerText.trim();
  }

  const wrappingLabel = element.closest("label");
  if (wrappingLabel) {
    return wrappingLabel.textContent?.replace(/\s+/g, " ").trim();
  }

  return undefined;
}

/**
 * Calculate similarity between two bounding boxes (0-1 score)
 */
function calculateBoundingBoxSimilarity(
  box1: ElementIdentity["boundingBox"],
  box2: ElementIdentity["boundingBox"]
): number {
  if (!box1 || !box2) return 0;

  const xOverlap = Math.max(
    0,
    Math.min(box1.x + box1.width, box2.x + box2.width) -
      Math.max(box1.x, box2.x)
  );
  const yOverlap = Math.max(
    0,
    Math.min(box1.y + box1.height, box2.y + box2.height) -
      Math.max(box1.y, box2.y)
  );
  const overlapArea = xOverlap * yOverlap;
  const box1Area = box1.width * box1.height;
  const box2Area = box2.width * box2.height;
  const unionArea = box1Area + box2Area - overlapArea;

  return unionArea > 0 ? overlapArea / unionArea : 0;
}

/**
 * Get bounding box for an element
 */
function getBoundingBox(element: Element): ElementIdentity["boundingBox"] {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x + window.scrollX,
    y: rect.y + window.scrollY,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Try to find element using a single selector candidate
 */
function tryFindByCandidate(
  candidate: SelectorCandidate,
  identity: ElementIdentity
): Element | null {
  try {
    let elements: Element[] = [];

    switch (candidate.type) {
      case "data-adoption-id":
      case "data-testid":
      case "data-test":
      case "data-cy":
      case "id":
      case "name":
      case "aria-label":
      case "placeholder":
      case "css":
        // Direct CSS selectors
        elements = Array.from(document.querySelectorAll(candidate.value));
        break;

      case "role-text": {
        // Format: "role::text"
        const [role, expectedText] = candidate.value.split("::");
        const roleElements = document.querySelectorAll(`[role="${role}"]`);
        elements = Array.from(roleElements).filter(
          (el) =>
            getVisibleText(el).toLowerCase() ===
            expectedText?.toLowerCase()
        );
        break;
      }

      case "label-text": {
        // Find inputs by their associated label text
        const labels = Array.from(document.querySelectorAll("label"));
        for (const label of labels) {
          const labelTextContent = label.textContent
            ?.replace(/\s+/g, " ")
            .trim();
          if (
            labelTextContent?.toLowerCase() ===
            candidate.value.toLowerCase()
          ) {
            // Check for label[for] association
            const forAttr = label.getAttribute("for");
            if (forAttr) {
              const target = document.getElementById(forAttr);
              if (target) elements.push(target);
            }
            // Check for wrapping label
            const input = label.querySelector("input, select, textarea");
            if (input) elements.push(input);
          }
        }
        break;
      }

      case "text-context": {
        // Find by visible text content
        const allElements = document.querySelectorAll("button, a, span, div");
        elements = Array.from(allElements).filter(
          (el) =>
            getVisibleText(el).toLowerCase() ===
            candidate.value.toLowerCase()
        );
        break;
      }

      case "xpath": {
        // XPath evaluation
        const result = document.evaluate(
          candidate.value,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        if (result.singleNodeValue instanceof Element) {
          elements = [result.singleNodeValue];
        }
        break;
      }
    }

    // If exactly one match, return it
    if (elements.length === 1) {
      return elements[0];
    }

    // If multiple matches, disambiguate
    if (elements.length > 1) {
      return disambiguateElements(elements, identity);
    }

    return null;
  } catch (error) {
    // Invalid selector or XPath - continue to next candidate
    console.warn(
      `Failed to query selector candidate: ${candidate.type}`,
      error
    );
    return null;
  }
}

/**
 * Disambiguate between multiple matching elements using additional context
 */
function disambiguateElements(
  elements: Element[],
  identity: ElementIdentity
): Element | null {
  let bestMatch: Element | null = null;
  let bestScore = 0;

  for (const element of elements) {
    let score = 0;

    // Check tag name match
    if (element.tagName.toLowerCase() === identity.tagName) {
      score += 10;
    }

    // Check role match
    if (identity.role && element.getAttribute("role") === identity.role) {
      score += 15;
    }

    // Check visible text match
    const elementText = getVisibleText(element);
    if (identity.text && elementText.includes(identity.text)) {
      score += 20;
      if (elementText === identity.text) {
        score += 10; // Exact match bonus
      }
    }

    // Check aria-label match
    if (
      identity.ariaLabel &&
      element.getAttribute("aria-label") === identity.ariaLabel
    ) {
      score += 15;
    }

    // Check label text match (for inputs)
    if (identity.labelText) {
      const labelText = getAssociatedLabelText(element as HTMLElement);
      if (labelText === identity.labelText) {
        score += 20;
      }
    }

    // Check bounding box similarity (if available)
    if (identity.boundingBox) {
      const currentBox = getBoundingBox(element);
      const boxSimilarity = calculateBoundingBoxSimilarity(
        identity.boundingBox,
        currentBox
      );
      score += boxSimilarity * 30; // Up to 30 points for position similarity
    }

    // Track best match
    if (score > bestScore) {
      bestScore = score;
      bestMatch = element;
    }
  }

  // Only return match if score is reasonably confident
  return bestScore >= 20 ? bestMatch : null;
}

/**
 * Find an element on the page using ElementIdentity with fallback selectors
 *
 * Tries all selector candidates in order of confidence, attempting to:
 * 1. Find exact single match
 * 2. Disambiguate multiple matches using additional context
 * 3. Fall back to next selector if current fails
 *
 * Returns null only after all candidates have been exhausted.
 *
 * @param identity - The ElementIdentity captured during recording
 * @returns The located element, or null if not found
 */
export function findElement(identity: ElementIdentity): Element | null {
  // Try each selector candidate in order of confidence
  for (const candidate of identity.selectorCandidates) {
    const element = tryFindByCandidate(candidate, identity);

    if (element) {
      console.log(
        `Element found using ${candidate.type} (confidence: ${candidate.confidence})`,
        element
      );
      return element;
    }
  }

  console.warn("Failed to locate element with any selector candidate", {
    identity,
  });
  return null;
}

/**
 * Verify that an element still matches the recorded identity
 * Useful for checking if the page structure has changed
 */
export function verifyElementIdentity(
  element: Element,
  identity: ElementIdentity
): boolean {
  // Check basic properties
  if (element.tagName.toLowerCase() !== identity.tagName) {
    return false;
  }

  // Check for high-confidence selectors
  if (identity.dataAttributes["data-adoption-id"]) {
    return (
      element.getAttribute("data-adoption-id") ===
      identity.dataAttributes["data-adoption-id"]
    );
  }

  // Check test IDs
  for (const attr of ["data-testid", "data-test", "data-cy"]) {
    if (identity.dataAttributes[attr]) {
      return (
        element.getAttribute(attr) === identity.dataAttributes[attr]
      );
    }
  }

  // Check ID
  if (identity.id && element.id === identity.id) {
    return true;
  }

  // Check name
  if (identity.name && element.getAttribute("name") === identity.name) {
    return true;
  }

  // Fallback to text/label matching
  const text = getVisibleText(element);
  const label = getAssociatedLabelText(element as HTMLElement);

  return (
    (identity.text && text === identity.text) ||
    (identity.labelText && label === identity.labelText)
  );
}
