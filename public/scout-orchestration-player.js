/**
 * Scout Orchestration Player - Embeddable Script
 * 
 * Include this script in your page to enable in-context orchestration execution.
 * Works with Scout chatbot iframe to execute workflows directly in your browser.
 * 
 * Usage:
 * <script src="https://your-scout-domain/scout-orchestration-player.js"></script>
 */

(function() {
  'use strict';

  console.log('🎬 Scout Orchestration Player loaded');
  console.log('📍 Current URL:', window.location.href);
  console.log('🔧 Configuration:', window.ScoutOrchestrationConfig || 'Using defaults');

  // State
  let overlayElement = null;
  let currentExecution = null;
  let scoutPlayerLoaded = false;

  // Configuration (can be overridden via window.ScoutOrchestrationConfig)
  const config = window.ScoutOrchestrationConfig || {
    apiBaseUrl: window.location.origin,
    scoutPlayerUrl: '/scout-adoption-player.js',
  };

  console.log('⚙️ API Base URL:', config.apiBaseUrl);

  /**
   * Initialize orchestration player
   */
  function init() {
    console.log('🎬 Initializing Scout Orchestration Player...');
    console.log('✅ Event listeners registered for postMessage AND custom events');
    
    // Listen for postMessage (iframe mode)
    window.addEventListener('message', handleMessage);
    
    // Listen for custom events (same window mode)
    window.addEventListener('SCOUT_START_EXECUTION', handleCustomEvent);
    
    // Inject styles
    injectStyles();
    
    // Send ready message to chatbot iframes
    setTimeout(() => {
      const iframes = document.querySelectorAll('iframe[data-scout-chatbot], iframe[src*="scout"]');
      console.log(`📡 Found ${iframes.length} chatbot iframe(s)`);
      
      sendMessageToChatbot({
        type: 'SCOUT_PLAYER_READY',
        payload: { ready: true },
      });
      console.log('✅ Sent SCOUT_PLAYER_READY to chatbot iframes');
    }, 1000);
  }

  /**
   * Handle custom event (same window mode)
   */
  function handleCustomEvent(event) {
    console.log('📨 Received custom event:', event.type, event.detail);
    handleStartExecution(event.detail);
  }

  /**
   * Handle postMessage from chatbot iframe
   */
  async function handleMessage(event) {
    const message = event.data;

    // Check if it's a Scout message
    if (!message || !message.type || !message.type.startsWith('SCOUT_')) {
      return;
    }

    console.log('📨 Received Scout message:', message.type, message);

    switch (message.type) {
      case 'SCOUT_START_EXECUTION':
        await handleStartExecution(message.payload);
        break;
    }
  }

  /**
   * Start orchestration execution
   */
  async function handleStartExecution(payload) {
    const { executionId, orchestrationId, orchestrationName, triggerData } = payload;
    let context = payload.context || {}; // Use let so we can reassign when capturing data

    console.log('🎬 Starting in-context execution:', { executionId, orchestrationName });

    try {
      // Fetch execution plan
      const response = await fetch(`${config.apiBaseUrl}/api/orchestrations/execute/${executionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orchestrationId,
          context,
          triggerData,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch execution plan: ${response.statusText}`);
      }

      const result = await response.json();
      const executionPlan = result.executionPlan;

      console.log(`📋 Execution plan loaded: ${executionPlan.length} steps`);

      // Show overlay
      showOverlay({
        executionId,
        orchestrationName,
        status: 'running',
        completedSteps: 0,
        totalSteps: executionPlan.length,
        steps: executionPlan,
      });

      // Load Scout Player
      await loadScoutPlayer();

      // Execute steps
      let completedCount = 0;
      const matchedPhrase = triggerData.matchedPhrase;
      const matchedIntent = triggerData.matchedIntent;

      for (let i = 0; i < executionPlan.length; i++) {
        const step = executionPlan[i];

        console.log(`▶️ Executing step ${i + 1}/${executionPlan.length}: ${step.label}`);

        updateOverlay({
          currentStep: step.label,
          steps: executionPlan.map((s, idx) =>
            idx === i ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s
          ),
        });

        try {
          let stepResult = null;

          console.log(`🔍 Step type: ${step.nodeType}`);
          console.log(`🔍 Step config:`, step.config);

          // Execute based on node type
          if (step.nodeType === 'workflow' && step.workflowId && step.guideData) {
            // Check phrase matching
            if (step.matchRequired && step.triggerPhrases) {
              const matches = step.triggerPhrases.some(phrase =>
                phrase.toLowerCase() === matchedPhrase?.toLowerCase() ||
                phrase.toLowerCase().includes(matchedIntent?.toLowerCase())
              );

              if (!matches) {
                console.log(`⏭️ Skipping step "${step.label}" - phrase didn't match`);

                updateOverlay({
                  steps: executionPlan.map((s, idx) =>
                    idx === i ? { ...s, status: 'skipped', completedAt: new Date().toISOString() } : s
                  ),
                });

                continue;
              }
            }

            console.log(`🎮 Starting workflow execution: ${step.label}`);
            // Execute workflow with any auto-fill data from context
            stepResult = await executeWorkflowStep(step, context);
            console.log(`✅ Workflow completed:`, stepResult);
          }
          else if (step.nodeType === 'data_capture') {
            console.log(`📋 Starting data capture execution: ${step.label}`);
            // Execute data capture
            stepResult = await executeDataCaptureStep(step);
            console.log(`✅ Data capture completed:`, stepResult);
            // Merge captured data into context for next steps
            if (stepResult && stepResult.capturedData) {
              context = { ...context, ...stepResult.capturedData };
              console.log(`📊 Updated context with captured data:`, context);
            }
          }
          else if (step.nodeType === 'end') {
            // End node - just mark as completed
            console.log('🏁 Reached end node');
          }
          else {
            // Server-side node (api_call, notification, etc.)
            console.log(`🔄 Sending to server for execution: ${step.nodeType}`);
            stepResult = await executeServerSideNode(executionId, i, step, context);
          }

          // Mark as completed
          completedCount++;
          updateOverlay({
            completedSteps: completedCount,
            steps: executionPlan.map((s, idx) =>
              idx === i ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s
            ),
          });

          console.log(`✅ Step completed: ${step.label}`);

        } catch (stepError) {
          console.error(`❌ Step failed: ${step.label}`, stepError);

          updateOverlay({
            steps: executionPlan.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: 'error',
                    error: stepError.message || 'Unknown error',
                    completedAt: new Date().toISOString(),
                  }
                : s
            ),
          });
        }
      }

      // Completion
      updateOverlay({
        status: 'completed',
        message: '✅ Orchestration completed successfully',
      });

      sendMessageToChatbot({
        type: 'SCOUT_EXECUTION_COMPLETE',
        payload: {
          executionId,
          status: 'success',
          completedSteps: completedCount,
          totalSteps: executionPlan.length,
          message: 'Orchestration completed successfully',
        },
      });

      // Auto-hide after 5 seconds
      setTimeout(() => {
        hideOverlay();
      }, 5000);

    } catch (error) {
      console.error('❌ Execution error:', error);

      updateOverlay({
        status: 'error',
        error: error.message || 'Unknown error',
      });

      sendMessageToChatbot({
        type: 'SCOUT_EXECUTION_ERROR',
        payload: {
          executionId,
          error: error.message || 'Unknown error',
          completedSteps: 0,
          totalSteps: 0,
        },
      });
    }
  }

  /**
   * Load Scout Player script
   */
  async function loadScoutPlayer() {
    if (scoutPlayerLoaded || window.AdoptionPlayer) {
      console.log('✅ Scout Player already loaded');
      scoutPlayerLoaded = true;
      return;
    }

    console.log('📦 Loading Scout Player...');

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = config.scoutPlayerUrl;
      script.async = true;
      script.onload = () => {
        console.log('✅ Scout Player loaded successfully');
        scoutPlayerLoaded = true;
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Scout Player');
        reject(new Error('Failed to load Scout Player'));
      };
      document.head.appendChild(script);
    });
  }

  /**
   * Execute workflow step using Scout Player
   */
  async function executeWorkflowStep(step, context) {
    console.log(`🎮 Executing workflow: ${step.label}`);

    if (!window.AdoptionPlayer) {
      throw new Error('Scout Player not loaded');
    }

    // Navigate to target URL if needed
    if (step.targetUrl && !window.location.href.includes(step.targetUrl)) {
      console.log(`🧭 Navigating to: ${step.targetUrl}`);
      window.location.href = step.targetUrl;

      // Wait for navigation
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true });
      });
    }

    // Create guide object
    const guide = {
      id: step.workflowId,
      name: step.label,
      description: step.description || '',
      recordedActions: step.guideData,
      preWorkflowConfirmationEnabled: false,
    };

    // Prepare auto-fill parameters from context if available
    const autoFillParams = {};
    if (context && step.inputMapping) {
      for (const [key, value] of Object.entries(step.inputMapping)) {
        // Resolve template variables from context
        const resolvedValue = resolveVariable(value, context);
        if (resolvedValue !== undefined) {
          autoFillParams[key] = resolvedValue;
        }
      }
    }

    console.log(`🔧 Auto-fill parameters:`, autoFillParams);

    // Create and start player
    const player = new window.AdoptionPlayer(guide);

    // If we have auto-fill parameters, inject them into the page for Scout Player to use
    if (Object.keys(autoFillParams).length > 0) {
      window.__scoutWorkflowAutoFillData = autoFillParams;
    }

    return new Promise((resolve, reject) => {
      console.log(`⏳ Waiting for workflow completion...`);
      
      // Monitor for completion
      let checkCount = 0;
      const checkCompletion = setInterval(() => {
        checkCount++;
        const progressKey = `scout-adoption-progress:${guide.id}:main`;
        const progressValue = localStorage.getItem(progressKey);
        const hasTooltip = document.querySelector('.scout-adoption-tooltip') !== null;

        // Log every 10 checks (every 5 seconds)
        if (checkCount % 10 === 0) {
          console.log(`⏳ Still waiting... (check ${checkCount})`);
          console.log(`   Progress key exists: ${!!progressValue}`);
          console.log(`   Tooltip exists: ${hasTooltip}`);
        }

        // Workflow is complete when progress key is removed AND tooltip is gone
        if (!progressValue && !hasTooltip) {
          clearInterval(checkCompletion);
          console.log(`✅ Workflow completed after ${checkCount} checks: ${step.label}`);
          
          // Clean up auto-fill data
          delete window.__scoutWorkflowAutoFillData;
          
          resolve();
        }
      }, 500);

      // Timeout after configured time (default 5 minutes)
      const timeout = step.timeout || 300000;
      setTimeout(() => {
        clearInterval(checkCompletion);
        delete window.__scoutWorkflowAutoFillData;
        console.error(`⏱️ Workflow execution timeout after ${timeout}ms`);
        reject(new Error('Workflow execution timeout'));
      }, timeout);

      console.log(`▶️ Starting Scout Player for: ${step.label}`);
      player.start();
      console.log(`▶️ Player.start() called`);
    });
  }

  /**
   * Execute data capture step
   */
  async function executeDataCaptureStep(step) {
    console.log(`📋 Executing data capture: ${step.label}`);
    console.log('📋 Data capture config:', step.config);

    const config = step.config || {};
    const capturedData = {};

    // Auto-discover form fields (enabled by default unless explicitly disabled)
    if (config.autoCapture !== false) {
      console.log('🔍 Auto-discovering form fields...');
      const fields = discoverFormFields();
      console.log(`📊 Discovered ${fields.length} fields:`, fields);

      for (const field of fields) {
        capturedData[field.name] = field.value;
      }
    }

    // Capture specific fields if configured (overrides auto-discovered values)
    if (config.fieldsToCapture && config.fieldsToCapture.length > 0) {
      console.log(`📋 Capturing ${config.fieldsToCapture.length} specific fields...`);

      for (const fieldConfig of config.fieldsToCapture) {
        const value = captureField(fieldConfig);
        if (value !== null && value !== undefined) {
          capturedData[fieldConfig.name] = value;
        } else {
          console.warn(`⚠️ Could not capture field: ${fieldConfig.name}`);
        }
      }
    }

    console.log(`✅ Captured ${Object.keys(capturedData).length} fields:`, capturedData);

    // Show review screen if configured AND there's data to show
    if (config.showReviewScreen !== false && Object.keys(capturedData).length > 0) {
      console.log('📋 Showing data capture review screen...');
      const confirmed = await showDataCaptureReview(capturedData, config);
      if (!confirmed) {
        throw new Error('Data capture cancelled by user');
      }
      console.log('✅ Data capture confirmed by user');
    } else if (Object.keys(capturedData).length === 0) {
      console.warn('⚠️ No data captured! Check that form fields exist on the page.');
    }

    // Return captured data
    const outputVar = config.outputVariable || 'capturedData';
    return {
      [outputVar]: capturedData,
      capturedData: capturedData, // Always include for easy access
    };
  }

  /**
   * Discover all form fields on the page
   */
  function discoverFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input, select, textarea');

    inputs.forEach(element => {
      // Skip hidden, submit, button inputs
      if (element.type === 'hidden' || element.type === 'submit' || element.type === 'button') {
        return;
      }

      const name = element.name || element.id || '';
      if (!name) return;

      let value = '';
      if (element.tagName === 'SELECT') {
        value = element.value || '';
      } else if (element.type === 'checkbox') {
        value = element.checked;
      } else if (element.type === 'radio') {
        if (element.checked) {
          value = element.value;
        } else {
          return; // Skip unchecked radio buttons
        }
      } else {
        value = element.value || '';
      }

      // Try to find label
      let label = '';
      if (element.id) {
        const labelEl = document.querySelector(`label[for="${element.id}"]`);
        if (labelEl) {
          label = labelEl.textContent.trim();
        }
      }
      if (!label && element.placeholder) {
        label = element.placeholder;
      }
      if (!label && element.getAttribute('aria-label')) {
        label = element.getAttribute('aria-label');
      }

      fields.push({
        name: name,
        label: label || name,
        value: value,
      });
    });

    return fields;
  }

  /**
   * Capture a specific field based on configuration
   */
  function captureField(fieldConfig) {
    // Try selectors first
    if (fieldConfig.selectors && fieldConfig.selectors.length > 0) {
      for (const selector of fieldConfig.selectors) {
        try {
          const element = document.querySelector(selector);
          if (element) {
            if (element.tagName === 'SELECT') {
              return element.value;
            } else if (element.type === 'checkbox') {
              return element.checked;
            } else if (element.type === 'radio' && element.checked) {
              return element.value;
            } else {
              return element.value;
            }
          }
        } catch (e) {
          // Invalid selector, continue
        }
      }
    }

    return null;
  }

  /**
   * Show data capture review overlay
   */
  function showDataCaptureReview(capturedData, config) {
    console.log('🎨 Creating data capture review overlay...');
    console.log('📊 Data to review:', capturedData);
    console.log('⚙️ Review config:', config);
    
    return new Promise((resolve) => {
      // Create overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 999999;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: system-ui, -apple-system, sans-serif;
      `;

      const panel = document.createElement('div');
      panel.style.cssText = `
        background: white;
        border-radius: 12px;
        padding: 24px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      `;

      const title = document.createElement('h2');
      title.textContent = '📋 Review Captured Data';
      title.style.cssText = 'margin: 0 0 16px; font-size: 20px; font-weight: 600;';

      const table = document.createElement('table');
      table.style.cssText = 'width: 100%; border-collapse: collapse; margin-bottom: 24px;';

      let tableHTML = '<thead><tr><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Field</th><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Value</th></tr></thead><tbody>';
      
      for (const [key, value] of Object.entries(capturedData)) {
        const displayValue = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
        tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${escapeHtml(key)}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(displayValue)}</td></tr>`;
      }

      tableHTML += '</tbody>';
      table.innerHTML = tableHTML;

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end;';

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding: 10px 20px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;';
      cancelBtn.onclick = () => {
        overlay.remove();
        resolve(false);
      };

      const continueBtn = document.createElement('button');
      continueBtn.textContent = 'Continue';
      continueBtn.style.cssText = 'padding: 10px 20px; border: none; background: #3b82f6; color: white; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;';
      continueBtn.onclick = () => {
        overlay.remove();
        resolve(true);
      };

      buttonContainer.appendChild(cancelBtn);
      buttonContainer.appendChild(continueBtn);

      panel.appendChild(title);
      panel.appendChild(table);
      panel.appendChild(buttonContainer);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      // Auto-continue if configured
      if (config.autoReviewTimeout && config.autoReviewTimeout > 0) {
        setTimeout(() => {
          if (document.body.contains(overlay)) {
            overlay.remove();
            resolve(true);
          }
        }, config.autoReviewTimeout * 1000);
      }
    });
  }

  /**
   * Execute server-side node (API call, notification, etc.)
   */
  async function executeServerSideNode(executionId, nodeIndex, step, context) {
    console.log(`🔄 Executing server-side node: ${step.nodeType}`);

    const response = await fetch(`${config.apiBaseUrl}/api/orchestrations/execute/${executionId}/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeIndex: nodeIndex,
        context: context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server-side execution failed: ${response.statusText}`);
    }

    const result = await response.json();
    return result.output;
  }

  /**
   * Resolve variable from context (supports {{variable}} templates)
   */
  function resolveVariable(template, context) {
    if (typeof template !== 'string') {
      return template;
    }

    // Replace {{variable}} patterns
    return template.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmedName = varName.trim();
      
      // Support nested access like {{trigger.input.name}}
      const parts = trimmedName.split('.');
      let value = context;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          return match; // Keep original if not found
        }
      }
      
      return value !== undefined ? value : match;
    });
  }

  /**
   * Escape HTML for safe display
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Execute workflow step using Scout Player
   */
  /**
   * Send message to chatbot iframe
   */
  function sendMessageToChatbot(message) {
    const chatbotIframes = document.querySelectorAll('iframe[data-scout-chatbot], iframe[src*="scout"]');
    chatbotIframes.forEach(iframe => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(message, '*');
      }
    });
  }

  /**
   * Inject overlay styles
   */
  function injectStyles() {
    if (document.getElementById('scout-orchestration-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'scout-orchestration-styles';
    style.textContent = `
      .scout-orchestration-overlay {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 384px;
        background: white;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
        border: 1px solid #e5e7eb;
        z-index: 99999;
        font-family: system-ui, -apple-system, sans-serif;
      }
      .scout-orchestration-header {
        padding: 16px;
        border-radius: 12px 12px 0 0;
        color: white;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .scout-orchestration-header.running { background: #3b82f6; }
      .scout-orchestration-header.completed { background: #10b981; }
      .scout-orchestration-header.error { background: #ef4444; }
      .scout-orchestration-header-content {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .scout-orchestration-icon {
        font-size: 24px;
      }
      .scout-orchestration-title {
        font-weight: 600;
        font-size: 14px;
      }
      .scout-orchestration-subtitle {
        font-size: 12px;
        opacity: 0.9;
      }
      .scout-orchestration-close {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 12px;
        cursor: pointer;
      }
      .scout-orchestration-close:hover {
        background: rgba(255, 255, 255, 0.3);
      }
      .scout-orchestration-progress {
        padding: 16px;
      }
      .scout-orchestration-progress-text {
        display: flex;
        justify-content: space-between;
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 8px;
      }
      .scout-orchestration-progress-bar {
        width: 100%;
        height: 8px;
        background: #e5e7eb;
        border-radius: 9999px;
        overflow: hidden;
      }
      .scout-orchestration-progress-fill {
        height: 100%;
        background: #3b82f6;
        transition: width 0.3s;
      }
      .scout-orchestration-steps {
        padding: 0 16px 16px;
        max-height: 256px;
        overflow-y: auto;
      }
      .scout-orchestration-step {
        display: flex;
        align-items: start;
        gap: 8px;
        margin-bottom: 8px;
      }
      .scout-orchestration-step-icon {
        margin-top: 2px;
      }
      .scout-orchestration-step-content {
        flex: 1;
      }
      .scout-orchestration-step-label {
        font-size: 13px;
        font-weight: 500;
      }
      .scout-orchestration-step-desc {
        font-size: 11px;
        color: #6b7280;
      }
      .scout-orchestration-message {
        padding: 0 16px 16px;
      }
      .scout-orchestration-message-box {
        font-size: 12px;
        padding: 12px;
        border-radius: 8px;
      }
      .scout-orchestration-message-box.error {
        background: #fee2e2;
        color: #991b1b;
      }
      .scout-orchestration-message-box.info {
        background: #dbeafe;
        color: #1e40af;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Show overlay
   */
  function showOverlay(state) {
    if (!overlayElement) {
      overlayElement = document.createElement('div');
      overlayElement.className = 'scout-orchestration-overlay';
      document.body.appendChild(overlayElement);
    }

    currentExecution = state;
    renderOverlay();
  }

  /**
   * Update overlay
   */
  function updateOverlay(updates) {
    if (!currentExecution) return;

    currentExecution = { ...currentExecution, ...updates };
    renderOverlay();
  }

  /**
   * Hide overlay
   */
  function hideOverlay() {
    if (overlayElement) {
      overlayElement.remove();
      overlayElement = null;
    }
    currentExecution = null;
  }

  /**
   * Render overlay
   */
  function renderOverlay() {
    if (!overlayElement || !currentExecution) return;

    const state = currentExecution;
    const progress = state.totalSteps > 0 ? (state.completedSteps / state.totalSteps) * 100 : 0;

    const statusIcon = {
      running: '⚡',
      completed: '✅',
      error: '❌',
    }[state.status] || '⏺️';

    const stepIcon = {
      completed: '<span style="color: #10b981;">✓</span>',
      running: '<span style="color: #3b82f6;">⚡</span>',
      error: '<span style="color: #ef4444;">✗</span>',
      skipped: '<span style="color: #9ca3af;">○</span>',
      pending: '<span style="color: #d1d5db;">○</span>',
    };

    overlayElement.innerHTML = `
      <div class="scout-orchestration-header ${state.status}">
        <div class="scout-orchestration-header-content">
          <span class="scout-orchestration-icon">${statusIcon}</span>
          <div>
            <div class="scout-orchestration-title">Scout Orchestration</div>
            <div class="scout-orchestration-subtitle">${state.orchestrationName}</div>
          </div>
        </div>
        ${state.status === 'completed' ? '<button class="scout-orchestration-close" onclick="window.ScoutOrchestrationPlayer.hideOverlay()">Close</button>' : ''}
      </div>
      ${state.totalSteps > 0 ? `
        <div class="scout-orchestration-progress">
          <div class="scout-orchestration-progress-text">
            <span>Progress</span>
            <span>${state.completedSteps} / ${state.totalSteps} steps</span>
          </div>
          <div class="scout-orchestration-progress-bar">
            <div class="scout-orchestration-progress-fill" style="width: ${progress}%"></div>
          </div>
        </div>
      ` : ''}
      ${state.steps && state.steps.length > 0 ? `
        <div class="scout-orchestration-steps">
          ${state.steps.map(step => `
            <div class="scout-orchestration-step">
              <div class="scout-orchestration-step-icon">${stepIcon[step.status] || stepIcon.pending}</div>
              <div class="scout-orchestration-step-content">
                <div class="scout-orchestration-step-label">${step.label}</div>
                ${step.description ? `<div class="scout-orchestration-step-desc">${step.description}</div>` : ''}
                ${step.error ? `<div class="scout-orchestration-step-desc" style="color: #ef4444;">${step.error}</div>` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      ${state.message || state.error ? `
        <div class="scout-orchestration-message">
          <div class="scout-orchestration-message-box ${state.error ? 'error' : 'info'}">
            ${state.error || state.message}
          </div>
        </div>
      ` : ''}
    `;
  }

  // Expose public API
  window.ScoutOrchestrationPlayer = {
    init,
    hideOverlay,
  };

  // Auto-init on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
