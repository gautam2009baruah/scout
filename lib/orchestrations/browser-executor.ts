/**
 * Automated Browser Workflow Executor
 * Handles browser-based workflow execution with login detection and user authentication wait
 */

import puppeteer, { Browser, Page } from "puppeteer";
import type { RecordedAction, GuideStep } from "@/shared/guideTypes";

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
 * Get or create browser instance
 */
async function getBrowser(headless: boolean = false): Promise<Browser> {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await puppeteer.launch({
      headless: headless, // true or false
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
    const content = await page.content();
    const contentLower = content.toLowerCase();

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
    if (urlPatterns.some((pattern) => url.includes(pattern))) {
      return true;
    }

    // Check page title
    const titlePatterns = ["login", "sign in", "log in", "authentication"];
    if (titlePatterns.some((pattern) => title.includes(pattern))) {
      return true;
    }

    // Check for common login form elements
    const hasPasswordField = await page.$('input[type="password"]').then((el) => !!el);
    const hasLoginButton = await page
      .$(
        'button[type="submit"], input[type="submit"], button:has-text("login"), button:has-text("sign in")'
      )
      .then((el) => !!el);

    if (hasPasswordField && hasLoginButton) {
      return true;
    }

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
  console.log("⏳ Login page detected. Waiting for user to authenticate...");

  const startTime = Date.now();

  // Poll every second to check if user has logged in
  while (Date.now() - startTime < timeout) {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const currentUrl = page.url();
    const stillOnLoginPage = await isLoginPage(page);

    // Check if user has navigated away from login page
    if (!stillOnLoginPage) {
      console.log("✅ User authenticated successfully!");
      return true;
    }

    // Check if we're on the target URL or close to it
    if (currentUrl.includes(new URL(targetUrl).hostname)) {
      return true;
    }
  }

  console.log("⏱️ Login timeout - user did not authenticate in time");
  return false;
}

/**
 * Execute a single workflow step in the browser
 */
async function executeStep(
  page: Page,
  action: RecordedAction,
  parameters: Record<string, unknown>
): Promise<boolean> {
  try {
    const { type, elementIdentity, maskedValue, stepDescription } = action;

    // Get the actual value (replace masked values with parameters)
    let actualValue = "";
    if (maskedValue && elementIdentity?.name && parameters[elementIdentity.name]) {
      actualValue = String(parameters[elementIdentity.name]);
    }

    // Find element using multiple strategies
    let element = null;

    // Try ID
    if (elementIdentity?.id) {
      element = await page.$(`#${CSS.escape(elementIdentity.id)}`);
    }

    // Try name attribute
    if (!element && elementIdentity?.name) {
      element = await page.$(`[name="${elementIdentity.name}"]`);
    }

    // Try ARIA label
    if (!element && elementIdentity?.ariaLabel) {
      element = await page.$(`[aria-label="${elementIdentity.ariaLabel}"]`);
    }

    // Try placeholder
    if (!element && elementIdentity?.placeholder) {
      element = await page.$(`[placeholder="${elementIdentity.placeholder}"]`);
    }

    // Try using selector candidates (best first)
    if (!element && elementIdentity?.selectorCandidates && elementIdentity.selectorCandidates.length > 0) {
      // Sort by confidence and try each
      const sortedCandidates = [...elementIdentity.selectorCandidates].sort((a, b) => b.confidence - a.confidence);
      for (const candidate of sortedCandidates) {
        try {
          if (candidate.type === "css") {
            element = await page.$(candidate.value);
          } else if (candidate.type === "id") {
            element = await page.$(`#${CSS.escape(candidate.value)}`);
          } else if (candidate.type === "name") {
            element = await page.$(`[name="${candidate.value}"]`);
          } else if (candidate.type === "aria-label") {
            element = await page.$(`[aria-label="${candidate.value}"]`);
          }
          
          if (element) break;
        } catch (e) {
          // Try next candidate
          continue;
        }
      }
    }

    if (!element) {
      console.warn(`⚠️ Element not found for action: ${type}`);
      return false;
    }

    // Execute action based on type
    switch (type) {
      case "click":
        await element.click();
        await new Promise(resolve => setTimeout(resolve, 500)); // Wait for any animations/effects
        break;

      case "input":
      case "change":
        await element.click(); // Focus the element
        await element.evaluate((el: any) => (el.value = "")); // Clear existing value
        if (actualValue) {
          // Check if it's a select element
          const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
          if (tagName === "select") {
            await element.select(actualValue);
          } else {
            await element.type(actualValue, { delay: 50 }); // Type with human-like delay
          }
        }
        break;

      case "navigation":
        if (action.url) {
          await page.goto(action.url, { waitUntil: "networkidle2" });
        }
        break;

      case "submit":
        await element.click();
        await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 10000 }).catch(() => {
          // Navigation might not happen for AJAX forms
        });
        break;

      default:
        console.warn(`Unsupported action type: ${type}`);
    }

    return true;
  } catch (error) {
    console.error(`Error executing step:`, error);
    return false;
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
    console.log(`🚀 Starting browser workflow execution: ${options.workflowId}`);

    // Launch browser (visible by default so user can login)
    const browser = await getBrowser(options.headless || false);
    page = await browser.newPage();

    // Set reasonable timeout
    page.setDefaultTimeout(options.timeout || 60000);

    // Navigate to target URL
    console.log(`🌐 Navigating to: ${options.targetUrl}`);
    await page.goto(options.targetUrl, { waitUntil: "networkidle2" });

    // Check if we landed on a login page
    const needsLogin = await isLoginPage(page);

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

    // Execute workflow steps
    console.log(`▶️ Executing ${options.steps.length} workflow steps...`);
    let successCount = 0;

    for (let i = 0; i < options.steps.length; i++) {
      const step = options.steps[i];
      console.log(`Step ${i + 1}/${options.steps.length}: ${step.type}`);

      const success = await executeStep(page, step, options.parameters);
      if (success) {
        successCount++;
      } else {
        console.warn(`⚠️ Step ${i + 1} failed, continuing...`);
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Extract output data
    const output = await extractOutputData(page);

    // Take final screenshot
    const screenshot = await page.screenshot({ encoding: "base64", fullPage: false });

    const duration = Date.now() - startTime;

    console.log(`✅ Workflow completed in ${duration}ms`);
    console.log(`📊 Steps executed: ${successCount}/${options.steps.length}`);

    return {
      success: true,
      executionId,
      status: "completed",
      output: {
        ...output,
        stepsExecuted: successCount,
        totalSteps: options.steps.length,
      },
      screenshot: screenshot.toString(),
      duration,
    };
  } catch (error) {
    console.error("❌ Browser workflow execution failed:", error);

    const screenshot = page
      ? await page.screenshot({ encoding: "base64" }).catch(() => null)
      : null;

    return {
      success: false,
      executionId,
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown error",
      screenshot: screenshot?.toString(),
      duration: Date.now() - startTime,
    };
  } finally {
    // Close the page but keep browser open for reuse
    if (page) {
      await page.close().catch(() => {});
    }
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
