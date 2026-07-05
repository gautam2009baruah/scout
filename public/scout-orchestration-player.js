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
    scoutPlayerUrl: '/scout-smart-adoption-player.js', // Use smart player (same as chatbot)
    targetAppId: null, // Will be set from payload
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
   * Query element by selector (handles both CSS and XPath)
   */
  function queryElement(selector) {
    // Check if it's an XPath selector (starts with / or //)
    if (selector.startsWith('/') || selector.startsWith('//')) {
      try {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        return result.singleNodeValue;
      } catch (xpathError) {
        console.warn(`⚠️ XPath evaluation failed for: ${selector}`, xpathError);
        return null;
      }
    } else {
      // CSS selector
      try {
        return document.querySelector(selector);
      } catch (cssError) {
        console.warn(`⚠️ CSS selector failed for: ${selector}`, cssError);
        return null;
      }
    }
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
    const { executionId, orchestrationId, orchestrationName, triggerData, targetAppId, scoutBaseUrl } = payload;
    let context = payload.context || {}; // Use let so we can reassign when capturing data
    let pendingClearData = null; // Track captured data keys to clear after next step (one-step retention)
    let dataCapturedAtStep = -1; // Track which step captured the data
    
    // Update config with targetAppId from payload
    if (targetAppId) {
      config.targetAppId = targetAppId;
    }
    if (scoutBaseUrl) {
      config.apiBaseUrl = scoutBaseUrl;
    }

    console.log('🎬 Starting in-context execution:', { executionId, orchestrationName, targetAppId });

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

      // Overlay disabled per user request - no progress screen shown
      // showOverlay({
      //   executionId,
      //   orchestrationName,
      //   status: 'running',
      //   completedSteps: 0,
      //   totalSteps: executionPlan.length,
      //   steps: executionPlan,
      // });

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
              console.log(`🔍 Checking phrase match for workflow "${step.label}":`);
              console.log(`   matchRequired: ${step.matchRequired}`);
              console.log(`   triggerPhrases: ${JSON.stringify(step.triggerPhrases)}`);
              console.log(`   matchedPhrase: "${matchedPhrase}"`);
              console.log(`   matchedIntent: "${matchedIntent}"`);
              
              const matches = step.triggerPhrases.some(phrase =>
                phrase.toLowerCase() === matchedPhrase?.toLowerCase() ||
                phrase.toLowerCase().includes(matchedIntent?.toLowerCase())
              );

              console.log(`   Match result: ${matches}`);

              if (!matches) {
                console.log(`⏭️ Skipping step "${step.label}" - phrase didn't match`);
                console.log(`   To execute this workflow, trigger phrases must match the chatbot query`);

                updateOverlay({
                  steps: executionPlan.map((s, idx) =>
                    idx === i ? { ...s, status: 'skipped', completedAt: new Date().toISOString() } : s
                  ),
                });

                continue;
              }
              
              console.log(`✅ Phrase matched! Proceeding with workflow execution`);
            } else {
              console.log(`ℹ️ No phrase matching required for workflow "${step.label}", executing unconditionally`);
            }

            console.log(`🎮 Starting workflow execution: ${step.label}`);
            // Execute workflow with any auto-fill data from context
            stepResult = await executeWorkflowStep(step, context);
            console.log(`✅ Workflow completed:`, stepResult);
          }
          else if (step.nodeType === 'data_capture') {
            console.log(`📋 Starting data capture execution: ${step.label}`);
            console.log(`🔍 Data capture step has guideData:`, step.guideData ? 'YES' : 'NO');
            console.log(`🔍 GuideData length:`, step.guideData?.length);
            // Execute data capture
            stepResult = await executeDataCaptureStep(step);
            
            // Check if user cancelled
            if (stepResult && stepResult.cancelled) {
              console.log('ℹ️ Orchestration stopped: User cancelled data capture');
              alert('You cancelled the data capture. The orchestration has been stopped.');
              
              // Mark as skipped
              updateOverlay({
                steps: executionPlan.map((s, idx) =>
                  idx === i ? { ...s, status: 'skipped', completedAt: new Date().toISOString() } : s
                ),
              });
              
              // Stop execution gracefully
              return;
            }
            
            console.log(`✅ Data capture completed:`, stepResult);
            // Merge captured data into context for NEXT step only (one-step retention)
            if (stepResult && stepResult.capturedData) {
              const capturedKeys = Object.keys(stepResult.capturedData);
              context = { ...context, ...stepResult.capturedData };
              // Schedule these keys for cleanup after next step completes
              pendingClearData = capturedKeys;
              dataCapturedAtStep = i; // Track which step captured the data
              console.log(`📊 Updated context with captured data (will be cleared after step ${i + 2}):`, capturedKeys);
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

          // Clear captured data AFTER the consuming step completes (one-step retention)
          // Only clear if: 1) there's pending data, 2) current step is AFTER the capture step
          if (pendingClearData && i > dataCapturedAtStep) {
            console.log(`🧹 Clearing captured data after step ${i + 1} (data from step ${dataCapturedAtStep + 1}): [${pendingClearData.join(', ')}]`);
            for (const key of pendingClearData) {
              delete context[key];
            }
            pendingClearData = null;
            dataCapturedAtStep = -1;
          }

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
    if (scoutPlayerLoaded || window.ScoutAdoptionPlayer) {
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
   * Unified Scout tooltip monitor
   * - Always tracks elements Scout highlights (for data capture)
   * - Conditionally auto-fills if captured data exists
   */
  function setupUnifiedScoutMonitor(capturedData, workflowId) {
    const hasAutoFillData = Object.keys(capturedData).length > 0;
    console.log('👀 Unified Scout monitor active');
    console.log(`   📋 Element tracking: ENABLED`);
    console.log(`   🤖 Auto-fill: ${hasAutoFillData ? 'ENABLED' : 'DISABLED'} (${Object.keys(capturedData).length} fields)`);
    
    let fillCount = 0;
    
    // Observer for tooltip appearing
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          // Check if this is a Scout tooltip
          if (node.nodeType === Node.ELEMENT_NODE && 
              (node.classList?.contains('scout-adoption-tooltip') || 
               node.querySelector?.('.scout-adoption-tooltip'))) {
            
            console.log('🎯 Scout tooltip detected, waiting 4s for Scout to highlight control...');
            
            // Wait 4 seconds for Scout to highlight and focus the element
            setTimeout(() => {
              // Poll for Scout to focus the element
              let attempts = 0;
              const maxAttempts = 140; // 140 attempts × 50ms = 7 seconds max
              
              const pollForFocus = () => {
                attempts++;
                
                // Check if Scout has focused an input element
                if (document.activeElement && 
                    ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                  
                  const element = document.activeElement;
                  console.log(`   ✅ Element focused after ${attempts * 50}ms (+ 4s initial wait)`);
                  
                  // ALWAYS track the element (for data capture)
                  if (!window.__scoutDataCaptureElements.includes(element)) {
                    window.__scoutDataCaptureElements.push(element);
                    console.log(`   📋 Tracked: ${element.tagName} (total: ${window.__scoutDataCaptureElements.length})`);
                  }
                  
                  // Try auto-fill ONLY if we have captured data
                  if (hasAutoFillData) {
                    findAndFillHighlightedControl(element);
                  }
                  
                } else if (attempts < maxAttempts) {
                  setTimeout(pollForFocus, 50);
                } else {
                  console.log(`   ⏱️ Timeout after ${attempts * 50}ms (+ 4s initial wait)`);
                }
              };
              
              pollForFocus();
            }, 4000); // Wait 4 seconds for Scout to highlight the control
          }
        }
      }
    
    // Function to find and fill the highlighted control
    function findAndFillHighlightedControl(element) {
      console.log('🔍 Auto-fill attempt for:', element.tagName, element.type, element.name || element.id || '(no name/id)');
      
      // Extract metadata and try to match
      const elementMetadata = extractElementMetadata(element);
      console.log('📊 Element metadata:', elementMetadata);
      
      // Try to match with ANY field in captured data
      const matchedField = findMatchingCapturedField(elementMetadata, capturedData);
      
      if (matchedField) {
        console.log(`✅ Match found: "${matchedField.label}" → filling with "${matchedField.value}"`);
        
        // Auto-fill the element
        if (element.tagName === 'SELECT') {
          const options = Array.from(element.options);
          const matchingOption = options.find(opt => 
            opt.value === matchedField.value || opt.text === matchedField.value
          );
          if (matchingOption) {
            element.value = matchingOption.value;
            console.log(`   📋 Set SELECT to value "${matchingOption.value}"`);
          } else {
            element.value = matchedField.value;
            console.log(`   📋 Set SELECT to value "${matchedField.value}" (direct)`);
          }
        } else if (element.type === 'checkbox') {
          element.checked = !!matchedField.value;
        } else if (element.type === 'radio') {
          element.checked = element.value === matchedField.value;
        } else {
          element.value = matchedField.value;
        }
        
        // Trigger events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        
        fillCount++;
        console.log(`🎉 Auto-filled successfully (total fills: ${fillCount})`);
      } else {
        console.log('⚠️ No match found in captured data for this element');
      }
    }
    
    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Store observer reference
    window.__scoutUnifiedObserver = observer;
    window.__scoutWorkflowId = workflowId;
    
    console.log('✅ Unified monitor active');
  }

  /**
   * Extract metadata from a DOM element (similar to what Scout training captures)
   */
  function extractElementMetadata(element) {
    const metadata = {
      tagName: element.tagName.toLowerCase(),
      type: element.type || '',
      name: element.name || '',
      id: element.id || '',
      placeholder: element.placeholder || '',
      ariaLabel: element.getAttribute('aria-label') || '',
      value: element.value || '',
    };
    
    // Try multiple ways to find label
    let labelText = '';
    
    // Method 1: label[for=id]
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        labelText = label.textContent.trim();
      }
    }
    
    // Method 2: parent label
    if (!labelText) {
      const parentLabel = element.closest('label');
      if (parentLabel) {
        labelText = parentLabel.textContent.trim();
      }
    }
    
    // Method 3: preceding sibling label
    if (!labelText) {
      let sibling = element.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === 'LABEL') {
          labelText = sibling.textContent.trim();
          break;
        }
        sibling = sibling.previousElementSibling;
      }
    }
    
    // Method 4: nearby text (div/span before the input)
    if (!labelText) {
      const parent = element.parentElement;
      if (parent) {
        // Look for text in previous siblings
        let prev = element.previousElementSibling;
        if (prev && (prev.tagName === 'DIV' || prev.tagName === 'SPAN')) {
          const text = prev.textContent.trim();
          if (text && text.length < 50) { // Reasonable label length
            labelText = text;
          }
        }
      }
    }
    
    metadata.labelText = labelText;
    
    // Get accessible name
    metadata.accessibleName = element.getAttribute('aria-label') || labelText || '';
    
    return metadata;
  }

  /**
   * Find matching captured field based on element metadata
   */
  function findMatchingCapturedField(elementMetadata, capturedData) {
    console.log('🔍 Attempting to match highlighted control...');
    console.log('   Element metadata:', {
      tagName: elementMetadata.tagName,
      type: elementMetadata.type,
      name: elementMetadata.name || '(none)',
      id: elementMetadata.id || '(none)',
      labelText: elementMetadata.labelText || '(none)',
      placeholder: elementMetadata.placeholder || '(none)',
      ariaLabel: elementMetadata.ariaLabel || '(none)'
    });
    
    let bestMatch = null;
    let bestScore = 0;
    let bestFieldName = '';
    const scores = {};
    
    for (const [fieldName, fieldData] of Object.entries(capturedData)) {
      const capturedMetadata = fieldData.metadata?.elementIdentity || {};
      let score = 0;
      
      console.log(`   Checking against captured field: "${fieldName}"`);
      console.log('     Captured label:', fieldData.label || '(none)');
      console.log('     Captured metadata:', {
        tagName: capturedMetadata.tagName || '(none)',
        labelText: capturedMetadata.labelText || '(none)',
        placeholder: capturedMetadata.placeholder || '(none)',
        name: capturedMetadata.name || '(none)',
        id: capturedMetadata.id || '(none)'
      });
      
      // Exact matches
      if (elementMetadata.labelText && elementMetadata.labelText.toLowerCase() === (capturedMetadata.labelText || '').toLowerCase()) {
        score += 100;
        console.log('     +100 labelText exact match');
      }
      if (elementMetadata.name && elementMetadata.name === capturedMetadata.name) {
        score += 90;
        console.log('     +90 name exact match');
      }
      if (elementMetadata.id && elementMetadata.id === capturedMetadata.id) {
        score += 90;
        console.log('     +90 id exact match');
      }
      if (elementMetadata.placeholder && elementMetadata.placeholder === capturedMetadata.placeholder) {
        score += 80;
        console.log('     +80 placeholder exact match');
      }
      
      // Label comparison
      if (elementMetadata.labelText && fieldData.label && 
          elementMetadata.labelText.toLowerCase() === fieldData.label.toLowerCase()) {
        score += 100;
        console.log('     +100 label exact match');
      }
      
      // Normalized comparison
      const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
      const elementNorm = normalize(elementMetadata.labelText || elementMetadata.placeholder || '');
      const capturedNorm = normalize(capturedMetadata.labelText || fieldData.label || '');
      
      if (elementNorm && capturedNorm && elementNorm === capturedNorm) {
        score += 70;
        console.log('     +70 normalized match');
      }
      
      console.log(`     Total score: ${score}`);
      scores[fieldName] = score;
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = fieldData;
        bestFieldName = fieldName;
      }
    }
    
    console.log(`   Best match: "${bestFieldName}" with score ${bestScore} (threshold: 70)`);
    
    // Only return match if score is high enough
    return bestScore >= 70 ? bestMatch : null;
  }

  /**
   * Execute workflow step using Scout Player (SMART API - same as chatbot)
   */
  async function executeWorkflowStep(step, context) {
    console.log(`🎮 Executing workflow: ${step.label}`);

    // Wait for Scout Player to be available (with retry logic)
    if (!window.ScoutAdoptionPlayer) {
      console.log('⏳ Scout Player not immediately available, waiting...');
      
      let retries = 0;
      const maxRetries = 20; // 10 seconds max wait
      
      while (!window.ScoutAdoptionPlayer && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 500));
        retries++;
        console.log(`⏳ Waiting for Scout Player... (attempt ${retries}/${maxRetries})`);
      }
      
      if (!window.ScoutAdoptionPlayer) {
        throw new Error('Scout Player not loaded after waiting 10 seconds. Make sure scout-smart-adoption-player.js is loaded.');
      }
      
      console.log('✅ Scout Player is now available');
    }

    // Initialize player handle (same as chatbot does)
    console.log('🔧 Initializing Scout Player handle...');
    const handle = await window.ScoutAdoptionPlayer.init({
      scoutBaseUrl: config.apiBaseUrl,
      targetAppId: config.targetAppId || 'default-app',
      autoShowLauncher: false
    });
    
    console.log('✅ Scout Player handle initialized');

    // Navigate to target URL if needed
    if (step.targetUrl && !window.location.href.includes(step.targetUrl)) {
      console.log(`🧭 Navigating to: ${step.targetUrl}`);
      window.location.href = step.targetUrl;

      // Wait for navigation
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true });
      });
    }

    // Initialize element tracking list for data capture
    console.log('📋 Initializing unified Scout tooltip monitor...');
    window.__scoutDataCaptureElements = [];
    
    // Prepare captured data for auto-fill (if enabled)
    const workflowConfig = step.config || {};
    let capturedData = {};
    
    if (workflowConfig.autoFillFromDataCapture && context) {
      console.log('🤖 Auto-fill enabled - will attempt to fill matched fields');
      console.log('📊 Context data available:', Object.keys(context).length, 'fields');
      
      // Filter context to only include captured data fields (objects with value/metadata)
      for (const [key, value] of Object.entries(context)) {
        if (value && typeof value === 'object' && 'value' in value && 'metadata' in value) {
          capturedData[key] = value;
        }
      }
      
      if (Object.keys(capturedData).length === 0) {
        console.log('⚠️ No captured data found in context');
      }
    } else {
      console.log('ℹ️ Auto-fill disabled for this workflow');
    }
    
    // Set up unified monitor (tracks elements + auto-fills if data exists)
    setupUnifiedScoutMonitor(capturedData, step.workflowId);

    // Start the workflow using the handle (same as chatbot)
    console.log(`▶️ Starting workflow: ${step.workflowId}`);
    handle.play(step.workflowId);

    return new Promise((resolve, reject) => {
      console.log(`⏳ Waiting for workflow completion...`);
      
      // Monitor for completion
      let checkCount = 0;
      const checkCompletion = setInterval(() => {
        checkCount++;
        const progressKey = `scout-adoption-progress:${step.workflowId}:main`;
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
          
          // Clean up auto-fill data and observer
          
          // Clean up auto-fill data and observer
          delete window.__scoutWorkflowAutoFillData;
          if (window.__scoutUnifiedObserver) {
            window.__scoutUnifiedObserver.disconnect();
            delete window.__scoutUnifiedObserver;
            delete window.__scoutWorkflowId;
            console.log('🧹 Cleaned up unified monitor');
          }
          
          resolve();
        }
      }, 500);

      // Timeout after configured time (default 5 minutes)
      const timeout = step.timeout || 300000;
      setTimeout(() => {
        clearInterval(checkCompletion);
        delete window.__scoutWorkflowAutoFillData;
        // Clean up observer on timeout
        if (window.__scoutUnifiedObserver) {
          window.__scoutUnifiedObserver.disconnect();
          delete window.__scoutUnifiedObserver;
          delete window.__scoutWorkflowId;
        }
        console.error(`⏱️ Workflow execution timeout after ${timeout}ms`);
        reject(new Error('Workflow execution timeout'));
      }, timeout);
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

    // Capture only fields from the workflow that was just executed
    if (step.guideData && Array.isArray(step.guideData) && step.guideData.length > 0) {
      console.log('🔍 Capturing data from workflow-highlighted fields...');
      const workflowFields = captureFieldsFromWorkflowSteps(step.guideData);
      console.log(`📊 Captured ${workflowFields.length} fields from workflow:`, workflowFields);

      for (const field of workflowFields) {
        // Store full field object with metadata (not just value)
        capturedData[field.name] = {
          value: field.value,
          label: field.label,
          type: field.type,
          element: field.element,
          metadata: field.metadata,
        };
      }
    } else {
      console.log('⚠️ No guide data available, skipping data capture');
      console.log('⚠️ step.guideData:', step.guideData);
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
        console.log('ℹ️ User cancelled data capture');
        return { cancelled: true, message: 'Data capture was cancelled' };
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
   * Capture fields from workflow steps (only fields that Scout Player highlighted)
   * Uses the tracked elements list instead of selectors
   */
  function captureFieldsFromWorkflowSteps(steps) {
    const fields = [];
    
    // Use tracked elements instead of selectors
    const trackedElements = window.__scoutDataCaptureElements || [];
    console.log(`🔍 Processing ${trackedElements.length} Scout-tracked elements...`);
    
    if (trackedElements.length === 0) {
      console.warn('⚠️ No elements were tracked during workflow execution!');
      return fields;
    }
    
    // Capture data from each tracked element
    for (const element of trackedElements) {
      if (!element || !['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
        continue;
      }
      
      try {
        // Get label from DOM
        let label = '';
        
        // Try to find label element
        if (element.id) {
          const labelEl = document.querySelector(`label[for="${element.id}"]`);
          if (labelEl) {
            label = labelEl.textContent.trim();
          }
        }
        
        // Try aria-label
        if (!label) {
          label = element.getAttribute('aria-label') || '';
        }
        
        // Try placeholder
        if (!label) {
          label = element.placeholder || '';
        }
        
        // Try nearby label
        if (!label) {
          const parent = element.parentElement;
          if (parent?.tagName === 'LABEL') {
            label = parent.textContent.replace(element.value || '', '').trim();
          } else if (element.previousElementSibling?.tagName === 'LABEL') {
            label = element.previousElementSibling.textContent.trim();
          }
        }
        
        // Get field name from label
        let name = '';
        if (label) {
          name = label.toLowerCase()
            .trim()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50);
        }
        
        // Fallback to element attributes
        if (!name) {
          name = element.name || element.id || '';
        }
        
        // Last resort
        if (!name) {
          name = `field_${fields.length}`;
          label = label || name;
        }
        
        // Get value
        let value = '';
        if (element.tagName === 'SELECT') {
          value = element.value || '';
        } else if (element.type === 'checkbox') {
          value = element.checked;
        } else if (element.type === 'radio' && element.checked) {
          value = element.value;
        } else {
          value = element.value || '';
        }
        
        console.log(`📝 Captured field: ${name} = "${value}" (label: "${label}")`);
        
        fields.push({
          name: name,
          label: label,
          value: value,
          element: element.tagName,
          type: element.type || 'text',
          metadata: {
            elementIdentity: {
              tagName: element.tagName.toLowerCase(),
              type: element.type || 'text',
              labelText: label,
              id: element.id || '',
              name: element.name || '',
              placeholder: element.placeholder || '',
              ariaLabel: element.getAttribute('aria-label') || ''
            }
          },
        });
      } catch (e) {
        console.warn(`⚠️ Failed to capture from tracked element:`, e);
      }
    }
    
    // Clean up tracking list
    if (window.__scoutDataCaptureElements) {
      console.log(`🧹 Clearing ${window.__scoutDataCaptureElements.length} tracked elements`);
      window.__scoutDataCaptureElements = [];
    }
    // Note: Unified observer is cleaned up at workflow end, not here
    
    console.log(`✅ Captured ${fields.length} fields from tracked elements`);
    return fields;
  }

  /**
   * Discover all form fields on the page (DEPRECATED - use captureFieldsFromWorkflowSteps)
   */
  function discoverFormFields() {
    const fields = [];
    const inputs = document.querySelectorAll('input, select, textarea');

    console.log(`🔍 Found ${inputs.length} total input elements on page`);

    inputs.forEach((element, index) => {
      // Skip hidden, submit, button inputs
      if (element.type === 'hidden' || element.type === 'submit' || element.type === 'button') {
        console.log(`⏭️ Skipping ${element.type} input`);
        return;
      }

      // Generate a unique identifier for the field
      // Priority: name > id > generate from label/placeholder > fallback to index
      let name = element.name || element.id || '';
      
      if (!name) {
        // Try to generate name from label or placeholder
        if (element.id) {
          const labelEl = document.querySelector(`label[for="${element.id}"]`);
          if (labelEl) {
            name = labelEl.textContent.trim().toLowerCase().replace(/\s+/g, '_');
          }
        }
        
        if (!name && element.placeholder) {
          name = element.placeholder.toLowerCase().replace(/\s+/g, '_');
        }
        
        if (!name && element.getAttribute('aria-label')) {
          name = element.getAttribute('aria-label').toLowerCase().replace(/\s+/g, '_');
        }
        
        // Last resort: use element type and index
        if (!name) {
          name = `${element.tagName.toLowerCase()}_${index}`;
          console.log(`⚠️ Generated fallback name for field: ${name}`);
        }
      }

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
      if (!label) {
        label = name;
      }

      console.log(`📝 Discovered field: ${name} = "${value}" (label: "${label}")`);

      fields.push({
        name: name,
        label: label,
        value: value,
        element: element.tagName,
        type: element.type || 'text',
      });
    });

    console.log(`✅ Discovered ${fields.length} capturable fields`);
    return fields;
  }

  /**
   * Smart field matching: Match captured data fields to workflow step fields
   * Uses semantic/fuzzy matching with metadata from training plugin
   * 
   * @param {Array} workflowSteps - Workflow steps with elementIdentity metadata
   * @param {Object} capturedData - Captured data from previous data_capture node
   * @returns {Object} - Mapping of workflow field selectors to captured values
   */
  function smartMatchFields(workflowSteps, capturedData) {
    console.log('🤖 Starting smart field matching...');
    console.log('📊 Workflow steps:', workflowSteps.length);
    console.log('📊 Captured fields:', Object.keys(capturedData).length);
    
    // Debug: show FULL structure of first workflow step to see what metadata is available
    if (workflowSteps.length > 0) {
      console.log('🔬 FULL structure of first workflow step:', JSON.stringify(workflowSteps[0], null, 2));
    }
    
    // Debug: show FULL structure of first captured field to see what metadata is available
    const firstCapturedKey = Object.keys(capturedData)[0];
    if (firstCapturedKey) {
      console.log('🔬 FULL structure of first captured field:', JSON.stringify(capturedData[firstCapturedKey], null, 2));
    }
    
    // Debug: show all workflow step types and descriptions
    console.log('📋 Workflow step details:');
    workflowSteps.forEach((step, idx) => {
      console.log(`  Step ${idx}: type="${step.type}", label="${step.elementIdentity?.labelText || step.stepDescription}", hasSelectors=${!!(step.selectorCandidates?.length || step.elementIdentity?.selectorCandidates?.length)}`);
    });
    
    // Debug: show captured data details
    console.log('📦 Captured data details:');
    for (const [key, value] of Object.entries(capturedData)) {
      console.log(`  Field: "${key}", label="${value.label}", value="${value.value}"`);
    }
    
    const matches = {};
    
    // Iterate through workflow steps (target fields)
    for (const step of workflowSteps) {
      const stepIdentity = step.elementIdentity || {};
      
      console.log(`\n🔍 Processing step: type="${step.type}", label="${stepIdentity.labelText || step.stepDescription}"`);
      
      // Check if this is an input-related step based on elementIdentity.tagName
      const isInputElement = stepIdentity.tagName && ['input', 'select', 'textarea'].includes(stepIdentity.tagName.toLowerCase());
      const isInputStep = ['input', 'change', 'select', 'click', 'manual-select'].includes(step.type);
      
      // Skip non-input steps (unless the element itself is an input field)
      if (!isInputStep && !isInputElement) {
        console.log(`  ⏭️ Skipping: not an input step (type: ${step.type}, tagName: ${stepIdentity.tagName})`);
        continue;
      }
      
      // If it's an input element but wrong step type, allow it (Scout recorded as manual-select)
      if (isInputElement) {
        console.log(`  ✅ Input element detected (tagName: ${stepIdentity.tagName}), proceeding with matching`);
      }
      
      // Skip if no selector candidates (can't fill without selector)
      if (!step.selectorCandidates?.length && !stepIdentity.selectorCandidates?.length) {
        console.log(`  ⏭️ Skipping: no selectors available`);
        continue;
      }
      
      console.log(`  ✅ Step qualifies for matching (type: ${step.type}, has selectors)`);
      
      // Get all possible identifiers for this workflow field
      const workflowIdentifiers = {
        labelText: (stepIdentity.labelText || '').toLowerCase().trim(),
        ariaLabel: (stepIdentity.ariaLabel || '').toLowerCase().trim(),
        placeholder: (stepIdentity.placeholder || '').toLowerCase().trim(),
        accessibleName: (stepIdentity.accessibleName || '').toLowerCase().trim(),
        nearbyHeading: (stepIdentity.nearbyHeading || '').toLowerCase().trim(),
        name: (stepIdentity.name || '').toLowerCase().trim(),
        id: (stepIdentity.id || '').toLowerCase().trim(),
      };
      
      console.log(`🔍 Matching workflow field:`, {
        label: workflowIdentifiers.labelText,
        name: workflowIdentifiers.name,
        id: workflowIdentifiers.id,
      });
      
      let bestMatch = null;
      let bestScore = 0;
      
      // Compare with each captured field
      for (const [capturedFieldName, capturedFieldData] of Object.entries(capturedData)) {
        const capturedMetadata = capturedFieldData.metadata?.elementIdentity || {};
        
        // Get all possible identifiers for this captured field
        const capturedIdentifiers = {
          labelText: (capturedMetadata.labelText || '').toLowerCase().trim(),
          ariaLabel: (capturedMetadata.ariaLabel || '').toLowerCase().trim(),
          placeholder: (capturedMetadata.placeholder || '').toLowerCase().trim(),
          accessibleName: (capturedMetadata.accessibleName || '').toLowerCase().trim(),
          nearbyHeading: (capturedMetadata.nearbyHeading || '').toLowerCase().trim(),
          name: (capturedMetadata.name || '').toLowerCase().trim(),
          id: (capturedMetadata.id || '').toLowerCase().trim(),
          fieldName: capturedFieldName.toLowerCase().trim(),
          label: (capturedFieldData.label || '').toLowerCase().trim(),
        };
        
        console.log(`  ↔️ Comparing with captured: ${capturedFieldData.label} (name: ${capturedIdentifiers.name}, fieldName: ${capturedFieldName})`);
        
        // Calculate match score
        let score = 0;
        const scoreDetails = [];
        
        // Exact matches (highest priority)
        if (workflowIdentifiers.labelText && workflowIdentifiers.labelText === capturedIdentifiers.labelText) {
          score += 100;
          scoreDetails.push('labelText exact match: +100');
        }
        if (workflowIdentifiers.name && workflowIdentifiers.name === capturedIdentifiers.name) {
          score += 90;
          scoreDetails.push('name exact match: +90');
        }
        if (workflowIdentifiers.id && workflowIdentifiers.id === capturedIdentifiers.id) {
          score += 90;
          scoreDetails.push('id exact match: +90');
        }
        if (workflowIdentifiers.ariaLabel && workflowIdentifiers.ariaLabel === capturedIdentifiers.ariaLabel) {
          score += 80;
          scoreDetails.push('ariaLabel exact match: +80');
        }
        
        // Also compare workflow field against captured field's label (important!)
        if (workflowIdentifiers.labelText && capturedIdentifiers.label && 
            workflowIdentifiers.labelText === capturedIdentifiers.label) {
          score += 100;
          scoreDetails.push('workflow labelText = captured label: +100');
        }
        
        // Partial matches (medium priority)
        if (workflowIdentifiers.labelText && capturedIdentifiers.labelText && 
            (workflowIdentifiers.labelText.includes(capturedIdentifiers.labelText) || 
             capturedIdentifiers.labelText.includes(workflowIdentifiers.labelText))) {
          score += 60;
          scoreDetails.push('labelText partial match: +60');
        }
        
        if (workflowIdentifiers.labelText && capturedIdentifiers.label && 
            (workflowIdentifiers.labelText.includes(capturedIdentifiers.label) || 
             capturedIdentifiers.label.includes(workflowIdentifiers.labelText))) {
          score += 60;
          scoreDetails.push('workflow labelText vs captured label partial: +60');
        }
        
        if (workflowIdentifiers.placeholder && capturedIdentifiers.placeholder && 
            (workflowIdentifiers.placeholder.includes(capturedIdentifiers.placeholder) || 
             capturedIdentifiers.placeholder.includes(workflowIdentifiers.placeholder))) {
          score += 40;
          scoreDetails.push('placeholder partial match: +40');
        }
        
        // Normalize and compare (handle camelCase, snake_case, spaces)
        const normalizeString = (str) => str.replace(/[^a-z0-9]/g, '');
        const workflowNormalized = normalizeString(workflowIdentifiers.labelText || workflowIdentifiers.name);
        const capturedNormalized = normalizeString(capturedIdentifiers.labelText || capturedIdentifiers.label || capturedIdentifiers.fieldName);
        
        if (workflowNormalized && capturedNormalized && workflowNormalized === capturedNormalized) {
          score += 70;
          scoreDetails.push(`normalized match: +70 (${workflowNormalized} = ${capturedNormalized})`);
        }
        
        // Common semantic matches (lower priority)
        const semanticPairs = [
          ['email', 'emailaddress', 'email_address', 'e-mail'],
          ['phone', 'phonenumber', 'phone_number', 'telephone', 'tel'],
          ['firstname', 'first_name', 'fname', 'given_name', 'givenname'],
          ['lastname', 'last_name', 'lname', 'surname', 'family_name', 'familyname'],
          ['address', 'street', 'streetaddress', 'street_address'],
          ['city', 'town'],
          ['state', 'province', 'region'],
          ['zip', 'zipcode', 'postalcode', 'postal_code', 'postcode'],
          ['country', 'nation'],
        ];
        
        for (const synonyms of semanticPairs) {
          const workflowInGroup = synonyms.some(syn => workflowNormalized.includes(syn));
          const capturedInGroup = synonyms.some(syn => capturedNormalized.includes(syn));
          if (workflowInGroup && capturedInGroup) {
            score += 50;
            scoreDetails.push(`semantic match: +50 (${synonyms[0]} group)`);
          }
        }
        
        // Log score if any points earned
        if (score > 0) {
          console.log(`    Score: ${score} - ${scoreDetails.join(', ')}`);
        }
        
        // Update best match if this score is higher
        if (score > bestScore) {
          bestScore = score;
          bestMatch = {
            capturedFieldName,
            capturedValue: capturedFieldData.value,
            score,
            scoreDetails,
          };
        }
      }
      
      // Only use matches with score >= 40 (lower threshold for better matching)
      if (bestMatch && bestScore >= 40) {
        // Get selector for this workflow step (prioritize queryable selectors)
        let selector = null;
        
        // Try to find a valid CSS or XPath selector (not label-text type)
        const allCandidates = [...(step.selectorCandidates || []), ...(stepIdentity.selectorCandidates || [])];
        
        // Prioritize: placeholder > css > xpath (skip label-text as it's not a valid DOM selector)
        const validCandidate = allCandidates.find(c => 
          c.type && ['placeholder', 'css', 'xpath'].includes(c.type)
        );
        
        if (validCandidate) {
          selector = validCandidate.value;
          console.log(`   Using selector: type="${validCandidate.type}", value="${selector}"`);
        } else {
          // Fallback: use first selector if it doesn't look like label text
          const fallback = allCandidates[0];
          if (fallback && fallback.value && !fallback.value.match(/^[A-Z]/)) {
            selector = fallback.value;
            console.log(`   Using fallback selector: "${selector}"`);
          }
        }
        
        if (selector) {
          matches[selector] = {
            value: bestMatch.capturedValue,
            confidence: bestScore,
            capturedField: bestMatch.capturedFieldName,
          };
          console.log(`✅ MATCHED: "${stepIdentity.labelText || 'unknown'}" ← "${bestMatch.capturedFieldName}" (score: ${bestScore})`);
          console.log(`   Details: ${bestMatch.scoreDetails.join(', ')}`);
        } else {
          console.warn(`⚠️ Match found but no valid selector available for: ${stepIdentity.labelText || 'unknown'}`);
          console.warn(`   Available selectors:`, allCandidates.map(c => `${c.type}: ${c.value}`));
        }
      } else if (bestMatch) {
        console.log(`❌ Low confidence - skipped: "${stepIdentity.labelText || 'unknown'}" ← "${bestMatch.capturedFieldName}" (score: ${bestScore}, need >=40)`);
      } else {
        console.log(`❌ No match found for: "${stepIdentity.labelText || 'unknown'}"`);
      }
    }
    
    console.log(`🤖 Smart matching complete: ${Object.keys(matches).length} matches found`);
    return matches;
  }

  /**
   * Capture a specific field based on configuration
   */
  function captureField(fieldConfig) {
    // Try selectors first
    if (fieldConfig.selectors && fieldConfig.selectors.length > 0) {
      for (const selector of fieldConfig.selectors) {
        try {
          const element = queryElement(selector);
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

      const allowEdit = config.allowUserEdit !== false; // enabled by default
      const editedData = { ...capturedData }; // Store edited values

      let tableHTML = '<thead><tr><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Field</th><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Value</th></tr></thead><tbody>';
      
      for (const [key, value] of Object.entries(capturedData)) {
        // Extract actual value from object structure { value, label, type, metadata }
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        const fieldLabel = (value && typeof value === 'object' && 'label' in value) ? value.label : key;
        const displayValue = typeof actualValue === 'boolean' ? (actualValue ? 'Yes' : 'No') : String(actualValue);
        
        if (allowEdit) {
          const inputId = `edit_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
          if (typeof actualValue === 'boolean') {
            tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${escapeHtml(fieldLabel)}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><input type="checkbox" id="${inputId}" ${actualValue ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;"></td></tr>`;
          } else {
            tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${escapeHtml(fieldLabel)}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><input type="text" id="${inputId}" value="${escapeHtml(displayValue)}" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;"></td></tr>`;
          }
        } else {
          tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: 500;">${escapeHtml(fieldLabel)}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(displayValue)}</td></tr>`;
        }
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
        // Collect edited values if editing is enabled
        if (allowEdit) {
          for (const key of Object.keys(capturedData)) {
            const inputId = `edit_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
            const input = document.getElementById(inputId);
            if (input) {
              const newValue = input.type === 'checkbox' ? input.checked : input.value;
              
              // Preserve object structure if it exists
              if (capturedData[key] && typeof capturedData[key] === 'object' && 'value' in capturedData[key]) {
                // Update only the value property, keep metadata
                editedData[key] = { ...capturedData[key], value: newValue };
              } else {
                // Simple value
                editedData[key] = newValue;
              }
            }
          }
          console.log('📝 User edited data:', editedData);
          // Update capturedData with edited values
          Object.assign(capturedData, editedData);
        }
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
   * Show overlay (disabled - user doesn't want progress overlay)
   */
  function showOverlay(state) {
    // Overlay disabled per user request
    return;
  }

  /**
   * Update overlay (disabled - user doesn't want progress overlay)
   */
  function updateOverlay(updates) {
    // Overlay disabled per user request
    return;
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
   * Render overlay (disabled - user doesn't want progress overlay)
   */
  function renderOverlay() {
    // Overlay disabled per user request
    return;
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
