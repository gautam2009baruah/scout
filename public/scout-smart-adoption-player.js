(function () {
  const DEFAULTS = { scoutBaseUrl: "", targetAppId: "", autoShowLauncher: true };
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

  function identityTerms(target, guideTitle) {
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
    return controls.find((control) => {
      if (!isVisible(control)) return false;
      const text = compactText(directElementText(control));
      return normalized.some((term) => text.includes(term));
    }) || null;
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
      .scout-adoption-tooltip[data-placement="bottom"] .scout-adoption-tooltip__arrow { top: -7px; left: var(--arrow-left, 22px); border-right: 0; border-bottom: 0; }
      .scout-adoption-tooltip[data-placement="top"] .scout-adoption-tooltip__arrow { bottom: -7px; left: var(--arrow-left, 22px); border-left: 0; border-top: 0; }
      .scout-adoption-tooltip[data-placement="right"] .scout-adoption-tooltip__arrow { left: -7px; top: var(--arrow-top, 20px); border-right: 0; border-top: 0; }
      .scout-adoption-tooltip[data-placement="left"] .scout-adoption-tooltip__arrow { right: -7px; top: var(--arrow-top, 20px); border-left: 0; border-bottom: 0; }
      .scout-adoption-missing { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647; max-width: min(620px, calc(100vw - 32px)); border-radius: 8px; background: #020617; color: #fff; padding: 12px 14px; font: 14px system-ui, sans-serif; box-shadow: 0 18px 52px rgb(15 23 42 / .28); }
      .scout-adoption-missing button { margin-left: 8px; border: 1px solid #475569; border-radius: 6px; background: #fff; padding: 5px 8px; color: #020617; cursor: pointer; }
    `;
    document.head.appendChild(style);
  }

  function createTooltip(input) {
    const tooltip = document.createElement("div");
    tooltip.className = "scout-adoption-tooltip";
    tooltip.innerHTML = `
      <div class="scout-adoption-tooltip__arrow"></div>
      <button type="button" class="scout-adoption-tooltip__close" data-close aria-label="Close guide">&times;</button>
      <div class="scout-adoption-tooltip__message"></div>
      <div class="scout-adoption-footer">
        <span>${input.index + 1} / ${input.total}</span>
        <span>
          ${input.index > 0 ? "<button type=\"button\" data-back>Back</button>" : ""}
          <button type="button" data-next>${input.index + 1 === input.total ? "Done" : "Next"}</button>
        </span>
      </div>
    `;
    tooltip.querySelector(".scout-adoption-tooltip__message").innerHTML = sanitizeGuideHtml(input.message || "");
    tooltip.querySelectorAll('a[href^="#scout-guide:"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const guideId = (link.getAttribute("href") || "").replace(/^#scout-guide:/, "");
        if (!guideId || !input.onGuideLink) return;
        event.preventDefault();
        input.onGuideLink(guideId);
      });
    });
    tooltip.querySelector("[data-back]")?.addEventListener("click", input.onBack);
    tooltip.querySelector("[data-next]").addEventListener("click", input.onNext);
    tooltip.querySelector("[data-close]").addEventListener("click", input.onClose);
    document.body.appendChild(tooltip);
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
        const allowedHref = element.tagName === "A" && attribute.name === "href" && /^(https?:\/\/|\/|#scout-guide:)/i.test(attribute.value);
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
        } else if (!allowedHref && !allowedImageSrc && !allowedFont && !allowedTableAttribute && !allowedMediaAttribute) {
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

    tooltip.__scoutCleanup = () => {
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }

  function positionTooltip(tooltip, target) {
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

  class Player {
    constructor(guide, guideResolver) {
      this.guide = guide;
      this.guideResolver = guideResolver;
      this.index = 0;
      this.steps = [];
      this.phase = "main";
      this.tooltip = null;
      this.highlighted = null;
      this.stopped = false;
    }

    start(options) {
      injectStyles();
      this.stopped = false;
      if (!options || options.resetProgress !== false) this.resetProgress();
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
      localStorage.removeItem(this.storageKey("entry"));
      localStorage.removeItem(this.storageKey("main"));
    }

    clear() {
      if (this.tooltip) {
        this.tooltip.__scoutCleanup?.();
        this.tooltip.remove();
      }
      if (this.highlighted) this.highlighted.classList.remove("scout-adoption-highlight");
      document.querySelector(".scout-adoption-missing")?.remove();
      this.tooltip = null;
      this.highlighted = null;
    }

    stop() {
      this.stopped = true;
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
      this.clear();
      const step = this.steps[this.index];
      if (this.stopped) return;
      if (!step) {
        localStorage.removeItem(this.storageKey(this.phase));
        if (onComplete) await onComplete();
        return;
      }

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
        target.addEventListener("click", () => this.next(onComplete), { once: true });
      }

      if (step.type === "input" || ["input", "change", "blur", "focus"].includes(step.trigger)) {
        const eventName = ["change", "blur", "focus"].includes(step.trigger) ? step.trigger : "input";
        target.addEventListener(eventName, () => this.next(onComplete), { once: true });
      }
    }

    showInstruction(step, onComplete) {
      this.tooltip = createTooltip({
        title: step.title,
        message: step.message,
        index: this.index,
        total: this.steps.length,
        target: document.body,
        onBack: () => this.previous(onComplete),
        onNext: () => this.next(onComplete),
        onClose: () => this.stop(),
        onGuideLink: (guideId) => this.openGuideLink(guideId)
      });
    }

    showMissing(step, onComplete) {
      const banner = document.createElement("div");
      banner.className = "scout-adoption-missing";
      banner.innerHTML = `Element not found on this page <button type="button" data-retry>Retry</button><button type="button" data-skip>Skip</button><button type="button" data-stop>Stop</button><button type="button" data-recover>Try Smart Recovery</button>`;
      banner.querySelector("[data-retry]").addEventListener("click", () => this.render(onComplete));
      banner.querySelector("[data-skip]").addEventListener("click", () => this.next(onComplete));
      banner.querySelector("[data-stop]").addEventListener("click", () => this.stop());
      banner.querySelector("[data-recover]").addEventListener("click", () => this.trySmartRecovery(step));
      document.body.appendChild(banner);
    }

    trySmartRecovery(step) {
      const control = findVisibleControlByTerms(identityTerms(step.target, this.guide.title).concat(String(step.title || "").split(/\s+/)));
      if (!control) {
        this.showRecovery("I could not find a safe matching control. Navigate closer to the target page, then retry.");
        return;
      }
      control.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      control.classList.add("scout-adoption-highlight");
      this.highlighted = control;
      this.showRecovery(`I found ${control.innerText || control.getAttribute("aria-label") || "a matching control"}. Click it to continue.`);
    }

    showRecovery(message) {
      document.querySelector(".scout-adoption-recovery")?.remove();
      const banner = document.createElement("div");
      banner.className = "scout-adoption-missing scout-adoption-recovery";
      banner.textContent = message;
      document.body.appendChild(banner);
    }

    openGuideLink(guideId) {
      const guide = this.guideResolver ? this.guideResolver(guideId) : null;
      if (!guide) return;
      this.stop();
      new Player(guide, this.guideResolver).start();
    }

    previous(onComplete) {
      this.index = Math.max(0, this.index - 1);
      localStorage.setItem(this.storageKey(this.phase), String(this.index));
      this.render(onComplete);
    }

    next(onComplete) {
      this.index += 1;
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

  function showLauncher(guides, guideResolver) {
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
          new Player(guide, guideResolver).start();
        });
        menu.appendChild(item);
      });
      document.body.appendChild(menu);
    });
    document.body.appendChild(launcher);
  }

  window.ScoutAdoptionPlayer = {
    smartRuntime: true,
    async init(options) {
      const config = Object.assign({}, DEFAULTS, options || {});
      if (!config.targetAppId) throw new Error("targetAppId is required.");
      const guides = await loadGuides(config);
      const guideResolver = (guideId) => guides.find((item) => item.id === guideId);
      if (config.autoShowLauncher && guides.length > 0) showLauncher(guides, guideResolver);
      return {
        guides,
        detectContext,
        play(guideId) {
          const guide = guides.find((item) => item.id === guideId) || guides[0];
          if (guide) new Player(guide, guideResolver).start();
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
