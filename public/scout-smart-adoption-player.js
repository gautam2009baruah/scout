(function () {
  const DEFAULTS = { scoutBaseUrl: "", targetAppId: "", autoShowLauncher: true, userId: "" };
  const PLAYER_VERSION = "20260701-tooltip-rect-guard";
  const GOAL_TIMEOUT_MS = 45000;
  const AUTO_CLICK_PREVIEW_MS = 350;
  const LOCATION_EVENT = "scout:locationchange";
  const MIN_MATCH_SCORE = 55;
  const AMBIGUOUS_SCORE_DELTA = 8;
  const POSITION_RESOLVE_MIN_SCORE = 0.72;
  const POSITION_RESOLVE_MIN_DELTA = 0.18;
  const SELECTOR_PRIORITY = {
    "data-adoption-id": 1,
    "data-testid": 2,
    "data-test": 2,
    "data-cy": 2,
    "aria-label": 3,
    "label-text": 4,
    "role-text": 5,
    placeholder: 6,
    id: 7,
    name: 7,
    "text-context": 7,
    css: 8,
    xpath: 9
  };

  function escapeCss(value) {
    return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function randomId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const value = Math.random() * 16 | 0;
      return (char === "x" ? value : (value & 0x3 | 0x8)).toString(16);
    });
  }

  function createAnalytics(config) {
    const queue = [];
    let timer = null;
    const endpoint = new URL("/api/guided-workflow-player/analytics", config.scoutBaseUrl || window.location.origin).toString();
    const flush = () => {
      timer = null;
      if (queue.length === 0) return;
      const events = queue.splice(0, queue.length);
      const body = JSON.stringify({ events });
      try {
        if (navigator.sendBeacon) {
          const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
          if (ok) return;
        }
      } catch {}
      fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    return {
      emit(event) {
        if (!event || event.analyticsLoggingEnabled === false) return;
        queue.push({ ...event, userId: config.userId || undefined });
        if (!timer) timer = window.setTimeout(flush, 250);
      },
      flush
    };
  }

  function normalizeUrl(value) {
    try {
      const url = new URL(value || "", window.location.origin);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return String(value || "");
    }
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function readableText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function compactText(value) {
    return readableText(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  function debugFinder(message, detail) {
    console.debug(`[ScoutElementFinder] ${message}`, detail || "");
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
    const parts = String(value || "").split("::");
    const role = parts[0];
    const text = compactText(parts.slice(1).join("::") || "");
    return Array.from(document.querySelectorAll(`[role="${escapeCss(role)}"]`))
      .find((element) => element instanceof HTMLElement && compactText(element.innerText) === text) || null;
  }

  function controlsForLabel(label) {
    const controls = Array.from(label.querySelectorAll("input, select, textarea, button, [role='combobox'], [role='textbox'], [tabindex]:not([tabindex='-1'])"));
    const controlId = label.getAttribute("for");
    const forControl = controlId ? document.getElementById(controlId) : null;
    if (forControl instanceof HTMLElement) controls.push(forControl);
    return Array.from(new Set(controls));
  }

  function byLabelText(value, target) {
    const matches = labelTextMatches(value);
    const preferred = preferByTarget(matches, target);
    debugFinder(preferred ? "label-text matched control" : "label-text found no control", { value, targetTagName: target?.tagName, matchCount: matches.length });
    return preferred;
  }

  function labelTextMatches(value) {
    const normalizedText = compactText(value);
    const exactMatches = [];
    const startsWithMatches = [];

    for (const label of Array.from(document.querySelectorAll("label"))) {
      for (const control of controlsForLabel(label)) {
        const clean = compactText(cleanLabelText(label, control));
        if (!clean) continue;
        if (clean === normalizedText) exactMatches.push(control);
        else if (clean.startsWith(normalizedText)) startsWithMatches.push(control);
      }
    }

    return Array.from(new Set(exactMatches.length > 0 ? exactMatches : startsWithMatches));
  }

  function preferByTarget(elements, target) {
    if (elements.length === 0) return null;
    if (target?.tagName) {
      const tagMatch = elements.find((element) => element.tagName.toLowerCase() === String(target.tagName).toLowerCase());
      if (tagMatch) return tagMatch;
    }
    return elements[0];
  }

  function cleanLabelText(label, excludedDescendant) {
    const caption = labelCaptionBeforeControl(label, excludedDescendant);
    if (caption) return stripTrailingSelectedValue(caption, excludedDescendant);

    const pieces = [];
    const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (excludedDescendant && excludedDescendant !== label && excludedDescendant.contains(parent)) return NodeFilter.FILTER_REJECT;
        const interactiveAncestor = parent.closest("input, select, textarea, button, option, [contenteditable='true'], [role='button'], [role='link'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], [role='checkbox'], [role='radio'], [role='switch'], [role='slider'], [role='textbox'], [role='tab']");
        if (interactiveAncestor && interactiveAncestor !== label) return NodeFilter.FILTER_REJECT;
        return node.textContent && node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    let node = walker.nextNode();
    while (node) {
      pieces.push(node.textContent || "");
      node = walker.nextNode();
    }
    return stripTrailingSelectedValue(readableText(pieces.join(" ")), excludedDescendant);
  }

  function labelCaptionBeforeControl(label, control) {
    if (!control) return "";
    const controlChild = Array.from(label.children).find((child) => child === control || child.contains(control));
    if (!controlChild) return "";
    const pieces = [];
    let sibling = controlChild.previousElementSibling;
    while (sibling) {
      pieces.unshift(cleanedContainerText(sibling, 120));
      sibling = sibling.previousElementSibling;
    }
    return readableText(pieces.join(" "));
  }

  function selectedControlDisplayText(element) {
    if (!(element instanceof HTMLElement)) return "";
    if (element instanceof HTMLSelectElement) {
      return readableText(Array.from(element.selectedOptions).map((option) => option.textContent || "").join(" "));
    }
    return readableText(
      element.getAttribute("aria-valuetext") ||
      element.querySelector("[aria-selected='true'], [data-selected='true'], .selected, [class*='selected']")?.textContent
    );
  }

  function stripTrailingSelectedValue(labelText, control) {
    const selectedText = selectedControlDisplayText(control);
    const compactLabel = compactText(labelText);
    const compactSelected = compactText(selectedText);
    if (!compactSelected || !compactLabel.endsWith(compactSelected)) return labelText;

    const words = labelText.split(/\s+/);
    if (words.length > 1 && compactText(words[words.length - 1]) === compactSelected) {
      return readableText(words.slice(0, -1).join(" "));
    }

    return readableText(labelText.slice(0, Math.max(0, labelText.length - selectedText.length)));
  }

  function associatedLabelText(element) {
    if (!(element instanceof HTMLElement)) return "";
    const nativeControlLabel = labelTextFromNativeControl(element);
    if (nativeControlLabel) return nativeControlLabel;

    const labels = [];

    if (element.id) {
      document.querySelectorAll(`label[for="${escapeCss(element.id)}"]`).forEach((label) => labels.push(cleanLabelText(label, element)));
    }

    const wrappingLabel = element.closest("label");
    if (wrappingLabel) labels.push(cleanLabelText(wrappingLabel, element));

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      labelledBy.split(/\s+/).forEach((id) => {
        const label = document.getElementById(id);
        if (label) labels.push(label.textContent || "");
      });
    }

    return readableText(labels.join(" "));
  }

  function labelTextFromNativeControl(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return "";

    const labels = element.labels ? Array.from(element.labels) : [];
    for (const label of labels) {
      const text = getWrappedLabelCaption(label, element);
      if (text) return text;
    }

    return "";
  }

  function getWrappedLabelCaption(label, control) {
    const parts = [];

    for (const node of Array.from(label.childNodes)) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node;
        if (element === control || element.contains(control)) continue;
        if (element.matches("span, p, strong, b, small") || element.getAttribute("data-label") === "true") {
          const text = readableText(element.textContent);
          if (text) parts.push(text);
        }
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const text = readableText(node.textContent);
        if (text) parts.push(text);
      }
    }

    return parts.length ? parts.join(" ") : "";
  }

  function directElementText(element) {
    return readableText([
      visibleControlText(element),
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.id,
      associatedLabelText(element)
    ].filter(Boolean).join(" "));
  }

  function visibleControlText(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return "";
    return readableText(element.innerText || element.textContent);
  }

  function usefulDataAttributes(element) {
    const attrs = {};
    Array.from(element.attributes || []).forEach((attr) => {
      if (attr.name.startsWith("data-") && !/(token|secret|password|otp|cvv|card|auth|key|session)/i.test(attr.name)) attrs[attr.name] = attr.value;
    });
    return attrs;
  }

  function accessibleName(element) {
    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const text = labelledBy.split(/\s+/).map((id) => document.getElementById(id)?.textContent || "").join(" ");
      if (readableText(text)) return readableText(text);
    }
    return readableText(element.getAttribute("aria-label") || associatedLabelText(element) || element.getAttribute("placeholder") || visibleControlText(element));
  }

  function contextText(element, selector, limit) {
    const container = element.closest(selector);
    if (!container) return "";
    return cleanedContainerText(container, limit || 220);
  }

  function cleanedContainerText(container, limit) {
    const clone = container.cloneNode(true);
    clone.querySelectorAll("input, select, textarea, button, option, [contenteditable='true'], [role='combobox'], [role='listbox'], [role='option'], [role='menu'], [role='menuitem'], script, style").forEach((child) => child.remove());
    return readableText(clone.textContent).slice(0, limit || 220);
  }

  function headingText(element) {
    const container = element.closest("section, article, main, aside, form, dialog, [role='dialog'], [role='region'], [class*='card'], [class*='panel']");
    return readableText(container?.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']")?.textContent);
  }

  function siblingText(element, direction) {
    let sibling = direction === "previous" ? element.previousElementSibling : element.nextElementSibling;
    while (sibling) {
      const text = readableText(sibling.textContent);
      if (text) return text.slice(0, 120);
      sibling = direction === "previous" ? sibling.previousElementSibling : sibling.nextElementSibling;
    }
    return "";
  }

  function textMatchScore(actual, expected, exactScore, containsScore) {
    const actualCompact = compactText(actual);
    const expectedCompact = compactText(expected);
    if (!actualCompact || !expectedCompact) return 0;
    if (actualCompact === expectedCompact) return exactScore;
    if (actualCompact.includes(expectedCompact) || expectedCompact.includes(actualCompact)) return containsScore;
    return 0;
  }

  function boundingBoxScore(element, target) {
    return Math.round(positionMatchScore(element, target) * 8);
  }

  function positionMatchScore(element, target) {
    if (!target?.boundingBox) return 0;
    const rect = element.getBoundingClientRect();
    const box = { x: rect.x + window.scrollX, y: rect.y + window.scrollY, width: rect.width, height: rect.height };
    const xOverlap = Math.max(0, Math.min(target.boundingBox.x + target.boundingBox.width, box.x + box.width) - Math.max(target.boundingBox.x, box.x));
    const yOverlap = Math.max(0, Math.min(target.boundingBox.y + target.boundingBox.height, box.y + box.height) - Math.max(target.boundingBox.y, box.y));
    const overlapArea = xOverlap * yOverlap;
    const targetArea = target.boundingBox.width * target.boundingBox.height;
    const boxArea = box.width * box.height;
    const unionArea = targetArea + boxArea - overlapArea;
    const overlapScore = unionArea > 0 ? overlapArea / unionArea : 0;

    const targetCenterX = target.boundingBox.x + target.boundingBox.width / 2;
    const targetCenterY = target.boundingBox.y + target.boundingBox.height / 2;
    const boxCenterX = box.x + box.width / 2;
    const boxCenterY = box.y + box.height / 2;
    const centerDistance = Math.hypot(targetCenterX - boxCenterX, targetCenterY - boxCenterY);
    const targetDiagonal = Math.hypot(target.boundingBox.width, target.boundingBox.height);
    const centerScore = Math.max(0, 1 - centerDistance / Math.max(targetDiagonal * 3, 120));

    const widthRatio = Math.min(target.boundingBox.width, box.width) / Math.max(target.boundingBox.width, box.width, 1);
    const heightRatio = Math.min(target.boundingBox.height, box.height) / Math.max(target.boundingBox.height, box.height, 1);
    const sizeScore = Math.min(widthRatio, heightRatio);

    return Math.max(overlapScore, centerScore * 0.85 + sizeScore * 0.15);
  }

  function findByCandidate(candidate, target) {
    try {
      if (!candidate || !candidate.value) return null;
      debugFinder("trying selector candidate", { type: candidate.type, value: candidate.value });
      if (candidate.type === "xpath") return byXPath(candidate.value);
      if (candidate.type === "role-text") return byRoleText(candidate.value);
      if (candidate.type === "label-text") return byLabelText(candidate.value, target);
      return document.querySelector(candidate.value);
    } catch (error) {
      debugFinder("selector candidate failed", { type: candidate?.type, value: candidate?.value, error });
      return null;
    }
  }

  function plainTextFromHtml(value) {
    const element = document.createElement("div");
    element.innerHTML = String(value || "");
    return readableText(element.textContent || element.innerText || value || "");
  }

  function searchTermsFromText(value) {
    const text = plainTextFromHtml(value);
    const stopWords = new Set(["this", "that", "then", "with", "from", "into", "your", "you", "click", "select", "choose", "enter", "type", "field", "button", "control", "step", "next"]);
    const phrases = [];
    if (text) phrases.push(text);
    text.split(/[,.;:!?()\[\]{}<>/\\|]+/).forEach((part) => {
      const phrase = readableText(part);
      if (phrase.length > 3 && phrase.length <= 80) phrases.push(phrase);
    });
    text.split(/\s+/).forEach((word) => {
      const clean = readableText(word).replace(/[^a-zA-Z0-9_-]/g, "");
      if (clean.length > 3 && !stopWords.has(clean.toLowerCase())) phrases.push(clean);
    });
    return Array.from(new Set(phrases));
  }

  function identityTerms(target, guideTitle, step) {
    const terms = [];
    if (target) {
      if (target.accessibleName) terms.push(target.accessibleName);
      if (target.fallbackText) terms.push(target.fallbackText);
      if (target.text) terms.push(target.text);
      if (target.labelText) terms.push(target.labelText);
      if (target.ariaLabel) terms.push(target.ariaLabel);
      if (target.placeholder) terms.push(target.placeholder);
      if (target.role) terms.push(target.role);
      if (target.tagName) terms.push(target.tagName);
    }
    if (step) {
      terms.push(...searchTermsFromText(step.title));
      terms.push(...searchTermsFromText(step.message));
    }
    if (guideTitle) terms.push(guideTitle);
    return terms.map(readableText).filter(Boolean);
  }

  function scoreElement(element, target) {
    const targetData = (target && target.dataAttributes) || {};
    const dataAttributes = usefulDataAttributes(element);
    let score = 0;
    if (targetData["data-adoption-id"] && dataAttributes["data-adoption-id"] === targetData["data-adoption-id"]) score += 100;
    ["data-testid", "data-test", "data-cy"].forEach((attr) => {
      if (targetData[attr] && dataAttributes[attr] === targetData[attr]) score += 90;
    });

    if (target?.role && (element.getAttribute("role") || "").toLowerCase() === String(target.role).toLowerCase()) score += 16;
    if (target?.tagName && element.tagName.toLowerCase() === String(target.tagName).toLowerCase()) score += 12;
    if (target?.inputType && element instanceof HTMLInputElement && element.type.toLowerCase() === String(target.inputType).toLowerCase()) score += 10;
    if (target?.name && element.getAttribute("name") === target.name) score += 22;
    if (target?.id && element.id === target.id && !/^[a-z0-9]{8,}$|__[A-Z]|^ember\d+|^ng-/i.test(target.id)) score += 18;

    score += textMatchScore(accessibleName(element), target?.accessibleName || target?.fallbackText, 42, 25);
    score += textMatchScore(visibleControlText(element), target?.text || target?.fallbackText, 36, 20);
    score += textMatchScore(associatedLabelText(element), target?.labelText, 40, 24);
    score += textMatchScore(element.getAttribute("aria-label"), target?.ariaLabel, 34, 20);
    score += textMatchScore(element.getAttribute("placeholder"), target?.placeholder, 30, 18);
    score += textMatchScore(headingText(element), target?.nearbyHeading, 16, 9);
    score += textMatchScore(contextText(element, "label, fieldset, section, article, form, dialog, [role='dialog'], [class*='card'], [class*='panel']"), target?.parentContainerText, 12, 6);
    score += textMatchScore(siblingText(element, "previous"), target?.previousSiblingText, 10, 5);
    score += textMatchScore(siblingText(element, "next"), target?.nextSiblingText, 10, 5);
    score += textMatchScore(element.parentElement?.tagName.toLowerCase(), target?.parentTagName, 8, 4);
    score += textMatchScore(element.parentElement?.getAttribute("role"), target?.parentRole, 10, 5);
    score += textMatchScore(element.parentElement ? cleanedContainerText(element.parentElement, 180) : "", target?.parentText, 12, 6);
    score += textMatchScore(contextText(element, "form, fieldset", 160), target?.formTitle, 14, 8);
    score += textMatchScore(contextText(element, "dialog, [role='dialog'], [aria-modal='true']", 160), target?.dialogTitle, 14, 8);
    score += textMatchScore(contextText(element, "[data-card], [class*='card'], [class*='panel']", 160), target?.cardTitle, 14, 8);

    const direct = directElementText(element);
    const directCompact = compactText(direct);
    const contextCompact = compactText(element.closest("label, section, form, aside, nav, main")?.textContent);
    const terms = identityTerms(target);

    terms.forEach((term) => {
      const termCompact = compactText(term);
      if (!termCompact) return;
      if (directCompact === termCompact) score += 18;
      else if (directCompact.includes(termCompact) || termCompact.includes(directCompact)) score += 10;
      else if (contextCompact.includes(termCompact)) score += 3;
    });

    return score + boundingBoxScore(element, target);
  }

  function collectInteractiveElements() {
    return Array.from(new Set(document.querySelectorAll("button, a[href], input, select, textarea, [role], [tabindex]:not([tabindex='-1'])")))
      .filter(isVisible);
  }

  function resolveAmbiguousByPosition(candidates, target) {
    if (!target?.boundingBox || candidates.length < 2) return null;
    const byPosition = [...candidates].sort((first, second) => second.positionScore - first.positionScore);
    const best = byPosition[0];
    const second = byPosition[1];
    const positionDelta = best.positionScore - second.positionScore;
    if (best.score < MIN_MATCH_SCORE || best.positionScore < POSITION_RESOLVE_MIN_SCORE || positionDelta < POSITION_RESOLVE_MIN_DELTA) return null;

    debugFinder("ambiguous controls resolved by recorded position", {
      score: best.score,
      positionScore: best.positionScore,
      positionDelta
    });
    return best;
  }

  function findControl(target) {
    const selectorMatches = collectSelectorMatches(target);
    if (selectorMatches.length === 1) {
      const score = scoreElement(selectorMatches[0], target);
      if (score >= MIN_MATCH_SCORE) {
        return {
          element: selectorMatches[0],
          score,
          ambiguous: false,
          candidates: [{ element: selectorMatches[0], score }],
          needsConfirmation: false
        };
      }
    }

    const candidates = Array.from(new Set([...selectorMatches, ...collectInteractiveElements()]))
      .map((element) => ({ element, score: scoreElement(element, target), positionScore: positionMatchScore(element, target) }))
      .sort((first, second) => second.score - first.score);
    const best = candidates[0];
    const second = candidates[1];
    const positionResolved = best && second && best.score >= MIN_MATCH_SCORE && best.score - second.score <= AMBIGUOUS_SCORE_DELTA
      ? resolveAmbiguousByPosition(candidates, target)
      : null;
    const ambiguous = Boolean(best && second && best.score >= MIN_MATCH_SCORE && best.score - second.score <= AMBIGUOUS_SCORE_DELTA && !positionResolved);
    return {
      element: positionResolved?.element || (best && best.score >= MIN_MATCH_SCORE && !ambiguous ? best.element : null),
      score: best?.score || 0,
      ambiguous,
      candidates: ambiguous ? candidates.filter((candidate) => best && best.score - candidate.score <= AMBIGUOUS_SCORE_DELTA).slice(0, 5) : candidates.slice(0, 5),
      needsConfirmation: !best || best.score < MIN_MATCH_SCORE || ambiguous
    };
  }

  function collectSelectorMatches(target) {
    const candidates = [...((target && target.selectorCandidates) || [])].sort((a, b) => {
      const priority = (SELECTOR_PRIORITY[a.type] || 99) - (SELECTOR_PRIORITY[b.type] || 99);
      return priority || Number(b.confidence || 0) - Number(a.confidence || 0);
    });
    const matches = [];

    for (const candidate of candidates) {
      try {
        if (candidate.type === "xpath" || candidate.type === "role-text" || candidate.type === "label-text") {
          const element = findByCandidate(candidate, target);
          if (isVisible(element)) {
            debugFinder("selector candidate matched visible element", { type: candidate.type, tagName: element.tagName.toLowerCase() });
            matches.push(element);
          } else {
            debugFinder("selector candidate had no visible match", { type: candidate.type, value: candidate.value });
          }
        } else {
          let count = 0;
          document.querySelectorAll(candidate.value).forEach((element) => {
            if (isVisible(element)) {
              count += 1;
              matches.push(element);
            }
          });
          debugFinder(count > 0 ? "selector candidate matched visible elements" : "selector candidate had no visible match", { type: candidate.type, value: candidate.value, count });
        }
      } catch (error) {
        debugFinder("selector candidate failed", { type: candidate.type, value: candidate.value, error });
      }
    }

    return Array.from(new Set(matches));
  }

  function findTarget(target) {
    const result = findControl(target || {});
    if (result.element) return result.element;
    if (!result.ambiguous && target?.fallbackText) {
      return findVisibleControlByTerms([target.fallbackText]);
    }
    return null;
  }

  function findVisibleControlByTerms(terms) {
    const normalized = terms.map(compactText).filter((term) => term.length > 3);
    const controls = Array.from(document.querySelectorAll("a, button, [role='button'], [role='link'], [role='menuitem'], input, select, textarea"));
    const matches = controls.map((control) => {
      if (!isVisible(control)) return false;
      const text = compactText(directElementText(control));
      const score = normalized.reduce((total, term) => total + (text === term ? 4 : text.includes(term) ? 2 : term.includes(text) && text.length > 3 ? 1 : 0), 0);
      return score > 0 ? { control, score } : null;
    }).filter(Boolean).sort((first, second) => second.score - first.score);
    return matches[0]?.control || null;
  }

  function buildTargetFromElement(element) {
    const elementIdentity = buildElementIdentity(element);
    const selectorCandidates = elementIdentity.selectorCandidates || buildSelectorCandidates(element);
    return {
      elementIdentity,
      selectorCandidates,
      fallbackText: elementIdentity.text || elementIdentity.accessibleName || elementIdentity.labelText || elementIdentity.ariaLabel || elementIdentity.placeholder,
      role: elementIdentity.role,
      tagName: elementIdentity.tagName,
      accessibleName: elementIdentity.accessibleName,
      text: elementIdentity.text,
      ariaLabel: elementIdentity.ariaLabel,
      labelText: elementIdentity.labelText,
      placeholder: elementIdentity.placeholder,
      inputType: elementIdentity.inputType,
      selectedOptionText: elementIdentity.selectedOptionText,
      name: elementIdentity.name,
      id: elementIdentity.id,
      dataAttributes: elementIdentity.dataAttributes,
      nearbyHeading: elementIdentity.nearbyHeading,
      parentContainerText: elementIdentity.parentContainerText,
      previousSiblingText: elementIdentity.previousSiblingText,
      nextSiblingText: elementIdentity.nextSiblingText,
      parentTagName: elementIdentity.parentTagName,
      parentRole: elementIdentity.parentRole,
      parentAccessibleName: elementIdentity.parentAccessibleName,
      parentText: elementIdentity.parentText,
      formTitle: elementIdentity.formTitle,
      dialogTitle: elementIdentity.dialogTitle,
      cardTitle: elementIdentity.cardTitle,
      cssFallback: elementIdentity.cssFallback,
      xpathFallback: elementIdentity.xpathFallback,
      boundingBox: elementIdentity.boundingBox
    };
  }

  function injectStyles() {
    if (document.getElementById("scout-adoption-player-style")) return;
    const style = document.createElement("style");
    style.id = "scout-adoption-player-style";
    style.textContent = `
      .scout-adoption-launcher { position: fixed; right: 20px; bottom: 20px; z-index: 2147483646; border: 0; border-radius: 999px; background: #020617; color: #fff; padding: 12px 16px; font: 600 14px system-ui, sans-serif; box-shadow: 0 16px 44px rgb(15 23 42 / .28); cursor: pointer; }
      .scout-adoption-menu { position: fixed; right: 20px; bottom: 72px; z-index: 2147483646; width: min(320px, calc(100vw - 40px)); border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 18px 52px rgb(15 23 42 / .22); padding: 8px; font: 14px system-ui, sans-serif; }
      .scout-adoption-menu button { display: block; width: 100%; border: 0; border-radius: 6px; background: transparent; padding: 10px; text-align: left; color: #0f172a; cursor: pointer; }
      .scout-adoption-highlight { outline: 3px solid #0ea5e9 !important; outline-offset: 4px !important; border-radius: 6px !important; }
      .scout-adoption-pick-candidate { outline: 3px solid #f59e0b !important; outline-offset: 4px !important; border-radius: 6px !important; cursor: crosshair !important; }
      .scout-adoption-overlay { position: fixed; inset: 0; z-index: 2147483646; background: rgb(15 23 42 / .52); box-shadow: inset 0 0 140px rgb(15 23 42 / .46); }
      .scout-adoption-tooltip { position: fixed; z-index: 2147483647; width: max-content; max-width: min(292px, calc(100vw - 32px)); border: 1px solid rgba(14, 165, 233, .22); border-radius: 14px; background: rgba(255,255,255,.98); box-shadow: 0 18px 48px rgb(15 23 42 / .20), 0 2px 10px rgb(15 23 42 / .08); padding: 12px 14px 11px; color: #0f172a; font: 13px/1.4 system-ui, sans-serif; backdrop-filter: blur(10px); }
      .scout-adoption-tooltip__close { position: absolute; top: 7px; right: 8px; width: 22px; height: 22px; display: inline-grid; place-items: center; border: 0 !important; border-radius: 999px !important; background: transparent !important; color: #64748b !important; padding: 0 !important; margin: 0 !important; font: 18px/1 system-ui, sans-serif !important; cursor: pointer; }
      .scout-adoption-tooltip__close:hover { background: #f1f5f9 !important; color: #0f172a !important; }
      .scout-adoption-tooltip h3 { max-width: 238px; padding-right: 20px; margin: 0 0 4px; font-size: 13px; font-weight: 750; line-height: 1.35; }
      .scout-adoption-tooltip__message { max-width: 252px; margin: 0; color: #475569; font-size: 12.5px; }
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
      .scout-adoption-footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; color: #64748b; font-size: 11.5px; }
      .scout-adoption-footer button { margin-left: 6px; border: 1px solid #dbe3ee; border-radius: 999px; background: #fff; padding: 5px 9px; color: #0f172a; cursor: pointer; font: 600 12px system-ui, sans-serif; }
      .scout-adoption-footer button[data-next] { border-color: #0f172a; background: #0f172a; color: #fff; }
      .scout-adoption-tooltip__arrow { position: absolute; width: 12px; height: 12px; background: rgba(255,255,255,.98); border: 1px solid rgba(14, 165, 233, .22); transform: rotate(45deg); }
      .scout-adoption-tooltip[data-floating="center"] { max-width: min(420px, calc(100vw - 32px)); padding: 18px 18px 15px; box-shadow: 0 30px 80px rgb(15 23 42 / .28), 0 8px 22px rgb(15 23 42 / .14); }
      .scout-adoption-tooltip[data-floating="center"] .scout-adoption-tooltip__arrow { display: none; }
      .scout-adoption-tooltip[data-floating="center"] .scout-adoption-tooltip__message { max-width: 360px; font-size: 13px; }
      .scout-adoption-tooltip[data-placement="bottom"] .scout-adoption-tooltip__arrow { top: -7px; left: var(--arrow-left, 22px); border-right: 0; border-bottom: 0; }
      .scout-adoption-tooltip[data-placement="top"] .scout-adoption-tooltip__arrow { bottom: -7px; left: var(--arrow-left, 22px); border-left: 0; border-top: 0; }
      .scout-adoption-tooltip[data-placement="right"] .scout-adoption-tooltip__arrow { left: -7px; top: var(--arrow-top, 20px); border-right: 0; border-top: 0; }
      .scout-adoption-tooltip[data-placement="left"] .scout-adoption-tooltip__arrow { right: -7px; top: var(--arrow-top, 20px); border-left: 0; border-bottom: 0; }
      .scout-adoption-missing, .scout-adoption-recovery-panel { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 2147483647; width: min(360px, calc(100vw - 24px)); border: 1px solid rgb(148 163 184 / .38); border-radius: 12px; background: rgb(255 255 255 / .88); color: #0f172a; padding: 9px; font: 12.5px/1.35 system-ui, sans-serif; box-shadow: 0 16px 42px rgb(15 23 42 / .16); backdrop-filter: blur(12px); }
      .scout-adoption-recovery-panel[data-dragging="true"] { user-select: none; cursor: grabbing; }
      .scout-adoption-recovery-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; cursor: grab; }
      .scout-adoption-recovery-title { min-width: 0; display: flex; align-items: center; gap: 7px; font-weight: 750; color: #0f172a; }
      .scout-adoption-recovery-dot { width: 9px; height: 9px; border-radius: 999px; background: #0ea5e9; box-shadow: 0 0 0 5px rgb(14 165 233 / .12); }
      .scout-adoption-recovery-spin { width: 14px; height: 14px; border: 2px solid #bae6fd; border-top-color: #0284c7; border-radius: 999px; animation: scout-spin .8s linear infinite; }
      .scout-adoption-recovery-grip { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; color: #64748b; cursor: grab; }
      .scout-adoption-recovery-body { color: #475569; padding-right: 2px; }
      .scout-adoption-recovery-actions { display: flex; align-items: center; gap: 5px; flex-shrink: 0; }
      .scout-adoption-recovery-actions button, .scout-adoption-missing button { display: inline-grid; place-items: center; width: 28px; height: 28px; border: 1px solid #dbe3ee; border-radius: 999px; background: rgb(255 255 255 / .94); padding: 0; color: #0f172a; cursor: pointer; }
      .scout-adoption-recovery-actions button svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 2.4; fill: none; stroke-linecap: round; stroke-linejoin: round; }
      .scout-adoption-recovery-actions button:hover { background: #f8fafc; border-color: #cbd5e1; }
      .scout-adoption-recovery-actions button[data-primary] { border-color: #0f172a; background: #0f172a; color: #fff; }
      .scout-adoption-recovery-actions button[data-danger] { border-color: #fecaca; color: #b91c1c; }
      .scout-adoption-target-arrow { position: fixed; z-index: 2147483647; pointer-events: none; display: flex; align-items: center; gap: 6px; border-radius: 999px; background: rgb(14 165 233 / .92); color: #fff; padding: 5px 8px; font: 700 11px system-ui, sans-serif; box-shadow: 0 10px 30px rgb(14 165 233 / .30); }
      .scout-adoption-target-arrow:after { content: ""; position: absolute; left: 50%; bottom: -7px; margin-left: -6px; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 7px solid rgb(14 165 233 / .92); }
      .scout-adoption-recovery-toast { top: max(16px, env(safe-area-inset-top)); bottom: auto; max-width: min(420px, calc(100vw - 32px)); text-align: center; pointer-events: none; }
      @keyframes scout-spin { to { transform: rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  function createTooltip(input) {
    const overlay = input.target === document.body ? document.createElement("div") : null;
    if (overlay) {
      overlay.className = "scout-adoption-overlay";
      document.body.appendChild(overlay);
    }
    const tooltip = document.createElement("div");
    tooltip.className = "scout-adoption-tooltip";
    tooltip.innerHTML = `
      <div class="scout-adoption-tooltip__arrow"></div>
      <button type="button" class="scout-adoption-tooltip__close" data-close aria-label="Close guide">&times;</button>
      <div class="scout-adoption-tooltip__message"></div>
      <div class="scout-adoption-footer">
        <span>${input.hideStepCount ? "" : `${input.index + 1} / ${input.total}`}</span>
        <span>
          ${input.index > 0 ? "<button type=\"button\" data-back>Back</button>" : ""}
          <button type="button" data-next>${input.primaryLabel || (input.index + 1 === input.total ? "Done" : "Next")}</button>
        </span>
      </div>
    `;
    // Track tooltip interactions to prevent blur/change events from advancing workflow
    // when user clicks Back/Next/Close buttons
    tooltip.__scoutTooltipInteracting = false;
    tooltip.addEventListener("pointerdown", (event) => {
      tooltip.__scoutTooltipInteracting = true;
      console.log('🖱️ Tooltip interaction started (blur/change events will be ignored)');
      setTimeout(() => {
        tooltip.__scoutTooltipInteracting = false;
        console.log('🖱️ Tooltip interaction ended');
      }, 100);
      event.stopPropagation();
    });
    tooltip.addEventListener("click", (event) => event.stopPropagation());
    tooltip.querySelector(".scout-adoption-tooltip__message").innerHTML = sanitizeGuideHtml(input.message || "");
    tooltip.querySelectorAll(".scout-adoption-tooltip__message a[href]").forEach((link) => {
      link.addEventListener("pointerdown", (event) => event.stopPropagation());
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const href = link.getAttribute("href") || "";
        const guideId = link.dataset.scoutGuideId || href.replace(/^#scout-guide:/, "");
        if (href.startsWith("#scout-guide:") && guideId && input.onGuideLink) {
          input.onGuideLink(guideId);
          return;
        }
        window.open(href, "_blank", "noopener,noreferrer");
      });
    });
    const backButton = tooltip.querySelector("[data-back]");
    if (backButton) {
      console.log('🔘 Back button found in tooltip, attaching click listener');
      backButton.addEventListener("click", (event) => {
        console.log('🔘 Back button CLICKED!');
        event.preventDefault();
        event.stopPropagation();
        input.onBack();
      });
    } else {
      console.log('⚠️ No back button in tooltip (index must be 0)');
    }
    tooltip.querySelector("[data-next]").addEventListener("click", input.onNext);
    tooltip.querySelector("[data-close]").addEventListener("click", input.onClose);
    document.body.appendChild(tooltip);
    if (overlay) {
      tooltip.__scoutCleanup = () => overlay.remove();
    }
    attachAnchoredPositioning(tooltip, input.target);
    return tooltip;
  }

  function sanitizeGuideHtml(value) {
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
        const href = element.getAttribute("href") || "";
        if (!href.startsWith("#scout-guide:")) {
          element.setAttribute("target", "_blank");
          element.setAttribute("rel", "noopener noreferrer");
        }
      }
    });
    return template.innerHTML;
  }

  function normalizeSafeHref(value) {
    const href = String(value || "").trim();
    if (!href) return "";
    if (/^(https?:\/\/|\/|#scout-guide:)/i.test(href)) return href;
    if (/^(www\.|[a-z0-9][a-z0-9.-]*\.[a-z]{2,})(?:[/:?#].*)?$/i.test(href) && !/\s/.test(href)) {
      return `https://${href}`;
    }
    return "";
  }

  function attachAnchoredPositioning(tooltip, target) {
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
      if (previousCleanup) previousCleanup();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }

  function positionTooltip(tooltip, target) {
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

  function patchHistoryEvents() {
    if (window.history.__scoutPatched) return;
    window.history.__scoutPatched = true;
    const notify = () => window.dispatchEvent(new Event(LOCATION_EVENT));
    const pushState = window.history.pushState;
    const replaceState = window.history.replaceState;
    window.history.pushState = function patchedPushState() {
      const result = pushState.apply(this, arguments);
      notify();
      return result;
    };
    window.history.replaceState = function patchedReplaceState() {
      const result = replaceState.apply(this, arguments);
      notify();
      return result;
    };
  }

  function waitForCondition(predicate, timeoutMs) {
    patchHistoryEvents();
    return new Promise((resolve) => {
      if (predicate()) return resolve(true);
      const startedAt = Date.now();
      let observer;
      let timer;
      const cleanup = () => {
        if (observer) observer.disconnect();
        window.clearInterval(timer);
        window.removeEventListener(LOCATION_EVENT, check);
        window.removeEventListener("popstate", check);
        window.removeEventListener("hashchange", check);
      };
      const check = () => {
        if (predicate()) {
          cleanup();
          resolve(true);
        } else if (Date.now() - startedAt >= timeoutMs) {
          cleanup();
          resolve(false);
        }
      };
      observer = new MutationObserver(check);
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      timer = window.setInterval(check, 250);
      window.addEventListener(LOCATION_EVENT, check);
      window.addEventListener("popstate", check);
      window.addEventListener("hashchange", check);
    });
  }

  function contextTarget(goalContext) {
    return goalContext && (goalContext.requiredElement || goalContext.target);
  }

  function detectContext(goalContext) {
    if (!goalContext) return { isOnGoalContext: true };
    const expectedUrl = goalContext.url || "";
    const urlMatches = !expectedUrl || normalizeUrl(window.location.href).includes(normalizeUrl(expectedUrl));
    const target = contextTarget(goalContext);
    const element = target ? findTarget(target) : null;
    return { isOnGoalContext: Boolean(urlMatches && (!target || isVisible(element))), element };
  }

  function guideSteps(guide, main) {
    const normalizeStep = (step) => {
      const stepPurpose = step.stepPurpose || "main";
      const navigationMode = stepPurpose === "navigation" ? step.navigationMode || "waitForUser" : undefined;
      return Object.assign({}, step, {
        type: step.type === "manualInstruction" && hasTargetIdentity(step)
          ? "highlight"
          : step.type || (stepPurpose === "navigation" || step.trigger === "click" ? "click" : ["input", "change", "blur", "focus"].includes(step.trigger) ? "input" : "highlight"),
        navigationMode,
        autoClick: step.autoClick === true || navigationMode === "autoClick",
        trigger: stepPurpose === "navigation" ? "click" : step.trigger
      });
    };
    const source = main && Array.isArray(guide.mainSteps)
      ? guide.mainSteps
      : !main && Array.isArray(guide.entrySteps)
      ? guide.entrySteps
      : (guide.steps || []).filter((step) => main ? step.stepPurpose !== "navigation" : step.stepPurpose === "navigation");
    return source.map(normalizeStep);
  }

  function preWorkflowConfirmationStep(guide) {
    return {
      id: `${guide.id}-pre-workflow-confirmation`,
      order: 0,
      type: "manualInstruction",
      urlMatch: guide.startContext?.url || "",
      target: { selectorCandidates: [] },
      title: "Before you begin",
      message: guide.preWorkflowConfirmationHtml || "",
      trigger: "manualNext",
      actionSourceId: `${guide.id}:pre-workflow-confirmation`
    };
  }

  function hasTargetIdentity(step) {
    const target = step && step.target;
    return Boolean(target && (
      (target.selectorCandidates && target.selectorCandidates.length)
      || target.labelText
      || target.accessibleName
      || target.ariaLabel
      || target.placeholder
      || target.text
      || target.cssFallback
      || target.xpathFallback
    ));
  }

  function isSafeAutoClickTarget(target) {
    const text = [target.innerText, target.getAttribute("aria-label"), target.getAttribute("title")].filter(Boolean).join(" ").toLowerCase();
    return !/\b(delete|remove|submit|save|publish|confirm|approve|pay|send)\b/.test(text);
  }

  function resolveGoalContext(guide, mainSteps) {
    if (guide.goalContext) return guide.goalContext;
    const firstMainStep = mainSteps[0];
    if (!firstMainStep) return null;
    return {
      url: firstMainStep.urlMatch,
      target: firstMainStep.target,
      requiredElement: firstMainStep.target
    };
  }

  function delay(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function focusTarget(element) {
    if (!(element instanceof HTMLElement)) return;
    if (!element.matches("input, select, textarea, button, a[href], [tabindex]:not([tabindex='-1']), [role='button'], [role='link'], [role='combobox'], [role='textbox']")) return;
    window.setTimeout(() => {
      try {
        element.focus({ preventScroll: true });
      } catch {
        element.focus();
      }
    }, 120);
  }

  function isScoutPlayerEvent(event) {
    if (event.target instanceof Element && event.target.closest(".scout-adoption-tooltip, .scout-adoption-overlay, .scout-adoption-missing, .scout-adoption-recovery")) return true;
    if ("clientX" in event && "clientY" in event) {
      return Array.from(document.querySelectorAll(".scout-adoption-tooltip")).some((tooltip) => {
        const rect = tooltip.getBoundingClientRect();
        return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      });
    }
    return false;
  }

  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[character] || character));
  }

  function iconButton(action, label, icon, primary, danger) {
    return `<button type="button" data-${action} ${primary ? "data-primary" : ""} ${danger ? "data-danger" : ""} title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${iconSvg(icon)}</button>`;
  }

  function iconSvg(name) {
    const icons = {
      check: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
      x: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      close: '<svg viewBox="0 0 24 24"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
      cursor: '<svg viewBox="0 0 24 24"><path d="m3 3 7.8 18 2.2-7 7-2.2L3 3Z"/></svg>',
      skip: '<svg viewBox="0 0 24 24"><path d="m5 5 8 7-8 7V5Z"/><path d="M19 5v14"/></svg>',
      refresh: '<svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/></svg>',
      grip: '<svg viewBox="0 0 24 24"><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></svg>'
    };
    return icons[name] || icons.close;
  }

  function buildSelectorCandidates(element) {
    const candidates = [];
    for (const attr of ["data-adoption-id", "data-testid", "data-test", "data-cy"]) {
      const value = element.getAttribute(attr);
      if (value) candidates.push({ type: attr, value, confidence: 95, reason: `Has ${attr} attribute` });
    }
    if (element.id) candidates.push({ type: "id", value: element.id, confidence: 90, reason: "Has unique ID" });
    const name = element.getAttribute("name");
    if (name) candidates.push({ type: "name", value: name, confidence: 85, reason: "Has name attribute" });
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) candidates.push({ type: "aria-label", value: ariaLabel, confidence: 80, reason: "Has aria-label" });
    const role = element.getAttribute("role");
    const text = readableText(element.innerText || element.textContent);
    if (role && text) candidates.push({ type: "role-text", value: `${role}::${text}`, confidence: 75, reason: "Has role and text content" });
    const labelText = associatedLabelText(element);
    if (labelText) candidates.push({ type: "label-text", value: labelText, confidence: 75, reason: "Has associated label" });
    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && element.placeholder) {
      candidates.push({ type: "placeholder", value: element.placeholder, confidence: 70, reason: "Has placeholder text" });
    }
    if (text && text.length < 100) candidates.push({ type: "text-context", value: text, confidence: 65, reason: "Has text content" });
    const cssSelector = buildCssSelector(element);
    if (cssSelector) candidates.push({ type: "css", value: cssSelector, confidence: 50, reason: "CSS selector path" });
    return candidates;
  }

  function buildElementIdentity(element) {
    const rect = element.getBoundingClientRect();
    const dataAttributes = {};
    Array.from(element.attributes || []).forEach((attr) => {
      if (attr.name.startsWith("data-")) dataAttributes[attr.name] = attr.value;
    });
    const labelText = associatedLabelText(element) || undefined;
    const text = readableText(element.innerText || element.textContent) || undefined;
    const parent = element.parentElement;
    const form = element.closest("form");
    const dialog = element.closest('[role="dialog"], [role="alertdialog"], dialog');

    return {
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute("role") || undefined,
      accessibleName: element.getAttribute("aria-label") || labelText || undefined,
      text,
      ariaLabel: element.getAttribute("aria-label") || undefined,
      labelText,
      placeholder: element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder || undefined : undefined,
      inputType: element instanceof HTMLInputElement ? element.type : undefined,
      selectedOptionText: element instanceof HTMLSelectElement ? readableText(Array.from(element.selectedOptions).map((option) => option.textContent || "").join(" ")) || undefined : undefined,
      name: element.getAttribute("name") || undefined,
      id: element.id || undefined,
      dataAttributes,
      parentTagName: parent?.tagName.toLowerCase(),
      parentRole: parent?.getAttribute("role") || undefined,
      parentAccessibleName: parent?.getAttribute("aria-label") || undefined,
      parentText: readableText(parent?.innerText).slice(0, 180) || undefined,
      formTitle: readableText(form?.querySelector("legend, h1, h2, h3, h4, h5, h6")?.textContent) || undefined,
      dialogTitle: readableText(dialog?.querySelector('[role="heading"], h1, h2, h3, .modal-title, .dialog-title')?.textContent) || undefined,
      url: window.location.href,
      path: window.location.pathname,
      cssFallback: buildCssSelector(element),
      selectorCandidates: buildSelectorCandidates(element),
      confidenceScore: 75,
      needsUserConfirmation: false,
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }

  function associatedLabelText(element) {
    if (element.id) {
      const label = document.querySelector(`label[for="${escapeCss(element.id)}"]`);
      if (label) return readableText(label.textContent);
    }
    return readableText(element.closest("label")?.textContent);
  }

  function buildCssSelector(element) {
    const path = [];
    let current = element;
    while (current && current !== document.body && current instanceof Element) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${escapeCss(current.id)}`;
        path.unshift(selector);
        break;
      }
      const siblings = current.parentElement ? Array.from(current.parentElement.children) : [];
      const sameTagSiblings = siblings.filter((sibling) => sibling.tagName === current.tagName);
      if (sameTagSiblings.length > 1) selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      path.unshift(selector);
      current = current.parentElement;
      if (path.length > 5) break;
    }
    return path.join(" > ");
  }

  class Player {
    constructor(guide, guideResolver, analytics) {
      this.guide = guide;
      this.guideResolver = guideResolver;
      this.analytics = analytics;
      this.index = 0;
      this.steps = [];
      this.phase = "main";
      this.tooltip = null;
      this.highlighted = null;
      this.stopped = false;
      this.preWorkflowConfirmationShown = false;
      this.executionId = randomId();
      this.executionStartedAt = 0;
      this.stepExecutionIds = {};
      this.stepStartedAt = {};
      this.workflowFinished = false;
    }

    emitAnalytics(event) {
      if (this.guide.analyticsLoggingEnabled === false) return;
      this.analytics?.emit({
        executionId: this.executionId,
        workflowId: this.guide.id,
        workflowVersionId: this.guide.id,
        workflowVersion: this.guide.version || 1,
        analyticsLoggingEnabled: this.guide.analyticsLoggingEnabled !== false,
        ...event
      });
    }

    stepExecutionId(step) {
      if (!step?.id) return undefined;
      this.stepExecutionIds[step.id] = this.stepExecutionIds[step.id] || randomId();
      return this.stepExecutionIds[step.id];
    }

    start(options) {
      injectStyles();
      this.stopped = false;
      if (!options || options.resetProgress !== false) {
        this.resetProgress();
        this.preWorkflowConfirmationShown = false;
        this.executionId = randomId();
        this.executionStartedAt = performance.now();
        this.workflowFinished = false;
        this.stepExecutionIds = {};
        this.stepStartedAt = {};
        this.emitAnalytics({ eventType: "workflow_start", status: "started" });
      }
      if (!this.preWorkflowConfirmationShown && this.guide.preWorkflowConfirmationEnabled && String(this.guide.preWorkflowConfirmationHtml || "").trim()) {
        this.preWorkflowConfirmationShown = true;
        this.runSteps([preWorkflowConfirmationStep(this.guide)], "pre", () => this.start({ resetProgress: false }));
        return;
      }
      const entrySteps = guideSteps(this.guide, false);
      const mainSteps = guideSteps(this.guide, true);
      const goalContext = resolveGoalContext(this.guide, mainSteps);
      if (goalContext && detectContext(goalContext).isOnGoalContext) {
        this.runSteps(mainSteps, "main");
        return;
      }
      if (entrySteps.length === 0) {
        this.waitForGoalThenMain(goalContext);
        return;
      }
      this.runSteps(entrySteps, "entry", () => this.waitForGoalThenMain(goalContext));
    }

    storageKey(phase) {
      return `scout-adoption-progress:${this.guide.id}:${phase}`;
    }

    resetProgress() {
      localStorage.removeItem(this.storageKey("pre"));
      localStorage.removeItem(this.storageKey("entry"));
      localStorage.removeItem(this.storageKey("main"));
    }

    clear() {
      console.log('🧹 clear() called');
      if (this.tooltip) {
        this.tooltip.__scoutCleanup?.();
        this.tooltip.remove();
      }
      if (this.highlighted) this.highlighted.classList.remove("scout-adoption-highlight");
      
      // Clean up any event listeners to prevent them from firing after going back
      if (this._eventCleanups) {
        console.log(`🧹 Cleaning up ${this._eventCleanups.length} event listeners`);
        this._eventCleanups.forEach(cleanup => cleanup());
        this._eventCleanups = [];
      } else {
        console.log('🧹 No event listeners to clean up');
      }
      
      document.querySelector(".scout-adoption-missing")?.remove();
      document.querySelector(".scout-adoption-recovery")?.remove();
      this.removeTargetArrow();
      this.tooltip = null;
      this.highlighted = null;
    }

    stop() {
      if (!this.workflowFinished && this.executionStartedAt) {
        this.emitAnalytics({ eventType: "workflow_abandoned", status: "abandoned", durationMs: Math.round(performance.now() - this.executionStartedAt) });
        
        // Fire cancellation event for orchestration
        window.dispatchEvent(new CustomEvent('scout-workflow-cancelled', {
          detail: {
            workflowId: this.guide.id,
            workflowTitle: this.guide.title,
            reason: 'user_cancelled'
          }
        }));
        console.log(`❌ Scout workflow cancelled by user: ${this.guide.title} (ID: ${this.guide.id})`);
      }
      this.stopped = true;
      this.preWorkflowConfirmationShown = false;
      this.clear();
      this.resetProgress();
    }

    runSteps(steps, phase, onComplete) {
      this.steps = steps || [];
      this.phase = phase;
      this.index = Number(localStorage.getItem(this.storageKey(phase)) || 0);
      this.render(onComplete);
    }

    async render(onComplete) {
      console.log(`🎬 render() called - index: ${this.index}, total steps: ${this.steps.length}`);
      this.clear();
      const step = this.steps[this.index];
      if (this.stopped) return;
      if (!step) {
        console.log('⚠️ No step found - workflow completing');
        console.log(`   workflowFinished: ${this.workflowFinished}, phase: ${this.phase}, onComplete: ${!!onComplete}`);
        localStorage.removeItem(this.storageKey(this.phase));
        if (!onComplete && this.phase === "main" && !this.workflowFinished) {
          this.workflowFinished = true;
          this.emitAnalytics({ eventType: "workflow_completed", status: "completed", durationMs: Math.round(performance.now() - this.executionStartedAt) });
          this.analytics?.flush?.();
          
          // Fire completion event for orchestration
          console.log(`🔥 FIRING scout-workflow-complete event - workflowId: ${this.guide.id}, title: ${this.guide.title}`);
          window.dispatchEvent(new CustomEvent('scout-workflow-complete', {
            detail: {
              workflowId: this.guide.id,
              workflowTitle: this.guide.title,
              success: true
            }
          }));
          console.log(`✅ Scout workflow completed: ${this.guide.title} (ID: ${this.guide.id})`);
        } else {
          console.log(`⏭️ Skipping completion event (onComplete: ${!!onComplete}, phase: ${this.phase}, finished: ${this.workflowFinished})`);
        }
        if (onComplete) await onComplete();
        return;
      }
      console.log(`📍 Rendering step ${this.index}: ${step.title || step.message || 'No title'}`);


      const stepExecutionId = this.stepExecutionId(step);
      this.stepStartedAt[step.id] = performance.now();
      this.emitAnalytics({
        eventType: "step_start",
        stepExecutionId,
        stepId: step.id,
        stepOrder: step.order || this.index + 1,
        actionType: step.trigger || step.type,
        status: "started"
      });

      if (step.type === "manualInstruction" && !hasTargetIdentity(step)) {
        this.showInstruction(step, onComplete);
        return;
      }

      const target = findTarget(step.target || {});
      if (!target) {
        this.showMissing(step, onComplete);
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
        onBack: () => this.previous(onComplete),
        onNext: () => this.next(onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      });

      if (step.type === "click" || step.trigger === "click") {
        if (step.autoClick === true && isSafeAutoClickTarget(target)) {
          await delay(AUTO_CLICK_PREVIEW_MS);
          if (this.stopped) return;
          target.click();
          if (!this.stopped) this.next(onComplete);
          return;
        }
        const advanceOnClick = (event) => {
          if (isScoutPlayerEvent(event)) return;
          target.removeEventListener("click", advanceOnClick);
          this.next(onComplete);
        };
        target.addEventListener("click", advanceOnClick);
      }

      if (step.type === "input" || ["input", "change", "blur", "focus"].includes(step.trigger)) {
        const eventName = ["change", "blur", "focus"].includes(step.trigger) ? step.trigger : "input";
        const onEvent = () => {
          // Ignore events from auto-fill (only real user interactions should advance)
          if (window.__scoutAutoFillInProgress) {
            console.log('⏭️ Ignoring auto-fill event (waiting for real user interaction)');
            return;  // Don't advance, don't remove listener
          }
          // Ignore events when user is clicking tooltip buttons (Back/Next/Close)
          if (this.tooltip && this.tooltip.__scoutTooltipInteracting) {
            console.log('⏭️ Ignoring event (user is clicking tooltip button)');
            return;  // Don't advance, don't remove listener
          }
          // Real user event - remove listener and advance
          console.log(`✅ Real user ${eventName} event detected - advancing workflow`);
          target.removeEventListener(eventName, onEvent);
          this.next(onComplete);
        };
        target.addEventListener(eventName, onEvent);
        console.log(`🎧 Added ${eventName} listener to element`);
        
        // Store cleanup function for when user goes back
        if (!this._eventCleanups) this._eventCleanups = [];
        this._eventCleanups.push(() => target.removeEventListener(eventName, onEvent));
        console.log(`📋 Stored cleanup function (total: ${this._eventCleanups.length})`);
      }
    }

    showInstruction(step, onComplete) {
      this.tooltip = createTooltip({
        title: step.title,
        message: step.message,
        index: this.index,
        total: this.steps.length,
        target: document.body,
        hideStepCount: this.phase === "pre",
        primaryLabel: this.phase === "pre" ? "Start" : undefined,
        onBack: () => this.previous(onComplete),
        onNext: () => this.next(onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      });
    }

    showMissing(step, onComplete) {
      this.emitAnalytics({
        eventType: "step_failed",
        stepExecutionId: this.stepExecutionId(step),
        stepId: step.id,
        stepOrder: step.order || this.index + 1,
        actionType: step.trigger || step.type,
        status: "failed",
        errorMessage: "Control not found",
        durationMs: Math.round(performance.now() - (this.stepStartedAt[step.id] || performance.now()))
      });
      this.emitAnalytics({
        eventType: "healing_attempted",
        stepExecutionId: this.stepExecutionId(step),
        stepId: step.id,
        stepOrder: step.order || this.index + 1,
        actionType: step.trigger || step.type,
        healingUsed: true
      });
      this.showAutoRecoveryLoading();
      window.setTimeout(() => this.trySmartRecovery(step, onComplete), 250);
    }

    showAutoRecoveryLoading() {
      this.showRecoveryPanel(`
        <div class="scout-adoption-recovery-head" data-drag-handle>
          <div class="scout-adoption-recovery-title"><span class="scout-adoption-recovery-grip" title="Drag this panel" aria-label="Drag this panel">${iconSvg("grip")}</span><span class="scout-adoption-recovery-spin"></span> AI auto healing</div>
        </div>
        <div class="scout-adoption-recovery-body">Control not found. Scout AI is auto-healing by finding the best replacement control.</div>
      `);
    }

    trySmartRecovery(step, onComplete) {
      this.emitAnalytics({
        eventType: "ai_provider_called",
        stepExecutionId: this.stepExecutionId(step),
        stepId: step.id,
        stepOrder: step.order || this.index + 1,
        actionType: step.trigger || step.type,
        healingUsed: true,
        aiUsed: true,
        metadata: { provider: "scout-runtime", mode: "auto-heal" }
      });
      const control = findVisibleControlByTerms(identityTerms(step.target, this.guide.title, step));
      if (!control) {
        this.showManualSelectionPrompt(step, onComplete);
        return;
      }
      control.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      control.classList.add("scout-adoption-highlight");
      this.highlighted = control;
      this.showTargetArrow(control);
      this.showSmartRecoveryConfirmation(step, control, onComplete);
    }

    showSmartRecoveryConfirmation(step, control, onComplete) {
      const banner = this.showRecoveryPanel(`
        <div class="scout-adoption-recovery-head" data-drag-handle>
          <div class="scout-adoption-recovery-title"><span class="scout-adoption-recovery-grip" title="Drag this panel" aria-label="Drag this panel">${iconSvg("grip")}</span><span class="scout-adoption-recovery-dot"></span> AI auto healing</div>
          <div class="scout-adoption-recovery-actions">
            ${iconButton("accept", "Accept AI-healed control", "check", true)}
            ${iconButton("pick", "Pick another control", "cursor")}
            ${iconButton("reject", "Reject AI-healed control", "x", false, true)}
            ${iconButton("skip", "Skip this step", "skip")}
            ${iconButton("close", "Close recovery panel", "close")}
          </div>
        </div>
        <div class="scout-adoption-recovery-body">
          Control not found. Scout AI auto-healed it and highlighted a replacement. Accept to continue and send it for trainer review.
        </div>
      `);
      banner.querySelector("[data-accept]").addEventListener("click", async () => {
        banner.remove();
        await this.acceptSmartRecovery(step, control, onComplete);
      });
      banner.querySelector("[data-pick]").addEventListener("click", () => {
        this.highlighted?.classList.remove("scout-adoption-highlight");
        this.removeTargetArrow();
        this.startManualControlSelection(step, onComplete);
      });
      banner.querySelector("[data-reject]").addEventListener("click", async () => {
        banner.remove();
        await this.rejectSmartRecovery(step, control);
        this.highlighted?.classList.remove("scout-adoption-highlight");
        this.removeTargetArrow();
        this.showManualSelectionPrompt(step, onComplete, "AI recovery suggestion rejected. Select the correct control or skip this step.");
      });
      banner.querySelector("[data-skip]").addEventListener("click", () => {
        banner.remove();
        this.highlighted?.classList.remove("scout-adoption-highlight");
        this.removeTargetArrow();
        this.recordSkippedRecovery(step);
        this.next(onComplete);
      });
      banner.querySelector("[data-close]").addEventListener("click", () => {
        banner.remove();
        this.removeTargetArrow();
      });
    }

    showManualSelectionPrompt(step, onComplete, message) {
      const banner = this.showRecoveryPanel(`
        <div class="scout-adoption-recovery-head" data-drag-handle>
          <div class="scout-adoption-recovery-title"><span class="scout-adoption-recovery-grip" title="Drag this panel" aria-label="Drag this panel">${iconSvg("grip")}</span><span class="scout-adoption-recovery-dot" style="background:#f59e0b;box-shadow:0 0 0 5px rgb(245 158 11 / .14);"></span> AI auto healing needs help</div>
          <div class="scout-adoption-recovery-actions">
            ${iconButton("pick", "Select the correct control", "cursor", true)}
            ${iconButton("retry", "Retry AI auto healing", "refresh")}
            ${iconButton("skip", "Skip this step", "skip")}
            ${iconButton("stop", "Stop this guide", "x", false, true)}
            ${iconButton("close", "Close recovery panel", "close")}
          </div>
        </div>
        <div class="scout-adoption-recovery-body">${escapeHtml(message || "Scout could not safely identify the control. You can select the best matching control and send it for trainer approval.")}</div>
      `);
      banner.querySelector("[data-pick]").addEventListener("click", () => this.startManualControlSelection(step, onComplete));
      banner.querySelector("[data-retry]").addEventListener("click", () => {
        this.showAutoRecoveryLoading();
        window.setTimeout(() => this.trySmartRecovery(step, onComplete), 250);
      });
      banner.querySelector("[data-skip]").addEventListener("click", () => {
        banner.remove();
        this.recordSkippedRecovery(step);
        this.next(onComplete);
      });
      banner.querySelector("[data-stop]").addEventListener("click", () => this.stop());
      banner.querySelector("[data-close]").addEventListener("click", () => banner.remove());
    }

    startManualControlSelection(step, onComplete) {
      const panel = this.showRecoveryPanel(`
        <div class="scout-adoption-recovery-head" data-drag-handle>
          <div class="scout-adoption-recovery-title"><span class="scout-adoption-recovery-grip" title="Drag this panel" aria-label="Drag this panel">${iconSvg("grip")}</span><span class="scout-adoption-recovery-dot" style="background:#f59e0b;box-shadow:0 0 0 5px rgb(245 158 11 / .14);"></span> Select replacement control</div>
          <div class="scout-adoption-recovery-actions">
            ${iconButton("cancel", "Cancel manual selection", "close")}
          </div>
        </div>
        <div class="scout-adoption-recovery-body">Click the control that should be used for this step. The selection will be sent for trainer approval.</div>
      `);
      let hovered = null;
      const cleanup = () => {
        hovered?.classList.remove("scout-adoption-pick-candidate");
        document.removeEventListener("pointerover", onPointerOver, true);
        document.removeEventListener("click", onClick, true);
      };
      const onPointerOver = (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("button, a[href], input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [tabindex]:not([tabindex='-1'])") : null;
        if (!(target instanceof HTMLElement) || target.closest(".scout-adoption-recovery-panel, .scout-adoption-tooltip")) return;
        hovered?.classList.remove("scout-adoption-pick-candidate");
        hovered = target;
        hovered.classList.add("scout-adoption-pick-candidate");
      };
      const onClick = (event) => {
        const target = event.target instanceof HTMLElement ? event.target.closest("button, a[href], input, select, textarea, [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [tabindex]:not([tabindex='-1'])") : null;
        if (!(target instanceof HTMLElement) || target.closest(".scout-adoption-recovery-panel, .scout-adoption-tooltip")) return;
        event.preventDefault();
        event.stopPropagation();
        cleanup();
        target.classList.remove("scout-adoption-pick-candidate");
        target.classList.add("scout-adoption-highlight");
        this.highlighted = target;
        this.showSmartRecoveryConfirmation(step, target, onComplete);
      };
      panel.querySelector("[data-cancel]").addEventListener("click", () => {
        cleanup();
        this.showManualSelectionPrompt(step, onComplete);
      });
      document.addEventListener("pointerover", onPointerOver, true);
      document.addEventListener("click", onClick, true);
    }

    async acceptSmartRecovery(step, control, onComplete) {
      const proposedTarget = buildTargetFromElement(control);
      const proposedSelectorCandidates = proposedTarget.selectorCandidates;
      const proposedElementIdentity = proposedTarget.elementIdentity;
      const originalIdentity = {
        ...(step.target || {}),
        selectorCandidates: step.target?.selectorCandidates || []
      };

      try {
        const response = await fetch("/api/guided-workflow-player/healing-suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: this.guide.id,
            stepId: step.id,
            stepOrder: step.order || this.index + 1,
            originalIdentity,
            proposedElementIdentity,
            proposedTarget,
            proposedSelectorCandidates,
            confidenceScore: 75,
            healingSource: "rule-based",
            healingReason: "User accepted AI auto-healing suggestion",
            pageUrl: window.location.href,
            pageTitle: document.title
          })
        });
        if (!response.ok) throw new Error(response.statusText);
        this.emitAnalytics({
          eventType: "healing_succeeded",
          stepExecutionId: this.stepExecutionId(step),
          stepId: step.id,
          stepOrder: step.order || this.index + 1,
          actionType: step.trigger || step.type,
          healingUsed: true,
          aiUsed: true
        });
        this.showRecovery("Accepted. Saved for trainer review. Continuing...");
      } catch (error) {
        console.error("[Scout Smart Recovery] Failed to save accepted match", error);
        this.showRecovery("Accepted. Continuing with highlighted control.");
      }

      await delay(500);
      this.continueWithRecoveredControl(step, control, onComplete);
    }

    async rejectSmartRecovery(step, control) {
      try {
        await fetch("/api/guided-workflow-player/healing-suggestions/reject-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: this.guide.id,
            stepId: step.id,
            stepOrder: step.order || this.index + 1,
            rejectedElement: {
              tagName: control.tagName.toLowerCase(),
              text: readableText(control.innerText || control.textContent).slice(0, 200),
              ariaLabel: control.getAttribute("aria-label") || undefined,
              id: control.id || undefined,
              className: typeof control.className === "string" ? control.className : undefined,
              elementIdentity: buildElementIdentity(control)
            },
            userAction: "reject",
            pageUrl: window.location.href,
            pageTitle: document.title,
            reason: "User rejected AI auto-healing suggestion"
          })
        });
      } catch (error) {
        console.error("[Scout Smart Recovery] Failed to record rejection", error);
      }
    }

    async recordSkippedRecovery(step) {
      try {
        await fetch("/api/guided-workflow-player/healing-suggestions/reject-recovery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workflowId: this.guide.id,
            stepId: step.id,
            stepOrder: step.order || this.index + 1,
            rejectedElement: null,
            userAction: "skip",
            pageUrl: window.location.href,
            pageTitle: document.title,
            reason: "Control not found and user skipped this step"
          })
        });
      } catch (error) {
        console.error("[Scout Smart Recovery] Failed to record skipped step", error);
      }
    }

    showRecoveryPanel(html) {
      document.querySelector(".scout-adoption-recovery")?.remove();
      const panel = document.createElement("div");
      panel.className = "scout-adoption-recovery scout-adoption-recovery-panel";
      panel.innerHTML = html;
      document.body.appendChild(panel);
      this.attachRecoveryPanelDrag(panel);
      return panel;
    }

    showTargetArrow(control) {
      document.querySelector(".scout-adoption-target-arrow")?.remove();
      const arrow = document.createElement("div");
      arrow.className = "scout-adoption-target-arrow";
      arrow.textContent = "AI match";
      document.body.appendChild(arrow);
      const position = () => {
        if (!arrow.isConnected) return;
        const rect = control.getBoundingClientRect();
        const left = Math.min(window.innerWidth - arrow.offsetWidth - 8, Math.max(8, rect.left + rect.width / 2 - arrow.offsetWidth / 2));
        const top = Math.max(8, rect.top - arrow.offsetHeight - 12);
        arrow.style.left = `${left}px`;
        arrow.style.top = `${top}px`;
      };
      position();
      window.addEventListener("scroll", position, true);
      window.addEventListener("resize", position);
      arrow.__scoutCleanup = () => {
        window.removeEventListener("scroll", position, true);
        window.removeEventListener("resize", position);
      };
    }

    removeTargetArrow() {
      const arrow = document.querySelector(".scout-adoption-target-arrow");
      arrow?.__scoutCleanup?.();
      arrow?.remove();
    }

    attachRecoveryPanelDrag(panel) {
      const handle = panel.querySelector("[data-drag-handle]") || panel;
      let startX = 0;
      let startY = 0;
      let startLeft = 0;
      let startTop = 0;
      const onMove = (event) => {
        const left = Math.min(window.innerWidth - panel.offsetWidth - 8, Math.max(8, startLeft + event.clientX - startX));
        const top = Math.min(window.innerHeight - panel.offsetHeight - 8, Math.max(8, startTop + event.clientY - startY));
        panel.style.left = `${left}px`;
        panel.style.top = `${top}px`;
        panel.style.bottom = "auto";
        panel.style.transform = "none";
      };
      const onUp = () => {
        panel.dataset.dragging = "false";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      handle.addEventListener("pointerdown", (event) => {
        if (event.target instanceof HTMLElement && event.target.closest("button")) return;
        const rect = panel.getBoundingClientRect();
        startX = event.clientX;
        startY = event.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        panel.dataset.dragging = "true";
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp, { once: true });
      });
    }

    continueWithRecoveredControl(step, control, onComplete) {
      this.clear();
      control.classList.add("scout-adoption-highlight");
      focusTarget(control);
      this.highlighted = control;
      this.tooltip = createTooltip({
        title: step.title,
        message: step.message,
        index: this.index,
        total: this.steps.length,
        target: control,
        onBack: () => this.previous(onComplete),
        onNext: () => this.next(onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      });

      if (step.type === "click" || step.trigger === "click") {
        const advanceOnClick = (event) => {
          if (isScoutPlayerEvent(event)) return;
          control.removeEventListener("click", advanceOnClick);
          this.next(onComplete);
        };
        control.addEventListener("click", advanceOnClick);
      }

      if (step.type === "input" || ["input", "change", "blur", "focus"].includes(step.trigger)) {
        const eventName = ["change", "blur", "focus"].includes(step.trigger) ? step.trigger : "input";
        const onEvent = () => {
          // Ignore events from auto-fill (only real user interactions should advance)
          if (window.__scoutAutoFillInProgress) {
            console.log('⏭️ Ignoring auto-fill event (waiting for real user interaction)');
            return;  // Don't advance, don't remove listener
          }
          // Ignore events when user is clicking tooltip buttons (Back/Next/Close)
          if (this.tooltip && this.tooltip.__scoutTooltipInteracting) {
            console.log('⏭️ Ignoring event (user is clicking tooltip button)');
            return;  // Don't advance, don't remove listener
          }
          // Real user event - remove listener and advance
          console.log(`✅ Real user ${eventName} event detected - advancing workflow`);
          control.removeEventListener(eventName, onEvent);
          this.next(onComplete);
        };
        control.addEventListener(eventName, onEvent);
        console.log(`🎧 Added ${eventName} listener to recovered control`);
        
        // Store cleanup function for when user goes back
        if (!this._eventCleanups) this._eventCleanups = [];
        this._eventCleanups.push(() => control.removeEventListener(eventName, onEvent));
        console.log(`📋 Stored cleanup function (total: ${this._eventCleanups.length})`);
      }
    }

    showRecovery(message) {
      const banner = this.showRecoveryPanel(`
        <div class="scout-adoption-recovery-body" style="text-align:center;">${escapeHtml(message)}</div>
      `);
      banner.classList.add("scout-adoption-recovery-toast");
    }

    openGuideLink(guideId) {
      const guide = this.guideResolver ? this.guideResolver(guideId) : null;
      if (!guide) return;
      this.stop();
      new Player(guide, this.guideResolver, this.analytics).start();
    }

    previous(onComplete) {
      console.log('⬅️ Back button clicked - going to previous step');
      console.log(`   Current index: ${this.index}, will go to: ${Math.max(0, this.index - 1)}`);
      this.index = Math.max(0, this.index - 1);
      localStorage.setItem(this.storageKey(this.phase), String(this.index));
      this.render(onComplete);
    }

    next(onComplete) {
      console.log(`➡️ next() called - current index: ${this.index}, total steps: ${this.steps.length}`);
      const step = this.steps[this.index];
      if (step) {
        console.log(`   Completing step ${this.index}: ${step.title || step.message || 'No title'}`);
        this.emitAnalytics({
          eventType: "step_completed",
          stepExecutionId: this.stepExecutionId(step),
          stepId: step.id,
          stepOrder: step.order || this.index + 1,
          actionType: step.trigger || step.type,
          status: "completed",
          durationMs: Math.round(performance.now() - (this.stepStartedAt[step.id] || performance.now()))
        });
      }
      this.index += 1;
      console.log(`   New index after increment: ${this.index}`);
      localStorage.setItem(this.storageKey(this.phase), String(this.index));
      this.render(onComplete);
    }

    async waitForGoalThenMain(goalContext) {
      if (!goalContext) {
        this.runSteps(guideSteps(this.guide, true), "main");
        return;
      }
      const ok = await waitForCondition(() => detectContext(goalContext).isOnGoalContext, GOAL_TIMEOUT_MS);
      if (!ok) {
        this.emitAnalytics({ eventType: "workflow_failed", status: "failed", durationMs: Math.round(performance.now() - this.executionStartedAt), errorMessage: "Goal context was not reached" });
        this.trySmartRecovery({ title: this.guide.title, message: "Navigate to the target page to continue.", target: contextTarget(goalContext) || {} });
        return;
      }
      this.runSteps(guideSteps(this.guide, true), "main");
    }
  }

  async function loadGuides(options) {
    const url = new URL("/api/guided-workflow-player/guides", options.scoutBaseUrl || window.location.origin);
    url.searchParams.set("targetAppId", options.targetAppId);
    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload && payload.message ? payload.message : "Unable to load guided workflows.");
    return payload.guides || [];
  }

  function showLauncher(guides, guideResolver, analytics) {
    injectStyles();
    const launcher = document.createElement("button");
    launcher.className = "scout-adoption-launcher";
    launcher.type = "button";
    launcher.textContent = "Guides";
    launcher.addEventListener("click", () => {
      const existing = document.querySelector(".scout-adoption-menu");
      if (existing) return existing.remove();
      const menu = document.createElement("div");
      menu.className = "scout-adoption-menu";
      guides.forEach((guide) => {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = guide.title;
        item.addEventListener("click", () => {
          menu.remove();
          new Player(guide, guideResolver, analytics).start();
        });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
    });
    document.body.appendChild(launcher);
  }

  /**
   * Global notification helper - shows styled toast messages
   * @param {Object} options - Notification options
   * @param {string} options.message - Message text to display
   * @param {string} options.type - Message type: 'info', 'warning', 'error', 'success'
   * @param {number} [options.duration] - Auto-hide duration in ms (0 = no auto-hide)
   * @returns {HTMLElement} The notification element
   */
  function showScoutNotification(options) {
    const { message, type = 'info', duration = 5000 } = options;
    
    // Remove existing notifications
    document.querySelectorAll('.scout-adoption-recovery-toast').forEach(el => el.remove());
    
    // Icon and color based on type
    const icons = {
      info: '💡',
      warning: '⚠️',
      error: '❌',
      success: '✅'
    };
    const icon = icons[type] || icons.info;
    
    // Color schemes by type
    const colors = {
      info: {
        bg: 'rgb(219 234 254 / 0.95)',
        border: 'rgb(59 130 246 / 0.5)',
        text: '#1e3a8a'
      },
      warning: {
        bg: 'rgb(254 252 232 / 0.95)',
        border: 'rgb(234 179 8 / 0.6)',
        text: '#713f12'
      },
      error: {
        bg: 'rgb(254 226 226 / 0.95)',
        border: 'rgb(239 68 68 / 0.6)',
        text: '#7f1d1d'
      },
      success: {
        bg: 'rgb(220 252 231 / 0.95)',
        border: 'rgb(34 197 94 / 0.5)',
        text: '#14532d'
      }
    };
    const colorScheme = colors[type] || colors.info;
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'scout-adoption-recovery scout-adoption-recovery-panel scout-adoption-recovery-toast';
    notification.style.background = colorScheme.bg;
    notification.style.borderColor = colorScheme.border;
    notification.style.color = colorScheme.text;
    notification.style.position = 'relative';
    notification.innerHTML = `
      <button type="button" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border: none; background: rgba(0,0,0,0.1); border-radius: 50%; cursor: pointer; font-size: 16px; line-height: 1; color: inherit; display: grid; place-items: center; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.1)'" aria-label="Close">&times;</button>
      <div class="scout-adoption-recovery-body" style="text-align:center; padding-right: 24px;">
        <div style="font-size: 18px; margin-bottom: 6px;">${icon}</div>
        <div style="white-space: pre-line;">${escapeHtml(message)}</div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // Close button handler
    const closeButton = notification.querySelector('button');
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation();
      notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      notification.style.opacity = '0';
      notification.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => notification.remove(), 300);
    });
    
    // Auto-hide for non-error messages (errors require manual dismissal)
    if (duration > 0 && type !== 'error') {
      setTimeout(() => {
        if (notification.isConnected) {
          notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          notification.style.opacity = '0';
          notification.style.transform = 'translateX(-50%) translateY(-10px)';
          setTimeout(() => notification.remove(), 300);
        }
      }, duration);
    }
    
    // Allow manual dismissal by clicking anywhere (for convenience)
    notification.addEventListener('click', (e) => {
      if (e.target !== closeButton && !closeButton.contains(e.target)) {
        notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(-50%) translateY(-10px)';
      setTimeout(() => notification.remove(), 300);
    });
    
    return notification;
  }

  // Expose notification helper globally
  window.showScoutNotification = showScoutNotification;

  window.ScoutAdoptionPlayer = {
    smartRuntime: true,
    version: PLAYER_VERSION,
    async init(options) {
      const config = Object.assign({}, DEFAULTS, options || {});
      if (!config.targetAppId) throw new Error("targetAppId is required.");
      const guides = await loadGuides(config);
      const guideResolver = (guideId) => guides.find((item) => item.id === guideId);
      const analytics = createAnalytics(config);
      if (config.autoShowLauncher && guides.length > 0) showLauncher(guides, guideResolver, analytics);
      return {
        version: PLAYER_VERSION,
        guides,
        detectContext,
        play(guideId) {
          const guide = guides.find((item) => item.id === guideId) || guides[0];
          if (guide) new Player(guide, guideResolver, analytics).start();
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
