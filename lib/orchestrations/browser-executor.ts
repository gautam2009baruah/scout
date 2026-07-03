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
};

export type BrowserExecutionResult = {
  success: boolean;
  executionId: string;
  status: "completed" | "failed" | "timeout" | "login_required";
  output?: Record<string, unknown>;
  error?: string;
  screenshot?: string;
  duration?: number;
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
    const normalizedKey = paramKey.toLowerCase().trim();
    const instruction = String(paramValue).trim();

    console.log(`\n📌 Parameter: "${paramKey}"`);
    console.log(`   Instruction: "${instruction}"`);

    // Parse the instruction to determine action and value
    // Supported formats:
    // 1. Simple value: "My Training" -> action: fill, value: "My Training"
    // 2. Action only: "click" -> action: click, value: undefined
    // 3. Action with value: "fill: My Training" or "enter My Training" -> action: fill, value: "My Training"
    
    let action = "none";
    let value: string | undefined;

    const instructionLower = instruction.toLowerCase();

    // Check for explicit actions
    if (instructionLower === "click" || instructionLower === "press") {
      action = "click";
    } else if (instructionLower === "skip" || instructionLower === "ignore") {
      action = "skip";
    } else if (instructionLower.startsWith("fill:") || instructionLower.startsWith("enter:")) {
      action = "fill";
      value = instruction.split(":")[1]?.trim();
    } else if (instructionLower.startsWith("fill ") || instructionLower.startsWith("enter ")) {
      action = "fill";
      value = instruction.substring(instruction.indexOf(" ") + 1).trim();
    } else if (instructionLower.includes("fill") || instructionLower.includes("enter") || 
               instructionLower.includes("type") || instructionLower.includes("input")) {
      // Instruction contains fill/enter/type/input keyword
      action = "fill";
      // Try to extract value from the instruction
      const fillMatch = instruction.match(/(?:fill|enter|type|input)[:\s]+(.+)/i);
      value = fillMatch ? fillMatch[1].trim() : instruction;
    } else {
      // No action keyword found - treat as a value to fill
      action = "fill";
      value = instruction;
    }

    console.log(`   Parsed action: ${action}${value ? `, value: "${value}"` : ""}`);

    // Try to find matching step
    let matchedIndex = -1;

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

      // Check for exact element name/id match first (highest priority)
      if (step.elementIdentity?.name === paramKey || step.elementIdentity?.id === paramKey) {
        matchedIndex = i;
        console.log(`   ✅ Exact match by element name/id at step ${i + 1}`);
        break;
      }

      // Check for keyword match in descriptions
      const keywords = normalizedKey.split(/\s+/).filter(word => word.length > 2);
      const matchCount = keywords.filter(keyword => combinedText.includes(keyword)).length;

      if (matchCount > 0 && matchCount === keywords.length) {
        matchedIndex = i;
        console.log(`   ✅ Matched by description keywords at step ${i + 1}: "${step.stepDescription}"`);
        break;
      }

      // Partial match (at least half the keywords)
      if (keywords.length > 1 && matchCount >= Math.ceil(keywords.length / 2)) {
        matchedIndex = i;
        console.log(`   ⚠️  Partial match (${matchCount}/${keywords.length} keywords) at step ${i + 1}: "${step.stepDescription}"`);
        break;
      }
    }

    if (matchedIndex >= 0) {
      stepActions.set(matchedIndex, { action, value });
      if (action === "fill" && value) {
        console.log(`   ✅ MATCHED → Will auto-fill step ${matchedIndex + 1} with: "${value}"`);
      } else if (action === "click") {
        console.log(`   ✅ MATCHED → Will auto-click step ${matchedIndex + 1}`);
      } else if (action === "skip") {
        console.log(`   ℹ️  MATCHED → Will skip step ${matchedIndex + 1} (manual interaction)`);
      }
    } else {
      console.log(`   ❌ NO MATCH FOUND for parameter: "${paramKey}"`);
    }
  }

  console.log("\n📊 MATCHING SUMMARY:");
  console.log(`   Total parameters: ${Object.keys(parameters).length}`);
  console.log(`   Matched: ${stepActions.size}`);
  console.log(`   Unmatched: ${Object.keys(parameters).length - stepActions.size}`);
  console.log("▓".repeat(80) + "\n");

  // If only one parameter and one input step, auto-match
  if (parameters && Object.keys(parameters).length === 1 && stepActions.size === 0) {
    const inputSteps = steps.filter(s => s.type === "input" || s.type === "change");
    if (inputSteps.length === 1) {
      const inputIndex = steps.indexOf(inputSteps[0]);
      const [paramKey, paramValue] = Object.entries(parameters)[0];
      const instruction = String(paramValue);
      
      // Parse action
      if (instruction.toLowerCase() === "click") {
        stepActions.set(inputIndex, { action: "click" });
      } else {
        stepActions.set(inputIndex, { action: "fill", value: instruction });
      }
      console.log(`   ℹ️  Auto-matched single parameter "${paramKey}" to single input step ${inputIndex + 1}`);
    }
  }

  console.log(`\n   📊 Total matches: ${stepActions.size}/${Object.keys(parameters).length}`);
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
    // Include automation instructions from parameter matching
    const guideSteps = steps.map((action, index) => ({
      order: index + 1,
      description: action.stepDescription || `Step ${index + 1}`,
      target: {
        selectorCandidates: action.elementIdentity?.selectorCandidates || [],
      },
      action: action.type,
      autoAction: stepValueMap.get(index), // { action: "fill"|"click"|"skip", value?: string }
    }));

    const guide = {
      id: workflowId,
      title: workflowTitle,
      steps: guideSteps,
      recordedActions: steps,
    };

    console.log(`🎬 Starting Scout Player with ${steps.length} steps...`);
    
    const autoActionCount = stepValueMap.size;
    if (autoActionCount > 0) {
      console.log(`\n✨ Automation enabled for ${autoActionCount} step(s)`);
      console.log(`   Actions will be performed based on your input mapping.`);
    }
    
    console.log(`\n⚠️  USER ACTION REQUIRED:`);
    console.log(`   The Scout player will now guide you through the workflow.`);
    console.log(`   Please follow the tooltips and complete each step.`);
    if (autoActionCount > 0) {
      console.log(`   Steps with automation will be handled automatically.`);
    }
    console.log(`   The browser will remain open for you to interact.\n`);

    // Inject the guide data and start the player
    // Only enhance with auto-fill if parameters were matched
    if (stepValueMap.size > 0) {
      // WITH AUTO-FILL ENHANCEMENT (orchestration mode)
      await page.evaluate((guideData) => {
        // Create and start the player
        const Player = (window as any)._ScoutPlayerClass;
        if (!Player) {
          throw new Error("Scout Player class not found. Make sure the player script was injected.");
        }

        // Helper to find element (copied from player's findTarget logic)
        function findTargetElement(elementIdentity: any): HTMLElement | null {
          if (!elementIdentity || !elementIdentity.selectorCandidates) return null;
          
          const candidates = [...elementIdentity.selectorCandidates].sort(
            (a: any, b: any) => (b.confidence || 0) - (a.confidence || 0)
          );

          for (const candidate of candidates) {
            try {
              const element = document.querySelector(candidate.value);
              if (element instanceof HTMLElement) {
                console.log(`[Scout Auto-fill] Found element via selector: ${candidate.value}`);
                return element;
              }
            } catch (e) {
              // Try next candidate
            }
          }
          return null;
        }

        // Create the player
        const player = new Player(guideData);
        
        // Store original render method
        const originalRender = player.render.bind(player);
        
        // Override render to add automation
        player.render = function() {
          originalRender();
          
          const currentStep = guideData.steps[player.index];
          const currentAction = guideData.recordedActions[player.index];
          
          // Check if this step has automation instructions
          if (currentStep && currentStep.autoAction) {
            const autoAction = currentStep.autoAction;
            
            console.log(`\n${"=".repeat(70)}`);
            console.log(`🤖 SCOUT AUTOMATION - Step ${player.index + 1}`);
            console.log(`${"=".repeat(70)}`);
            console.log(`Description: ${currentStep.description}`);
            console.log(`Action: ${autoAction.action.toUpperCase()}`);
            if (autoAction.value) {
              console.log(`Value: "${autoAction.value}"`);
            }
            console.log(`${"=".repeat(70)}`);
            
            // Handle based on action type
            if (autoAction.action === "skip") {
              console.log(`⏭️  SKIPPING - User will handle this step manually`);
              return; // Scout player will wait for user
            }
            
            if (autoAction.action === "fill" && autoAction.value) {
              // Auto-fill logic with retry
              let attempts = 0;
              const maxAttempts = 15;
              
              const tryAutoFill = () => {
                attempts++;
                
                let target = player.highlighted;
                if (!target) {
                  target = findTargetElement(currentAction.elementIdentity);
                }
                
                if (target && (target instanceof HTMLInputElement || 
                              target instanceof HTMLTextAreaElement ||
                              target instanceof HTMLSelectElement)) {
                  
                  console.log(`✅ Element found (attempt ${attempts})`);
                  console.log(`   Type: ${target.tagName}, ID: ${target.id || 'none'}, Name: ${target.name || 'none'}`);
                  
                  const fillValue = autoAction.value || "";
                  
                  try {
                    if (target instanceof HTMLSelectElement) {
                      // For select elements
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
                      if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(target, fillValue);
                      } else {
                        target.value = fillValue;
                      }
                      
                      // Dispatch events for React/frameworks
                      target.dispatchEvent(new Event('input', { bubbles: true }));
                      target.dispatchEvent(new Event('change', { bubbles: true }));
                      target.dispatchEvent(new Event('blur', { bubbles: true }));
                      
                      console.log(`✅ SELECT FILLED: "${fillValue}"`);
                    } else {
                      // For input/textarea elements
                      target.focus();
                      
                      // Use native setter to bypass React's event system
                      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                        target instanceof HTMLInputElement ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
                        'value'
                      )?.set;
                      
                      if (nativeInputValueSetter) {
                        nativeInputValueSetter.call(target, fillValue);
                      } else {
                        target.value = fillValue;
                      }
                      
                      // Dispatch all necessary events for React/frameworks
                      target.dispatchEvent(new Event('input', { bubbles: true }));
                      target.dispatchEvent(new Event('change', { bubbles: true }));
                      target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
                      target.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                      target.dispatchEvent(new Event('blur', { bubbles: true }));
                      
                      console.log(`✅ INPUT FILLED: "${fillValue}"`);
                      console.log(`   Current value: "${target.value}"`);
                      
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
                    
                    return true;
                  } catch (error) {
                    console.error(`❌ ERROR filling element:`, error);
                    return false;
                  }
                } else {
                  if (attempts < maxAttempts) {
                    console.log(`⏳ Waiting for element... (${attempts}/${maxAttempts})`);
                    setTimeout(tryAutoFill, 250);
                  } else {
                    console.error(`❌ FAILED: Element not found after ${maxAttempts} attempts`);
                    if (player.highlighted) {
                      console.error(`   Highlighted element is not fillable. Type: ${player.highlighted.tagName}`);
                    }
                  }
                  return false;
                }
              };
              
              // Wait longer for element to be highlighted
              setTimeout(tryAutoFill, 500);
            } else if (autoAction.action === "click") {
              // Auto-click logic
              setTimeout(() => {
                let target = player.highlighted;
                if (!target) {
                  target = findTargetElement(currentAction.elementIdentity);
                }
                
                if (target && target instanceof HTMLElement) {
                  console.log(`🖱️  AUTO-CLICKING element`);
                  target.click();
                  console.log(`✅ CLICKED`);
                } else {
                  console.error(`❌ Click target not found`);
                }
              }, 500);
            }
          }
        };

        (window as any)._scoutPlayerInstance = player;
        player.start();
        
        console.log("[Scout] Player started with auto-fill enhancement");
      }, guide);
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
    
    // For automated orchestrations, we'll just wait a bit and return success
    // The workflow runs in the browser with user guidance
    await new Promise(resolve => setTimeout(resolve, 2000));

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

    return {
      success: true,
      executionId,
      status: "completed",
      output: {
        message: "Scout Player is running the workflow in the browser",
        totalSteps: options.steps.length,
      },
      duration,
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
    // Keep the browser and page open so user can interact with the Scout Player
    // The page will remain open with the Scout tooltips/highlights running
    console.log(`\n🌐 Browser remains open for interaction`);
    console.log(`📍 You can now follow the Scout Player tooltips in the browser\n`);
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
