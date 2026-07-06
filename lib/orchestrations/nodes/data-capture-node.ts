// Data Capture node executor
// Captures data from browser page after workflow completion
// Shows visual review screen for user confirmation

import type { DataCaptureNodeConfig, DataCaptureFieldConfig } from "@/shared/orchestrationTypes";
import { Page } from "puppeteer";
import { getLLMProvider } from "@/lib/llm/providers";

export async function executeDataCaptureNode(
  config: DataCaptureNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    // Get the browser page from context (passed from workflow node)
    const page = context._browserPage as Page | undefined;
    
    if (!page) {
      throw new Error(
        "Data capture requires a browser page from a previous workflow node. " +
        "Make sure the workflow node is configured to keep the browser open (uncheck 'Close browser after workflow')."
      );
    }

    console.log("\n" + "█".repeat(80));
    console.log("📋 DATA CAPTURE NODE STARTED");
    console.log("█".repeat(80));

    // Wait for page to settle if configured
    if (config.pageWaitMs && config.pageWaitMs > 0) {
      console.log(`⏳ Waiting ${config.pageWaitMs}ms for page to settle...`);
      await new Promise(resolve => setTimeout(resolve, config.pageWaitMs));
    }

    // Inject capture overlay and styles
    if (config.showReviewScreen !== false) {
      await injectCaptureOverlay(page);
    }

    const capturedData: Record<string, unknown> = {};

    console.log(`\n📋 Data capture node - actual capture handled by frontend player\n`);
    console.log("🌐 Browser stays open for next node");
    console.log("█".repeat(80) + "\n");

    // Return empty captured data (actual capture happens in frontend player)
    const outputVar = config.outputVariable || "capturedData";
    return {
      success: true,
      output: {
        [outputVar]: capturedData,
        _browserPage: page, // Always pass page to next node
      }
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Data capture node failed:", errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Capture field value from DOM using selectors
 */
async function captureFromDOM(
  page: Page, 
  field: DataCaptureFieldConfig
): Promise<unknown> {
  if (!field.selectors || field.selectors.length === 0) {
    return undefined;
  }

  for (const selector of field.selectors) {
    try {
      const value = await page.evaluate((sel) => {
        const element = document.querySelector(sel);
        if (!element) return undefined;
        
        // Handle different element types
        if (element instanceof HTMLInputElement) {
          if (element.type === 'checkbox' || element.type === 'radio') {
            return element.checked;
          }
          return element.value;
        }
        
        if (element instanceof HTMLSelectElement) {
          return element.value;
        }
        
        if (element instanceof HTMLTextAreaElement) {
          return element.value;
        }
        
        // For other elements, try textContent
        if (element.textContent) {
          return element.textContent.trim();
        }
        
        return undefined;
      }, selector);

      if (value !== undefined && value !== '' && value !== null) {
        return value;
      }
    } catch (e) {
      // Try next selector
      continue;
    }
  }

  return undefined;
}

/**
 * Capture value from page text using regex pattern
 */
async function captureFromTextPattern(
  page: Page,
  field: DataCaptureFieldConfig
): Promise<unknown> {
  if (!field.textPattern) {
    return undefined;
  }

  try {
    const value = await page.evaluate((pattern) => {
      const text = document.body.innerText;
      const regex = new RegExp(pattern, 'i');
      const match = text.match(regex);
      return match ? match[1] || match[0] : undefined;
    }, field.textPattern);

    return value;
  } catch (error) {
    console.warn(`Pattern extraction failed for ${field.name}:`, error);
    return undefined;
  }
}

/**
 * Use AI to extract field value from page content
 */
async function captureWithAI(
  page: Page,
  field: DataCaptureFieldConfig
): Promise<unknown> {
  if (!field.aiPrompt) {
    return undefined;
  }

  try {
    // Get visible text from page
    const visibleText = await page.evaluate(() => {
      return document.body.innerText;
    });

    // Also get form field labels and values for context
    const formContext = await page.evaluate(() => {
      const fields: string[] = [];
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const label = el.getAttribute('aria-label') || 
                     el.getAttribute('placeholder') || 
                     el.getAttribute('name') || '';
        const value = 'value' in el ? (el as HTMLInputElement).value : '';
        if (label && value) {
          fields.push(`${label}: ${value}`);
        }
      });
      return fields.join('\n');
    });

    const provider = await getLLMProvider();
    
    const systemPrompt = `You are a data extraction specialist. Extract the requested field value from the page content. Return ONLY the extracted value with no explanation, formatting, or additional text.`;
    
    const userPrompt = `${field.aiPrompt}

Field: ${field.name}${field.label ? ` (${field.label})` : ''}

Form fields visible on page:
${formContext}

Page text (first 1500 chars):
${visibleText.substring(0, 1500)}

Extract the value for this field. Return ONLY the value.`;

    const response = await provider.generate_answer(systemPrompt, userPrompt, "");
    
    const cleanedResponse = response.trim().replace(/^["']|["']$/g, '');
    return cleanedResponse;

  } catch (error) {
    console.error(`AI extraction failed for ${field.name}:`, error);
    return undefined;
  }
}

/**
 * Inject visual capture overlay into the page
 */
async function injectCaptureOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.createElement('div');
    overlay.id = 'scout-data-capture-overlay';
    overlay.innerHTML = `
      <style>
        #scout-data-capture-overlay {
          position: fixed;
          top: 20px;
          right: 20px;
          background: white;
          border: 2px solid #4CAF50;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          padding: 20px;
          min-width: 360px;
          max-width: 450px;
          max-height: 80vh;
          overflow-y: auto;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
          animation: slideIn 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        
        @keyframes slideIn {
          from { transform: translateX(120%) scale(0.8); opacity: 0; }
          to { transform: translateX(0) scale(1); opacity: 1; }
        }
        
        @keyframes slideOut {
          from { transform: translateX(0) scale(1); opacity: 1; }
          to { transform: translateX(120%) scale(0.8); opacity: 0; }
        }
        
        #scout-capture-header {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          font-weight: 600;
          font-size: 17px;
          color: #1a1a1a;
        }
        
        #scout-capture-header svg {
          width: 28px;
          height: 28px;
          color: #4CAF50;
          flex-shrink: 0;
        }
        
        #scout-capture-progress {
          font-size: 14px;
          color: #666;
          margin-bottom: 12px;
          padding: 8px 12px;
          background: #f5f5f5;
          border-radius: 6px;
        }
        
        #scout-capture-fields {
          max-height: 400px;
          overflow-y: auto;
          margin-bottom: 16px;
        }
        
        .scout-capture-field {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 12px;
          margin-bottom: 8px;
          background: #f9f9f9;
          border-radius: 8px;
          font-size: 14px;
          animation: fadeIn 0.3s ease-out;
          border-left: 3px solid transparent;
        }
        
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .scout-capture-field.success {
          background: #E8F5E9;
          border-left-color: #4CAF50;
        }
        
        .scout-capture-field.error {
          background: #FFEBEE;
          border-left-color: #F44336;
        }
        
        .scout-capture-field-icon {
          flex-shrink: 0;
          margin-top: 2px;
        }
        
        .scout-capture-field-content {
          flex: 1;
          min-width: 0;
        }
        
        .scout-capture-field-name {
          font-weight: 500;
          color: #333;
          margin-bottom: 4px;
        }
        
        .scout-capture-field-value {
          color: #666;
          word-wrap: break-word;
          font-size: 13px;
        }
        
        #scout-capture-buttons {
          display: flex;
          gap: 12px;
          margin-top: 16px;
        }
        
        .scout-capture-button {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .scout-capture-button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .scout-capture-button.primary {
          background: #4CAF50;
          color: white;
        }
        
        .scout-capture-button.secondary {
          background: #f5f5f5;
          color: #333;
        }
        
        .scout-capture-timer {
          text-align: center;
          font-size: 13px;
          color: #999;
          margin-top: 8px;
        }
      </style>
      
      <div id="scout-capture-header">
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
        </svg>
        <span>Capturing Your Information</span>
      </div>
      
      <div id="scout-capture-progress">
        Preparing to capture data...
      </div>
      
      <div id="scout-capture-fields"></div>
      <div id="scout-capture-buttons"></div>
      <div id="scout-capture-timer"></div>
    `;
    
    document.body.appendChild(overlay);
  });
}

/**
 * Update capture progress
 */
async function updateCaptureProgress(
  page: Page,
  current: number,
  total: number,
  fieldName: string
): Promise<void> {
  await page.evaluate((curr, tot, name) => {
    const progress = document.getElementById('scout-capture-progress');
    if (progress) {
      progress.textContent = `Capturing field ${curr} of ${tot}: ${name}...`;
    }
  }, current, total, fieldName);
}

/**
 * Update capture status message
 */
async function updateCaptureStatus(
  page: Page,
  fieldName: string,
  status: string
): Promise<void> {
  await page.evaluate((name, stat) => {
    const progress = document.getElementById('scout-capture-progress');
    if (progress) {
      progress.textContent = `${name}: ${stat}`;
    }
  }, fieldName, status);
}

/**
 * Show captured field with value
 */
async function showCapturedField(
  page: Page,
  fieldName: string,
  value: unknown
): Promise<void> {
  await page.evaluate((name, val) => {
    const fieldsContainer = document.getElementById('scout-capture-fields');
    if (!fieldsContainer) return;
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'scout-capture-field success';
    fieldDiv.innerHTML = `
      <div class="scout-capture-field-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#4CAF50">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
      </div>
      <div class="scout-capture-field-content">
        <div class="scout-capture-field-name">${name}</div>
        <div class="scout-capture-field-value">${String(val)}</div>
      </div>
    `;
    
    fieldsContainer.appendChild(fieldDiv);
    
    // Auto-scroll to show new field
    fieldsContainer.scrollTop = fieldsContainer.scrollHeight;
  }, fieldName, value);
}

/**
 * Show capture error
 */
async function showCaptureError(
  page: Page,
  fieldName: string
): Promise<void> {
  await page.evaluate((name) => {
    const fieldsContainer = document.getElementById('scout-capture-fields');
    if (!fieldsContainer) return;
    
    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'scout-capture-field error';
    fieldDiv.innerHTML = `
      <div class="scout-capture-field-icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="#F44336">
          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
        </svg>
      </div>
      <div class="scout-capture-field-content">
        <div class="scout-capture-field-name">${name}</div>
        <div class="scout-capture-field-value" style="color: #F44336;">Not found</div>
      </div>
    `;
    
    fieldsContainer.appendChild(fieldDiv);
    fieldsContainer.scrollTop = fieldsContainer.scrollHeight;
  }, fieldName);
}

/**
 * Show final error screen
 */
async function showFinalError(
  page: Page,
  errors: string[]
): Promise<void> {
  await page.evaluate((errs) => {
    const header = document.getElementById('scout-capture-header');
    const progress = document.getElementById('scout-capture-progress');
    
    if (header) {
      header.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#F44336">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <span>Data Capture Failed</span>
      `;
    }
    
    if (progress) {
      progress.innerHTML = errs.map(e => `❌ ${e}`).join('<br>');
      progress.style.color = '#F44336';
    }
  }, errors);
}

/**
 * Show review screen with all captured data
 */
async function showReviewScreen(
  page: Page,
  capturedData: Record<string, unknown>,
  config: DataCaptureNodeConfig
): Promise<void> {
  await page.evaluate((data, allowEdit, timeout) => {
    const header = document.getElementById('scout-capture-header');
    const progress = document.getElementById('scout-capture-progress');
    const buttons = document.getElementById('scout-capture-buttons');
    const timer = document.getElementById('scout-capture-timer');
    
    if (header) {
      header.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#4CAF50">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
        </svg>
        <span>Data Captured Successfully!</span>
      `;
    }
    
    if (progress) {
      progress.textContent = `${Object.keys(data).length} field${Object.keys(data).length !== 1 ? 's' : ''} captured. Please review:`;
      progress.style.color = '#4CAF50';
      progress.style.fontWeight = '500';
    }
    
    if (buttons) {
      if (allowEdit) {
        buttons.innerHTML = `
          <button class="scout-capture-button secondary" onclick="window.__scoutCaptureEdit()">
            Review & Edit
          </button>
          <button class="scout-capture-button primary" onclick="window.__scoutCaptureContinue()">
            Continue →
          </button>
        `;
      } else {
        buttons.innerHTML = `
          <button class="scout-capture-button primary" onclick="window.__scoutCaptureContinue()">
            Continue →
          </button>
        `;
      }
    }
    
    if (timer && timeout > 0) {
      let remaining = timeout;
      timer.textContent = `Auto-continuing in ${remaining} seconds...`;
      
      const countdown = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
          clearInterval(countdown);
          if (window.__scoutCaptureContinue) {
            window.__scoutCaptureContinue();
          }
        } else {
          timer.textContent = `Auto-continuing in ${remaining} seconds...`;
        }
      }, 1000);
      
      // Store interval ID so we can cancel if user clicks
      (window as any).__scoutCaptureTimer = countdown;
    }
  }, capturedData, config.allowEdit !== false, config.autoReviewTimeout || 0);
}

/**
 * Wait for user to confirm or cancel
 */
async function waitForUserConfirmation(
  page: Page,
  timeout: number
): Promise<boolean> {
  // Set up confirmation handlers
  await page.exposeFunction('__scoutCaptureContinue', () => {
    // Will be detected by waitForFunction
  });
  
  await page.exposeFunction('__scoutCaptureEdit', () => {
    // TODO: Implement edit mode
  });
  
  await page.evaluate(() => {
    (window as any).__scoutCaptureConfirmed = false;
    (window as any).__scoutCaptureCancelled = false;
    
    (window as any).__scoutCaptureContinue = () => {
      // Cancel auto-timer if running
      if ((window as any).__scoutCaptureTimer) {
        clearInterval((window as any).__scoutCaptureTimer);
      }
      (window as any).__scoutCaptureConfirmed = true;
    };
  });
  
  // Wait for user click or timeout (if timeout is 0, wait indefinitely)
  try {
    await page.waitForFunction(
      () => (window as any).__scoutCaptureConfirmed === true,
      { timeout: timeout > 0 ? (timeout * 1000) + 5000 : 0 } // Add 5s buffer to timeout
    );
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Get any data user edited
 */
async function getEditedData(page: Page): Promise<Record<string, unknown> | null> {
  // TODO: Implement edit functionality
  // For now, return null (no edits)
  return null;
}

/**
 * Remove capture overlay
 */
async function removeCaptureOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const overlay = document.getElementById('scout-data-capture-overlay');
    if (overlay) {
      overlay.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => overlay.remove(), 300);
    }
  });
}
