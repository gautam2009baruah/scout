/**
 * Automated Browser Workflow Executor
 * Handles browser-based workflow execution with login detection and Scout player injection
 */

import puppeteer, { Browser, Page } from "puppeteer";
import type { RecordedAction, GuideStep } from "@/shared/guideTypes";
import { existsSync, readFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type BrowserExecutionOptions = {
  workflowId: string;
  targetUrl: string;
  steps: RecordedAction[];
  parameters: Record<string, unknown>;
  timeout?: number;
  headless?: boolean;
  closeBrowserAfter?: boolean; // Whether to close browser page after completion
};

export type BrowserExecutionResult = {
  success: boolean;
  executionId: string;
  status: "completed" | "failed" | "timeout" | "login_required";
  output?: Record<string, unknown>;
  error?: string;
  screenshot?: string;
  duration?: number;
  page?: Page; // Browser page reference (if not closed)
};

let globalBrowser: Browser | null = null;

/**
 * Get Edge executable path for Windows
 */
function getEdgeExecutablePath(): string | undefined {
  const edgePaths = [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    process.env.LOCALAPPDATA + "\\Microsoft\\Edge\\Application\\msedge.exe",
  ];

  for (const path of edgePaths) {
    try {
      if (existsSync(path)) {
        console.log(`✅ Found Edge browser at: ${path}`);
        return path;
      }
    } catch (e) {
      // Continue to next path
    }
  }

  console.log("⚠️ Edge not found, falling back to Chrome");
  return undefined;
}

/**
 * Get or create browser instance with session persistence
 */
async function getBrowser(headless: boolean = false): Promise<Browser> {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    const edgePath = getEdgeExecutablePath();
    
    // Create persistent user data directory to preserve sessions
    const userDataDir = join(tmpdir(), "scout-orchestration-browser");
    
    try {
      if (!existsSync(userDataDir)) {
        mkdirSync(userDataDir, { recursive: true });
        console.log(`📁 Created browser profile directory: ${userDataDir}`);
      } else {
        console.log(`📁 Reusing browser profile directory: ${userDataDir}`);
        console.log(`✨ Session data (cookies, login state) will be preserved`);
      }
    } catch (e) {
      console.warn(`⚠️ Could not create user data directory, sessions won't persist`);
    }
    
    globalBrowser = await puppeteer.launch({
      headless: headless, // true or false
      executablePath: edgePath, // Use Edge if found, otherwise Chromium
      userDataDir: userDataDir, // Persist sessions across runs
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
      defaultViewport: {
        width: 1920,
        height: 1080,
      },
    });
    
    console.log(`✅ Browser launched (session persistence enabled)`);
  } else {
    console.log(`🔄 Reusing existing browser instance`);
  }
  return globalBrowser;
}

/**
 * Check if current page is a login page
 */
async function isLoginPage(page: Page): Promise<boolean> {
  try {
    const url = page.url().toLowerCase();
    const title = (await page.title()).toLowerCase();

    console.log(`🔍 Checking if login page: URL=${url}, Title=${title}`);

    // Check URL patterns
    const urlPatterns = [
      "login",
      "signin",
      "sign-in",
      "auth",
      "authentication",
      "sso",
      "oauth",
    ];
    const urlMatch = urlPatterns.some((pattern) => url.includes(pattern));
    if (urlMatch) {
      console.log(`✅ Login page detected via URL pattern`);
      return true;
    }

    // Check page title
    const titlePatterns = ["login", "sign in", "log in", "authentication"];
    const titleMatch = titlePatterns.some((pattern) => title.includes(pattern));
    if (titleMatch) {
      console.log(`✅ Login page detected via title pattern`);
      return true;
    }

    // Check for common login form elements
    const hasPasswordField = await page.$('input[type="password"]').then((el) => !!el);
    const hasLoginButton = await page
      .$(
        'button[type="submit"], input[type="submit"]'
      )
      .then((el) => !!el);

    if (hasPasswordField && hasLoginButton) {
      console.log(`✅ Login page detected via password field + submit button`);
      return true;
    }

    console.log(`❌ Not a login page`);
    return false;
  } catch (error) {
    console.error("Error detecting login page:", error);
    return false;
  }
}

/**
 * Wait for user to complete login manually
 */
async function waitForUserLogin(
  page: Page,
  targetUrl: string,
  timeout: number = 300000 // 5 minutes default
): Promise<boolean> {
  console.log("🔐 ============================================");
  console.log("⏳ LOGIN REQUIRED - Please login in the browser");
  console.log("🔐 ============================================");
  console.log("⏱️ Waiting up to 5 minutes for you to complete login...");

  const startTime = Date.now();
  let checkCount = 0;

  // Poll every 2 seconds to check if user has logged in
  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    checkCount++;

    const currentUrl = page.url();
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    
    console.log(`⏳ Check ${checkCount}: Still waiting... (${elapsed}s elapsed, URL: ${currentUrl})`);

    const stillOnLoginPage = await isLoginPage(page);

    // Check if user has navigated away from login page
    if (!stillOnLoginPage) {
      console.log("✅ ============================================");
      console.log("✅ LOGIN SUCCESSFUL - Continuing workflow...");
      console.log("✅ ============================================");
      return true;
    }

    // Check if we're on the target URL or close to it
    try {
      const targetHostname = new URL(targetUrl).hostname;
      if (currentUrl.includes(targetHostname) && !stillOnLoginPage) {
        console.log("✅ Navigated to target domain, proceeding...");
        return true;
      }
    } catch (e) {
      // Invalid URL, continue waiting
    }
  }

  console.log("⏱️ ============================================");
  console.log("⏱️ LOGIN TIMEOUT - User did not complete login");
  console.log("⏱️ ============================================");
  return false;
}

/**
 * Match parameters to workflow steps using intelligent matching
 * Returns a map of step index to action instruction
 */
function matchParametersToSteps(
  steps: RecordedAction[],
  parameters: Record<string, unknown>
): Map<number, { action: string; value?: string }> {
  const stepActions = new Map<number, { action: string; value?: string }>();

  console.log("\n" + "▓".repeat(80));
  console.log("🔍 MATCHING PARAMETERS TO WORKFLOW STEPS");
  console.log("▓".repeat(80));
  
  if (!parameters || Object.keys(parameters).length === 0) {
    console.log("⚠️  No parameters to match");
    console.log("▓".repeat(80) + "\n");
    return stepActions;
  }
  
  console.log(`Parameters: ${Object.keys(parameters).join(", ")}`);
  console.log("");

  for (const [paramKey, paramValue] of Object.entries(parameters)) {
    // NEW LOGIC:
    // - paramKey = instruction for finding element (e.g., "fill training session title textbox")
    // - paramValue = actual data from trigger (e.g., "My Training Session")
    
    const searchInstruction = paramKey.toLowerCase().trim();
    const fillValue = String(paramValue).trim();

    console.log(`\n📌 Mapping:`);
    console.log(`   Find element: "${paramKey}"`);
    console.log(`   Fill with: "${fillValue}"`);

    // Parse the search instruction to determine action
    let action = "fill"; // Default to fill
    let searchKeywords = searchInstruction;

    // Check if instruction starts with action keywords
    if (searchInstruction.startsWith("click ") || searchInstruction.startsWith("press ")) {
      action = "click";
      searchKeywords = searchInstruction.replace(/^(click|press)\s+/i, "");
    } else if (searchInstruction.startsWith("skip ")) {
      action = "skip";
      searchKeywords = searchInstruction.replace(/^skip\s+/i, "");
    } else if (searchInstruction.startsWith("fill ") || searchInstruction.startsWith("enter ") || 
               searchInstruction.startsWith("type ")) {
      action = "fill";
      searchKeywords = searchInstruction.replace(/^(fill|enter|type)\s+/i, "");
    }

    // Clean up quotes from search keywords
    searchKeywords = searchKeywords.replace(/["']/g, "").trim();

    console.log(`   Action: ${action}`);
    console.log(`   Search keywords: "${searchKeywords}"`);

    // Try to find matching step using search keywords
    let matchedIndex = -1;
    let matchReason = "";

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      // Build searchable text from step metadata
      const searchTexts = [
        step.stepDescription?.toLowerCase() || "",
        step.elementIdentity?.labelText?.toLowerCase() || "",
        step.elementIdentity?.placeholder?.toLowerCase() || "",
        step.elementIdentity?.ariaLabel?.toLowerCase() || "",
        step.elementIdentity?.name?.toLowerCase() || "",
        step.elementIdentity?.id?.toLowerCase() || "",
      ].filter(Boolean);

      const combinedText = searchTexts.join(" ");

      // Extract significant keywords (3+ characters, skip common words)
      const keywords = searchKeywords
        .split(/\s+/)
        .filter(word => word.length >= 3 && !["the", "and", "with", "for"].includes(word));

      if (keywords.length === 0) {
        // If no significant keywords, use the whole search string
        if (combinedText.includes(searchKeywords)) {
          matchedIndex = i;
          matchReason = "full phrase match";
          break;
        }
        continue;
      }

      // Count how many keywords match
      const matchCount = keywords.filter(keyword => combinedText.includes(keyword)).length;
      const matchPercentage = matchCount / keywords.length;

      // High confidence: all keywords match
      if (matchCount === keywords.length) {
        matchedIndex = i;
        matchReason = `all ${keywords.length} keywords matched`;
        break;
      }

      // Medium confidence: at least 70% of keywords match
      if (matchPercentage >= 0.7 && matchedIndex === -1) {
        matchedIndex = i;
        matchReason = `${matchCount}/${keywords.length} keywords matched (${Math.round(matchPercentage * 100)}%)`;
        // Don't break - keep looking for a better match
      }
    }

    if (matchedIndex >= 0) {
      // Use fillValue from trigger, not from instruction
      stepActions.set(matchedIndex, { action, value: fillValue });
      
      console.log(`   ✅ MATCHED at step ${matchedIndex + 1} (${matchReason})`);
      console.log(`   Step description: "${steps[matchedIndex].stepDescription}"`);
      
      if (action === "fill") {
        console.log(`   → Will auto-fill with: "${fillValue}"`);
      } else if (action === "click") {
        console.log(`   → Will auto-click`);
      } else if (action === "skip") {
        console.log(`   → Will skip (manual interaction)`);
      }
    } else {
      console.log(`   ❌ NO MATCH FOUND`);
      console.log(`   Could not find step matching: "${searchKeywords}"`);
    }
  }

  console.log("\n📊 MATCHING SUMMARY:");
  console.log(`   Total mappings: ${Object.keys(parameters).length}`);
  console.log(`   Matched: ${stepActions.size}`);
  console.log(`   Unmatched: ${Object.keys(parameters).length - stepActions.size}`);
  console.log("▓".repeat(80) + "\n");

  // If only one mapping and one input step, auto-match as fallback
  if (parameters && Object.keys(parameters).length === 1 && stepActions.size === 0) {
    const inputSteps = steps.filter(s => s.type === "input" || s.type === "change");
    if (inputSteps.length === 1) {
      const inputIndex = steps.indexOf(inputSteps[0]);
      const [paramKey, paramValue] = Object.entries(parameters)[0];
      const fillValue = String(paramValue);
      
      // Determine action from the key
      const keyLower = paramKey.toLowerCase();
      let action = "fill";
      
      if (keyLower.includes("click") || keyLower.includes("press")) {
        action = "click";
      } else if (keyLower.includes("skip")) {
        action = "skip";
      }
      
      stepActions.set(inputIndex, { action, value: fillValue });
      console.log(`   ℹ️  Fallback: Auto-matched single mapping to single input step ${inputIndex + 1}`);
      console.log(`   → Will ${action} with value: "${fillValue}"`);
    }
  }

  return stepActions;
}

/**
 * Inject Scout Player and execute workflow
 */
async function injectAndExecuteScoutPlayer(
  page: Page,
  workflowId: string,
  workflowTitle: string,
  steps: RecordedAction[],
  parameters: Record<string, unknown>,
  timeout: number = 60000
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`\n📦 Injecting Scout Adoption Player...`);

    // Match parameters to steps using intelligent matching
    const stepValueMap = matchParametersToSteps(steps, parameters);

    // Read the Scout player script from public folder
    const playerScriptPath = join(process.cwd(), "public", "scout-adoption-player.js");
    
    if (!existsSync(playerScriptPath)) {
      throw new Error(`Scout player script not found at: ${playerScriptPath}`);
    }

    const playerScript = readFileSync(playerScriptPath, "utf-8");
    
    // Inject the player script into the page
    // We need to modify it to expose the Player class globally for our auto-fill enhancement
    const modifiedPlayerScript = playerScript.replace(
      /class Player \{/,
      `window._ScoutPlayerClass = class Player {`
    ).replace(
      /}\)\(\);[\s]*$/,
      `
  // Expose Player class for orchestration auto-fill
  if (window._ScoutPlayerClass) {
    console.log("[Scout] Player class exposed for orchestration");
  }
})();`
    );
    
    await page.evaluate(modifiedPlayerScript);
    console.log(`✅ Scout Player injected`);

    // Convert RecordedActions to guide format expected by the player
    const guideSteps = steps.map((action, index) => ({
      order: index + 1,
      description: action.stepDescription || `Step ${index + 1}`,
      target: {
        selectorCandidates: action.elementIdentity?.selectorCandidates || [],
      },
      action: action.type,
    }));

    const guide = {
      id: workflowId,
      title: workflowTitle,
      steps: guideSteps,
      recordedActions: steps,
    };

    console.log(`\n🎬 Starting Scout Player with ${steps.length} steps...`);
    
    const hasInstructions = parameters && Object.keys(parameters).length > 0;
    if (hasInstructions) {
      console.log(`\n✨ Automation enabled with ${Object.keys(parameters).length} instruction(s)`);
      console.log(`   Will auto-fill when highlighted element matches instructions.`);
    }
    
    console.log(`\n⚠️  USER ACTION REQUIRED:`);
    console.log(`   The Scout player will now guide you through the workflow.`);
    console.log(`   Please follow the tooltips and complete each step.`);
    if (hasInstructions) {
      console.log(`   Matching fields will be filled automatically.`);
    }
    console.log(`   The browser will remain open for you to interact.\n`);

    // Inject the guide data and start the player
    // Enhanced with auto-fill based on highlighted element matching
    if (hasInstructions) {
      // WITH AUTO-FILL ENHANCEMENT (orchestration mode)
      // Pass parameters and recorded actions for element matching
      await page.evaluate((guideData, instructionsMap) => {
        // Create and start the player
        const Player = (window as any)._ScoutPlayerClass;
        if (!Player) {
          throw new Error("Scout Player class not found. Make sure the player script was injected.");
        }

        // Helper to extract searchable text from elementIdentity (reusing Scout's recorded data)
        function getElementSearchText(elementIdentity: any): string {
          if (!elementIdentity) return "";
          
          const texts: string[] = [];
          
          // Use all the text properties Scout recorded (in priority order)
          if (elementIdentity.labelText) texts.push(elementIdentity.labelText.toLowerCase());
          if (elementIdentity.accessibleName) texts.push(elementIdentity.accessibleName.toLowerCase());
          if (elementIdentity.ariaLabel) texts.push(elementIdentity.ariaLabel.toLowerCase());
          if (elementIdentity.placeholder) texts.push(elementIdentity.placeholder.toLowerCase());
          if (elementIdentity.text) texts.push(elementIdentity.text.toLowerCase());
          if (elementIdentity.nearbyHeading) texts.push(elementIdentity.nearbyHeading.toLowerCase());
          if (elementIdentity.name) texts.push(elementIdentity.name.toLowerCase());
          if (elementIdentity.id) texts.push(elementIdentity.id.toLowerCase());
          if (elementIdentity.parentContainerText) texts.push(elementIdentity.parentContainerText.toLowerCase());
          if (elementIdentity.previousSiblingText) texts.push(elementIdentity.previousSiblingText.toLowerCase());
          if (elementIdentity.nextSiblingText) texts.push(elementIdentity.nextSiblingText.toLowerCase());
          
          return texts.filter(Boolean).join(' ');
        }

        // Helper to check if instruction matches element using Scout's recorded elementIdentity
        function findMatchingInstruction(stepIndex: number, recordedActions: any[], instructions: Record<string, string>): { instruction: string; value: string; action: string } | null {
          const action = recordedActions[stepIndex];
          if (!action || !action.elementIdentity) {
            console.log(`\n⚠️  No elementIdentity for step ${stepIndex + 1}`);
            return null;
          }
          
          const elementText = getElementSearchText(action.elementIdentity);
          
          console.log(`\n🔍 Checking highlighted element (Step ${stepIndex + 1}):`);
          console.log(`   <${action.elementIdentity.tagName}> Properties:`);
          if (action.elementIdentity.labelText) console.log(`     - Label: "${action.elementIdentity.labelText}"`);
          if (action.elementIdentity.placeholder) console.log(`     - Placeholder: "${action.elementIdentity.placeholder}"`);
          if (action.elementIdentity.ariaLabel) console.log(`     - Aria-Label: "${action.elementIdentity.ariaLabel}"`);
          if (action.elementIdentity.accessibleName) console.log(`     - Accessible Name: "${action.elementIdentity.accessibleName}"`);
          if (action.elementIdentity.name) console.log(`     - Name: "${action.elementIdentity.name}"`);
          
          for (const [instruction, value] of Object.entries(instructions)) {
            const instructionLower = instruction.toLowerCase();
            
            // Determine action from instruction
            let actionType = "fill";
            let searchText = instructionLower;
            
            if (instructionLower.startsWith("click ") || instructionLower.startsWith("press ")) {
              actionType = "click";
              searchText = instructionLower.replace(/^(click|press)\s+/i, "");
            } else if (instructionLower.startsWith("skip ")) {
              actionType = "skip";
              searchText = instructionLower.replace(/^skip\s+/i, "");
            } else if (instructionLower.startsWith("fill ") || instructionLower.startsWith("enter ") || 
                       instructionLower.startsWith("type ")) {
              actionType = "fill";
              searchText = instructionLower.replace(/^(fill|enter|type)\s+/i, "");
            }
            
            // Clean up quotes
            searchText = searchText.replace(/["']/g, "").trim();
            
            // Extract keywords (3+ chars, skip common words)
            const keywords = searchText
              .split(/\s+/)
              .filter(word => word.length >= 3 && !["the", "and", "with", "for", "textbox", "field", "input"].includes(word));
            
            if (keywords.length === 0) continue;
            
            // Check how many keywords match
            const matchedKeywords = keywords.filter(keyword => elementText.includes(keyword));
            const matchPercentage = matchedKeywords.length / keywords.length;
            
            console.log(`   📋 "${instruction}" → ${matchedKeywords.length}/${keywords.length} (${Math.round(matchPercentage * 100)}%)`);
            
            // Match if 70%+ of keywords found
            if (matchPercentage >= 0.7) {
              console.log(`   ✅ MATCH!`);
              return { instruction, value, action: actionType };
            }
          }
          
          console.log(`   ❌ No matching instructions`);
          return null;
        }

        // Create the player
        const player = new Player(guideData);
        
        // Store original render method
        const originalRender = player.render.bind(player);
        
        // Override render to check highlighted element against instructions using Scout's recorded data
        player.render = function() {
          originalRender();
          
          // Wait a moment for element to be fully highlighted
          setTimeout(() => {
            const highlightedElement = player.highlighted;
            
            if (!highlightedElement) {
              return; // No element highlighted yet
            }
            
            // Check if this step's elementIdentity matches any instruction
            const match = findMatchingInstruction(player.index, guideData.recordedActions, instructionsMap);
            
            if (!match) {
              return; // No match - user handles manually
            }
            
            console.log(`\n${"=".repeat(70)}`);
            console.log(`🤖 SCOUT AUTOMATION - Step ${player.index + 1}`);
            console.log(`${"=".repeat(70)}`);
            console.log(`Matched: "${match.instruction}"`);
            console.log(`Action: ${match.action.toUpperCase()}`);
            if (match.value) {
              console.log(`Value: "${match.value}"`);
            }
            console.log(`${"=".repeat(70)}`);
            
            if (match.action === "skip") {
              console.log(`⏭️  SKIPPING - User will handle manually`);
              return;
            }
            
            if (match.action === "fill") {
              // Auto-fill the highlighted element
              setTimeout(() => {
                const target = player.highlighted;
                
                if (target && (target instanceof HTMLInputElement || 
                              target instanceof HTMLTextAreaElement ||
                              target instanceof HTMLSelectElement)) {
                  
                  const fillValue = match.value || "";
                  
                  try {
                    if (target instanceof HTMLSelectElement) {
                      // Select element
                      const nativeValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                      if (nativeValueSetter) {
                        nativeValueSetter.call(target, fillValue);
                      } else {
                        target.value = fillValue;
                      }
                      
                      target.dispatchEvent(new Event('input', { bubbles: true }));
                      target.dispatchEvent(new Event('change', { bubbles: true }));
                      target.dispatchEvent(new Event('blur', { bubbles: true }));
                      
                      console.log(`✅ SELECT FILLED: "${fillValue}"`);
                    } else {
                      // Input/textarea element
                      target.focus();
                      
                      const nativeValueSetter = Object.getOwnPropertyDescriptor(
                        target instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
                        'value'
                      )?.set;
                      
                      if (nativeValueSetter) {
                        nativeValueSetter.call(target, fillValue);
                      } else {
                        target.value = fillValue;
                      }
                      
                      // Dispatch all events for React/frameworks
                      target.dispatchEvent(new Event('input', { bubbles: true }));
                      target.dispatchEvent(new Event('change', { bubbles: true }));
                      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                      target.dispatchEvent(new Event('blur', { bubbles: true }));
                      
                      console.log(`✅ INPUT FILLED: "${fillValue}"`);
                      
                      // Visual feedback
                      const originalOutline = target.style.outline;
                      const originalOffset = target.style.outlineOffset;
                      target.style.outline = "4px solid #10b981";
                      target.style.outlineOffset = "2px";
                      
                      setTimeout(() => {
                        target.style.outline = originalOutline;
                        target.style.outlineOffset = originalOffset;
                      }, 1500);
                    }
                  } catch (error) {
                    console.error(`❌ ERROR filling:`, error);
                  }
                } else {
                  console.error(`❌ Highlighted element not fillable`);
                }
              }, 300);
            } else if (match.action === "click") {
              // Auto-click the highlighted element
              setTimeout(() => {
                const target = player.highlighted;
                if (target && target instanceof HTMLElement) {
                  console.log(`🖱️  AUTO-CLICKING`);
                  target.click();
                  console.log(`✅ CLICKED`);
                } else {
                  console.error(`❌ No clickable element`);
                }
              }, 300);
            }
          }, 400);
        };

        (window as any)._scoutPlayerInstance = player;
        player.start();
        
        console.log("[Scout] Player started with auto-fill (element matching mode)");
      }, guide, Object.fromEntries(Object.entries(parameters || {}).map(([k, v]) => [k, String(v)])));
    } else {
      // WITHOUT AUTO-FILL (standard digital adoption mode)
      await page.evaluate((guideData) => {
        const Player = (window as any)._ScoutPlayerClass;
        if (!Player) {
          throw new Error("Scout Player class not found. Make sure the player script was injected.");
        }

        const player = new Player(guideData);
        (window as any)._scoutPlayerInstance = player;
        player.start();
        
        console.log("[Scout] Player started in standard mode");
      }, guide);
    }

    console.log(`✅ Scout Player started successfully`);
    console.log(`⏱️  Workflow is now running. Browser will stay open.`);
    console.log(`⏳ Waiting for you to complete all workflow steps...`);
    
    // Expose a completion callback that browser code can call
    let workflowCompleteResolver: (() => void) | null = null;
    const workflowCompletePromise = new Promise<void>((resolve) => {
      workflowCompleteResolver = resolve;
    });
    
    await page.exposeFunction('__scoutWorkflowComplete', () => {
      console.log("\n🎉 Workflow completed! Continuing to next node...\n");
      if (workflowCompleteResolver) {
        workflowCompleteResolver();
        workflowCompleteResolver = null; // Prevent double-calling
      }
    });

    // Monitor for workflow completion by polling localStorage
    // Scout Player removes localStorage key when all steps complete
    const storageKey = `scout-adoption-progress:${workflowId}:main`;
    page.evaluate((key: string) => {
      const checkInterval = setInterval(() => {
        // Check if player instance is stopped or localStorage key is gone
        const player = (window as any)._scoutPlayerInstance;
        const progressExists = localStorage.getItem(key) !== null;
        const hasTooltip = document.querySelector('.scout-adoption-tooltip') !== null;
        
        // Workflow is complete when:
        // 1. Player stopped (player.stopped === true) OR
        // 2. Progress key removed AND no tooltip visible
        if ((player && player.stopped) || (!progressExists && !hasTooltip)) {
          console.log("🏁 Scout Player workflow detected as complete");
          clearInterval(checkInterval);
          if (window.__scoutWorkflowComplete) {
            window.__scoutWorkflowComplete();
          }
        }
      }, 500); // Check every 500ms
    }, storageKey);

    // Wait for user to complete all workflow steps (with timeout)
    await Promise.race([
      workflowCompletePromise,
      new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error("Workflow timeout - user did not complete all steps")), timeout)
      )
    ]);

    return { success: true };
    
  } catch (error) {
    console.error(`❌ Failed to inject Scout Player:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Extract output data from the final page
 */
async function extractOutputData(page: Page): Promise<Record<string, unknown>> {
  try {
    const output: Record<string, unknown> = {
      finalUrl: page.url(),
      pageTitle: await page.title(),
    };

    // Try to extract common success indicators
    const successMessages = await page
      .$$eval(".success, .alert-success, [role='alert']", (elements) =>
        elements.map((el) => el.textContent?.trim())
      )
      .catch(() => []);

    if (successMessages.length > 0) {
      output.successMessages = successMessages;
    }

    // Extract any visible form data or results
    const formData = await page
      .$$eval("input[type='text'], input[type='email'], textarea", (elements) => {
        const data: Record<string, string> = {};
        elements.forEach((el: any) => {
          if (el.name && el.value) {
            data[el.name] = el.value;
          }
        });
        return data;
      })
      .catch(() => ({}));

    if (Object.keys(formData).length > 0) {
      output.formData = formData;
    }

    return output;
  } catch (error) {
    console.error("Error extracting output data:", error);
    return {};
  }
}

/**
 * Main browser workflow executor
 */
export async function executeBrowserWorkflow(
  options: BrowserExecutionOptions
): Promise<BrowserExecutionResult> {
  const executionId = crypto.randomUUID();
  const startTime = Date.now();
  let page: Page | null = null;

  try {
    console.log("\n" + "█".repeat(80));
    console.log("🚀 BROWSER WORKFLOW EXECUTION STARTED");
    console.log("█".repeat(80));
    console.log(`Workflow ID: ${options.workflowId}`);
    
    if (options.parameters && Object.keys(options.parameters).length > 0) {
      console.log("\n📋 PARAMETERS RECEIVED:");
      for (const [key, value] of Object.entries(options.parameters)) {
        console.log(`   ✅ ${key} = "${value}"`);
      }
    } else {
      console.log(`\n⚠️  NO PARAMETERS - Scout Player will run in standard mode (no auto-fill)`);
    }
    console.log("█".repeat(80) + "\n");

    // Launch browser (visible by default so user can login)
    // This will reuse existing browser instance if running, preserving session
    const browser = await getBrowser(options.headless || false);
    
    // Always create a NEW page/tab - don't disturb existing tabs
    page = await browser.newPage();
    console.log(`📄 Opened new browser tab`);
    
    const existingPages = await browser.pages();
    if (existingPages.length > 1) {
      console.log(`✨ Existing session preserved - you have ${existingPages.length} tab(s) open`);
      console.log(`🔐 If you're already logged in, you won't need to login again`);
    }

    // Set reasonable timeout
    page.setDefaultTimeout(options.timeout || 60000);

    // Navigate to target URL in the new tab
    console.log(`🌐 Navigating to: ${options.targetUrl}`);
    await page.goto(options.targetUrl, { waitUntil: "networkidle2" });

    // Wait a bit for page to fully render before checking
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check if we landed on a login page
    // With session persistence, this should be false if user already logged in
    const needsLogin = await isLoginPage(page);
    console.log(`🔐 Login required: ${needsLogin}`);

    if (needsLogin) {
      console.log("🔐 Login page detected!");

      // Wait for user to login manually
      const loginSuccess = await waitForUserLogin(page, options.targetUrl, options.timeout);

      if (!loginSuccess) {
        return {
          success: false,
          executionId,
          status: "login_required",
          error: "User did not complete login within timeout period",
          duration: Date.now() - startTime,
        };
      }

      // After login, navigate to target URL again
      console.log(`🌐 Re-navigating to target URL after login: ${options.targetUrl}`);
      await page.goto(options.targetUrl, { waitUntil: "networkidle2" });
    }

    // Inject Scout Player and execute workflow with tooltips/highlighting
    const playerResult = await injectAndExecuteScoutPlayer(
      page,
      options.workflowId,
      "Automated Workflow", // Can be enhanced to pass actual workflow title
      options.steps,
      options.parameters || {}, // Pass parameters for intelligent auto-fill
      options.timeout
    );

    if (!playerResult.success) {
      return {
        success: false,
        executionId,
        status: "failed",
        error: playerResult.error,
        duration: Date.now() - startTime,
      };
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Workflow player injected and started in ${duration}ms`);
    console.log(`📊 Total steps: ${options.steps.length}`);

    // Close browser page if requested
    if (options.closeBrowserAfter !== false) {
      try {
        await page.close();
        console.log(`🌐 Browser page closed`);
      } catch (e) {
        console.warn("⚠️ Could not close browser page:", e);
      }
    } else {
      console.log(`🌐 Browser page kept open for next node (data capture)`);
    }

    return {
      success: true,
      executionId,
      status: "completed",
      output: {
        message: "Scout Player is running the workflow in the browser",
        totalSteps: options.steps.length,
      },
      duration,
      page: options.closeBrowserAfter !== false ? undefined : page, // Pass page if keeping open
    };
  } catch (error) {
    console.error("❌ Browser workflow execution failed:", error);

    return {
      success: false,
      executionId,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      duration: Date.now() - startTime,
    };
  } finally {
    // Browser page lifecycle is handled in the return block above based on closeBrowserAfter option
    // If kept open, it will be passed to the next node (e.g., data_capture)
  }
}

/**
 * Cleanup - close browser
 */
export async function closeBrowser(): Promise<void> {
  if (globalBrowser) {
    await globalBrowser.close();
    globalBrowser = null;
  }
}
