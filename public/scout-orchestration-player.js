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
   * Check if sessionStorage is available
   */
  function isSessionStorageAvailable() {
    try {
      const test = '__scout_storage_test__';
      sessionStorage.setItem(test, test);
      sessionStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('⚠️ sessionStorage not available:', e.name);
      return false;
    }
  }

  /**
   * Save orchestration state to sessionStorage
   */
  function saveOrchestrationState(state) {
    if (!isSessionStorageAvailable()) {
      return false;
    }
    try {
      // Add timestamp for staleness detection
      const stateWithTimestamp = {
        ...state,
        _savedAt: Date.now(),
      };
      sessionStorage.setItem('scout_orchestration_state', JSON.stringify(stateWithTimestamp));
      console.log('💾 Saved orchestration state to sessionStorage');
      return true;
    } catch (e) {
      console.error('❌ Failed to save orchestration state:', e);
      return false;
    }
  }

  /**
   * Load orchestration state from sessionStorage
   * Returns null if state is stale (older than 5 minutes)
   */
  function loadOrchestrationState() {
    if (!isSessionStorageAvailable()) {
      return null;
    }
    try {
      const stateJson = sessionStorage.getItem('scout_orchestration_state');
      if (stateJson) {
        const state = JSON.parse(stateJson);
        
        // Check if state is stale (older than 5 minutes)
        const savedAt = state._savedAt || 0;
        const now = Date.now();
        const ageMs = now - savedAt;
        const maxAgeMs = 5 * 60 * 1000; // 5 minutes
        
        if (ageMs > maxAgeMs) {
          console.warn('⚠️ Saved orchestration state is stale (older than 5 minutes), ignoring');
          console.warn(`   Saved at: ${new Date(savedAt).toLocaleTimeString()}`);
          console.warn(`   Age: ${Math.round(ageMs / 1000)}s`);
          clearOrchestrationState(); // Clean up stale state
          return null;
        }
        
        console.log('📂 Loaded orchestration state from sessionStorage');
        console.log(`   State age: ${Math.round(ageMs / 1000)}s`);
        return state;
      }
    } catch (e) {
      console.error('❌ Failed to load orchestration state:', e);
    }
    return null;
  }

  /**
   * Clear orchestration state from sessionStorage
   */
  function clearOrchestrationState() {
    if (!isSessionStorageAvailable()) {
      return;
    }
    try {
      sessionStorage.removeItem('scout_orchestration_state');
      console.log('🧹 Cleared orchestration state from sessionStorage');
    } catch (e) {
      console.error('❌ Failed to clear orchestration state:', e);
    }
  }

  /**
   * Initialize orchestration player
   */
  function init() {
    console.log('🎬 Initializing Scout Orchestration Player...');
    console.log('✅ Event listeners registered for postMessage AND custom events');
    
    // Expose manual clear function for debugging
    window.scoutClearOrchestrationState = () => {
      clearOrchestrationState();
      console.log('✅ Orchestration state manually cleared');
    };
    
    // Check for resumed orchestration (after page navigation)
    const savedState = loadOrchestrationState();
    if (savedState) {
      // Defensive validation
      const currentStep = savedState.currentStep ?? -1;
      const totalSteps = savedState.totalSteps ?? 0;
      const executionPlan = savedState.executionPlan ?? [];
      
      // Validate data integrity
      if (currentStep < 0) {
        console.warn('⚠️ Invalid saved state: currentStep is negative, clearing');
        clearOrchestrationState();
        return;
      }
      
      if (totalSteps <= 0) {
        console.warn('⚠️ Invalid saved state: totalSteps is zero or negative, clearing');
        clearOrchestrationState();
        return;
      }
      
      if (executionPlan.length !== totalSteps) {
        console.warn('⚠️ Invalid saved state: executionPlan length mismatch, clearing');
        console.warn(`   executionPlan.length=${executionPlan.length}, totalSteps=${totalSteps}`);
        clearOrchestrationState();
        return;
      }
      
      // Validate: make sure we're resuming mid-orchestration, not past the end
      // Steps are 0-indexed, so if currentStep < totalSteps, there are more steps
      const hasMoreSteps = currentStep < totalSteps;
      
      if (hasMoreSteps) {
        const stepsRemaining = totalSteps - currentStep;
        console.log('🔄 Resuming orchestration after navigation...');
        console.log('   Execution ID:', savedState.executionId);
        console.log('   Resuming at step:', currentStep + 1, '/', totalSteps, `(${stepsRemaining} step${stepsRemaining > 1 ? 's' : ''} remaining)`);
        console.log('   💡 To cancel auto-resume, type: scoutClearOrchestrationState()');
        
        // Resume orchestration execution
        setTimeout(() => {
          resumeOrchestration(savedState);
        }, 500);
      } else {
        console.log('ℹ️ Orchestration state found but all steps completed, clearing');
        console.log(`   Current step: ${currentStep + 1}, Total steps: ${totalSteps}`);
        clearOrchestrationState();
      }
    }
    
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
   * Resume orchestration execution after navigation
   */
  async function resumeOrchestration(savedState) {
    console.log('🔄 Resuming orchestration from saved state...');
    
    // Log restored context for debugging
    const contextKeys = Object.keys(savedState.context || {});
    console.log(`   Restored context with ${contextKeys.length} fields:`, contextKeys);
    
    // Reconstruct payload from saved state
    const payload = {
      executionId: savedState.executionId,
      orchestrationId: savedState.orchestrationId,
      orchestrationName: savedState.orchestrationName,
      triggerData: savedState.triggerData,
      targetAppId: savedState.targetAppId,
      scoutBaseUrl: savedState.scoutBaseUrl,
      context: savedState.context,
      _resumeFrom: savedState.currentStep,
      _executionPlan: savedState.executionPlan,
      _pendingClearData: savedState.pendingClearData,
      _dataCapturedAtStep: savedState.dataCapturedAtStep,
    };
    
    // Resume execution
    await handleStartExecution(payload);
  }

  /**
   * Start orchestration execution
   */
  async function handleStartExecution(payload) {
    const { executionId, orchestrationId, orchestrationName, triggerData, targetAppId, scoutBaseUrl } = payload;
    let context = payload.context || {}; // Use let so we can reassign when capturing data
    let pendingClearData = payload._pendingClearData || null; // Track captured data keys to clear after next step (one-step retention)
    let dataCapturedAtStep = payload._dataCapturedAtStep || -1; // Track which step captured the data
    const resumeFromStep = payload._resumeFrom || 0; // Resume from this step if navigated
    
    // Initialize context scopes if not present
    if (!context.variables) {
      context.variables = {};
    }
    
    // Check storage availability for cross-page orchestrations
    if (!isSessionStorageAvailable() && !payload._resumeFrom) {
      console.error('❌ sessionStorage is not available');
      console.log('📢 Showing storage error notification...');
      if (typeof window.showScoutNotification === 'function') {
        window.showScoutNotification({
          message: 'Browser Storage Required\n\nYour browser has disabled storage (sessionStorage/localStorage).\n\nCross-page orchestrations require browser storage to maintain state during navigation.\n\nTo fix this:\n• Enable cookies/storage in your browser settings\n• Use regular browsing mode (not private/incognito)\n• Disable privacy extensions that block storage\n\nAlternatively, design workflows that work on a single page without navigation.',
          type: 'error',
          duration: 0
        });
        console.log('✅ Notification displayed');
      } else {
        console.warn('⚠️ window.showScoutNotification not available, using alert fallback');
        alert('⚠️ Browser Storage Required\n\nYour browser has disabled storage (sessionStorage/localStorage).\n\nCross-page orchestrations require browser storage to maintain state during navigation.\n\nTo fix this:\n• Enable cookies/storage in your browser settings\n• Use regular browsing mode (not private/incognito)\n• Disable privacy extensions that block storage\n\nAlternatively, design workflows that work on a single page without navigation.');
      }
      return;
    }
    
    // Update config with targetAppId from payload
    if (targetAppId) {
      config.targetAppId = targetAppId;
    }
    if (scoutBaseUrl) {
      config.apiBaseUrl = scoutBaseUrl;
    }

    console.log('🎬 Starting in-context execution:', { executionId, orchestrationName, targetAppId });
    if (resumeFromStep > 0) {
      console.log(`🔄 Resuming from step ${resumeFromStep + 1}`);
    }

    try {
      let executionPlan;
      
      // If resuming, use saved execution plan
      if (payload._executionPlan) {
        executionPlan = payload._executionPlan;
        console.log(`📋 Using saved execution plan (${executionPlan.length} steps)`);
      } else {
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
        executionPlan = result.executionPlan;
        console.log(`📋 Execution plan loaded: ${executionPlan.length} steps`);
      }

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

      // Sliding timeout mechanism (resets on each step completion)
      const timeoutDuration = executionPlan[0]?.timeout || 300000; // Default 5 minutes
      let timeoutId = null;
      let orchestrationCancelled = false;

      const resetSlidingTimeout = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
          if (!orchestrationCancelled) {
            orchestrationCancelled = true;
            console.log(`⏱️ Orchestration timeout due to inactivity (${timeoutDuration}ms)`);
            
            // Show error notification (does not auto-disappear)
            const timeoutMinutes = Math.round(timeoutDuration / 60000);
            console.log('📢 Showing timeout notification...');
            if (typeof window.showScoutNotification === 'function') {
              window.showScoutNotification({
                message: `Orchestration Timed Out\n\nThe orchestration has been cancelled due to ${timeoutMinutes} minute(s) of inactivity.\n\nPlease restart if you'd like to continue.`,
                type: 'error',
                duration: 0
              });
              console.log('✅ Notification displayed');
            } else {
              console.warn('⚠️ window.showScoutNotification not available, using alert fallback');
              alert(`⏱️ Orchestration Timed Out\n\nThe orchestration has been cancelled due to ${timeoutMinutes} minute(s) of inactivity.\n\nPlease restart if you'd like to continue.`);
            }
            
            // Notify chatbot
            sendMessageToChatbot({
              type: 'SCOUT_EXECUTION_ERROR',
              payload: {
                executionId,
                status: 'timeout',
                message: `Orchestration cancelled due to ${timeoutMinutes} minute(s) of inactivity`,
              },
            });
            
            updateOverlay({
              status: 'timeout',
              message: '⏱️ Orchestration cancelled due to inactivity',
            });
          }
        }, timeoutDuration);
        console.log(`⏱️ Sliding timeout reset (${timeoutDuration}ms)`);
      };

      // Initialize sliding timeout
      resetSlidingTimeout();

      // Execute steps
      let completedCount = resumeFromStep; // Start from resumed step
      const matchedPhrase = triggerData.matchedPhrase;
      const matchedIntent = triggerData.matchedIntent;

      for (let i = resumeFromStep; i < executionPlan.length; i++) {
        // Check if orchestration was cancelled due to inactivity
        if (orchestrationCancelled) {
          console.log(`⏹️ Orchestration cancelled - stopping execution at step ${i + 1}`);
          return;
        }

        const step = executionPlan[i];
        
        // Skip if marked as skipped by conditional branching
        if (step.status === 'skipped') {
          console.log(`⏭️  Skipping step ${i + 1}/${executionPlan.length}: ${step.label} (skipped by condition branch)`);
          continue;
        }

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
            
            // Save state before workflow execution (in case of navigation)
            const stepsRemaining = executionPlan.length - i;
            console.log(`💾 Saving orchestration state before workflow (step ${i + 1}/${executionPlan.length}, ${stepsRemaining} remaining)`);
            saveOrchestrationState({
              executionId,
              orchestrationId,
              orchestrationName,
              triggerData,
              targetAppId,
              scoutBaseUrl,
              context,
              currentStep: i,
              totalSteps: executionPlan.length,
              executionPlan,
              pendingClearData,
              dataCapturedAtStep,
            });
            console.log(`   Context has ${Object.keys(context).length} fields`);
            
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
              
              // Clear saved state (user cancelled)
              clearOrchestrationState();
              
              // Show warning notification (auto-disappears after 5 seconds)
              console.log('📢 Showing cancellation notification...');
              if (typeof window.showScoutNotification === 'function') {
                window.showScoutNotification({
                  message: 'Data Capture Cancelled\n\nYou cancelled the data capture. The orchestration has been stopped.',
                  type: 'warning',
                  duration: 5000
                });
                console.log('✅ Notification displayed');
              } else {
                console.warn('⚠️ window.showScoutNotification not available, using alert fallback');
                alert('⚠️ Data Capture Cancelled\n\nYou cancelled the data capture. The orchestration has been stopped.');
              }
              
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
            // Store captured data under 'capturedData' namespace for clean separation
            if (stepResult && stepResult.capturedData) {
              context.capturedData = stepResult.capturedData;
              // Mark that we have captured data to clean up later
              pendingClearData = ['capturedData'];
              dataCapturedAtStep = i; // Track which step captured the data
              console.log(`📊 Updated context with captured data under 'capturedData' namespace (will be cleared after step ${i + 2})`);
              console.log(`   Available fields:`, Object.keys(stepResult.capturedData));
            }
          }
          else if (step.nodeType === 'end') {
            // End node - mark as completed and optionally show message
            console.log('🏁 Reached end node');
            
            const endConfig = step.config || {};
            if (endConfig.displayMessage && endConfig.message) {
              console.log('📢 Displaying end node message to user');
              
              // Resolve variables in message
              const resolvedMessage = resolveVariable(endConfig.message, context);
              console.log(`   Original message: ${endConfig.message}`);
              if (resolvedMessage !== endConfig.message) {
                console.log(`   Resolved message: ${resolvedMessage}`);
              }
              
              if (typeof window.showScoutNotification === 'function') {
                window.showScoutNotification({
                  message: resolvedMessage,
                  type: 'info',
                  duration: 8000 // Auto-hide after 8 seconds
                });
              } else {
                // Fallback to alert if notification system not available
                alert(resolvedMessage);
              }
            }
          }
          else {
            // Server-side node (condition, variable, api_call, notification, etc.)
            console.log(`🔄 Sending to server for execution: ${step.nodeType}`);
            
            // Debug: Show variable config before sending
            if (step.nodeType === 'variable' && step.config) {
              console.log(`📊 [CLIENT] Variable node config:`, JSON.stringify(step.config, null, 2));
              if (step.config.variables) {
                step.config.variables.forEach((v, idx) => {
                  console.log(`   Variable ${idx + 1}:`);
                  console.log(`      Name: "${v.name}"`);
                  console.log(`      Value: "${v.value}"`);
                  console.log(`      Type: ${typeof v.value}`);
                });
              }
            }
            
            stepResult = await executeServerSideNode(executionId, i, step, context);
            
            // Handle variable node output - merge into context.variables
            if (step.nodeType === 'variable' && stepResult && stepResult.output) {
              if (!context.variables) {
                context.variables = {};
              }
              // Merge variable outputs into context.variables
              Object.assign(context.variables, stepResult.output);
              console.log(`📊 [VARIABLES] Updated context.variables:`, context.variables);
            }
            
            // Handle condition node branching
            if (step.nodeType === 'condition' && stepResult && stepResult.outputHandle) {
              const branchTaken = stepResult.outputHandle; // "true" or "false"
              console.log(`\n🔀 [BRANCH] Condition evaluated to: ${branchTaken.toUpperCase()}`);
              console.log(`   Remaining steps: ${executionPlan.length - i - 1}`);
              
              // Skip all steps that are on the OTHER branch
              // This is a simplified approach: skip until we find an END node
              // In a complete implementation, we'd use graph connections to determine reachable nodes
              
              // For now: Both end nodes are sequential after the condition
              // We need to skip the FIRST end node if condition is false, or the SECOND if true
              // This works for the simple case of condition -> end (true) -> end (false)
              
              const remainingSteps = executionPlan.slice(i + 1);
              const endNodeCount = remainingSteps.filter(s => s.nodeType === 'end').length;
              
              if (endNodeCount >= 2) {
                // Two end nodes - typical true/false branch pattern
                const firstEndIndex = remainingSteps.findIndex(s => s.nodeType === 'end');
                const secondEndIndex = remainingSteps.findIndex((s, idx) => s.nodeType === 'end' && idx > firstEndIndex);
                
                if (branchTaken === 'true') {
                  // Take first end node, skip second
                  const skipIndex = i + 1 + secondEndIndex;
                  console.log(`   ✓ Taking TRUE branch - will skip step ${skipIndex + 1} (${executionPlan[skipIndex]?.label})`);
                  executionPlan[skipIndex].status = 'skipped';
                } else {
                  // Skip first end node, take second
                  const skipIndex = i + 1 + firstEndIndex;
                  console.log(`   ✓ Taking FALSE branch - will skip step ${skipIndex + 1} (${executionPlan[skipIndex]?.label})`);
                  executionPlan[skipIndex].status = 'skipped';
                }
              }
            }
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

          // Reset sliding timeout after successful step completion
          resetSlidingTimeout();

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

          // Check if it's a user cancellation
          if (stepError.message === 'Workflow cancelled by user') {
            console.log('🛑 Orchestration stopped: User cancelled workflow');
            
            // Clear saved state (user cancelled)
            clearOrchestrationState();
            
            updateOverlay({
              status: 'cancelled',
              message: '❌ Orchestration cancelled by user',
              steps: executionPlan.map((s, idx) =>
                idx === i
                  ? { ...s, status: 'cancelled', completedAt: new Date().toISOString() }
                  : idx < i
                  ? s
                  : { ...s, status: 'skipped' }
              ),
            });

            // Stop execution
            return;
          }

          // Regular error - mark step as failed but continue
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

      // Completion - clear sliding timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        console.log(`⏱️ Sliding timeout cleared (orchestration completed)`);
      }

      // Clear saved state (orchestration completed)
      clearOrchestrationState();

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

      // Clear saved state (orchestration failed)
      clearOrchestrationState();

      // Clear sliding timeout on error
      if (timeoutId) {
        clearTimeout(timeoutId);
        console.log(`⏱️ Sliding timeout cleared (orchestration error)`);
      }

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
  function setupUnifiedScoutMonitor(capturedData, workflowId, workflowConfig = {}) {
    const hasAutoFillData = Object.keys(capturedData).length > 0;
    const autoAdvancementEnabled = workflowConfig.autoFillFromDataCapture && workflowConfig.autoAdvancement;
    
    console.log('👀 Unified Scout monitor active');
    console.log(`   📋 Element tracking: ENABLED`);
    console.log(`   🤖 Auto-fill: ${hasAutoFillData ? 'ENABLED' : 'DISABLED'} (${Object.keys(capturedData).length} fields)`);
    console.log(`   ⚡ Auto-advancement: ${autoAdvancementEnabled ? 'ENABLED' : 'DISABLED'}`);
    
    let fillCount = 0;
    const filledElements = new Set(); // Track elements we've already filled
    let lastFillTime = 0; // Track when we last filled (for delay)
    const fillDelayMs = 2000; // 2 second delay after filling to let page settle
    
    // Observer for tooltip appearing
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          // Check if this is a Scout tooltip
          if (node.nodeType === Node.ELEMENT_NODE && 
              (node.classList?.contains('scout-adoption-tooltip') || 
               node.querySelector?.('.scout-adoption-tooltip'))) {
            
            console.log('🎯 Scout tooltip detected');
            console.log(`   Mode: ${hasAutoFillData ? 'AUTO-FILL + TRACKING' : 'TRACKING ONLY'}`);
            
            // Poll for Scout to focus the element (adaptive polling handles timing)
            let attempts = 0;
            const maxAttempts = 140; // 140 attempts × 50ms = 7 seconds max
            
            const pollForFocus = () => {
              attempts++;
              
              // Check if Scout has focused an input element
              if (document.activeElement && 
                  ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
                
                const element = document.activeElement;
                const elementKey = element.id || element.name || `${element.tagName}_${element.type}_${attempts}`;
                
                console.log(`   ✅ Element focused after ${attempts * 50}ms`);
                
                // ALWAYS track the element (for data capture)
                if (!window.__scoutDataCaptureElements.includes(element)) {
                  window.__scoutDataCaptureElements.push(element);
                  console.log(`   📋 Tracked: ${element.tagName} (total: ${window.__scoutDataCaptureElements.length})`);
                } else {
                  console.log(`   ⏭️ Already tracked this element`);
                }
                
                // Try auto-fill ONLY if we have captured data AND haven't filled this element yet
                if (hasAutoFillData && !filledElements.has(element)) {
                  // Check if we're within the delay period after last fill
                  const timeSinceLastFill = Date.now() - lastFillTime;
                  if (fillCount > 0 && timeSinceLastFill < fillDelayMs) {
                    const remainingDelay = fillDelayMs - timeSinceLastFill;
                    console.log(`   ⏳ Waiting ${Math.round(remainingDelay / 1000)}s before next auto-fill (letting page settle)`);
                  } else {
                    const filled = findAndFillHighlightedControl(element);
                    if (filled) {
                      filledElements.add(element); // Mark as filled
                      lastFillTime = Date.now(); // Record fill time
                      // Logging now happens inside findAndFillHighlightedControl after verification
                    }
                  }
                }
                
                // IMPORTANT: Continue polling to catch multiple controls in the same step
                if (attempts < maxAttempts) {
                  setTimeout(pollForFocus, 50);
                }
                
              } else if (attempts < maxAttempts) {
                setTimeout(pollForFocus, 50);
              } else {
                console.log(`   ⏱️ Polling timeout after ${attempts * 50}ms`);
              }
            };
            
            pollForFocus();
          }
        }
      }
    });
    
    // Function to find and fill the highlighted control
    // Returns true if filled, false if not
    function findAndFillHighlightedControl(element) {
      console.log('🔍 Auto-fill attempt for:', element.tagName, element.type, element.name || element.id || '(no name/id)');
      console.log('📊 Available captured fields:', Object.keys(capturedData));
      
      // Extract metadata and try to match
      const elementMetadata = extractElementMetadata(element);
      console.log('📊 Element metadata:', elementMetadata);
      
      // Try to match with ANY field in captured data
      const matchedField = findMatchingCapturedField(elementMetadata, capturedData);
      
      if (matchedField) {
        console.log(`✅ Match found: "${matchedField.label}" → filling with "${matchedField.value}"`);
        
        // Increment counter IMMEDIATELY (before verification) so next field sees it
        fillCount++;
        
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
          // Try setting value with modern framework support
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
          nativeInputValueSetter.call(element, matchedField.value);
        }
        
        // Trigger events in proper order for framework compatibility
        // Set flag to indicate auto-fill is dispatching events (prevent Scout Player advancement)
        window.__scoutAutoFillInProgress = true;
        
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        element.dispatchEvent(new Event('blur', { bubbles: true }));
        
        // Clear flag after a short delay (events are synchronous but listeners might be async)
        setTimeout(() => {
          delete window.__scoutAutoFillInProgress;
        }, 50);
        
        // Verify the value stuck (wait a frame for React/Angular to process)
        setTimeout(() => {
          const actualValue = element.type === 'checkbox' || element.type === 'radio' 
            ? element.checked 
            : element.value;
          const expectedValue = element.type === 'checkbox' || element.type === 'radio'
            ? !!matchedField.value
            : matchedField.value;
            
          if (actualValue === expectedValue || String(actualValue) === String(expectedValue)) {
            console.log(`🎉 Auto-fill verified (total fills: ${fillCount})`);
            console.log(`   🔒 Locked element from re-filling`);
            console.log(`   ⏸️ Will wait 2s before filling next field (if any)`);
            
            // Auto-advancement: After 2 seconds, click Next button if enabled
            if (autoAdvancementEnabled) {
              console.log(`   ⚡ Auto-advancement enabled - will click Next after 2s delay`);
              setTimeout(() => {
                // Find and click the Next button in Scout tooltip
                const nextButton = document.querySelector('.scout-adoption-tooltip button[data-next]');
                if (nextButton) {
                  console.log(`👆 Auto-clicking Next button...`);
                  nextButton.click();
                } else {
                  console.warn(`⚠️ Next button not found for auto-advancement`);
                }
              }, fillDelayMs); // Use existing 2-second delay
            }
          } else {
            console.warn(`⚠️ Value didn't stick! Expected "${expectedValue}" but got "${actualValue}"`);
            console.warn(`   This element may need manual interaction or different fill strategy`);
            filledElements.delete(element); // Allow retry
          }
        }, 100); // Wait one frame
        
        return true; // Attempted fill
      } else {
        console.log('⚠️ No match found in captured data for this element');
        console.log('   Available fields:', Object.keys(capturedData).map(k => `"${capturedData[k].label}"`).join(', '));
        return false; // No match, not filled
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
   * Extract comprehensive metadata from a DOM element (matches Scout's ElementIdentity)
   */
  function extractElementMetadata(element) {
    // Get accessible name (label)
    function getAccessibleName(el) {
      const ariaLabel = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '';
      if (ariaLabel) return ariaLabel;
      
      if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label) return label.textContent?.trim() || '';
      }
      
      const parentLabel = el.closest('label');
      if (parentLabel) return parentLabel.textContent?.trim() || '';
      
      return '';
    }
    
    // Get nearby heading
    function getNearbyHeading(el) {
      let current = el;
      while (current && current !== document.body) {
        const heading = current.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) return heading.textContent?.trim() || '';
        current = current.parentElement;
      }
      return '';
    }
    
    // Get form title
    function getFormTitle(el) {
      const form = el.closest('form');
      if (!form) return '';
      const legend = form.querySelector('legend');
      if (legend) return legend.textContent?.trim() || '';
      const heading = form.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) return heading.textContent?.trim() || '';
      return '';
    }
    
    // Get dialog title
    function getDialogTitle(el) {
      const dialog = el.closest('[role="dialog"], [role="alertdialog"], dialog');
      if (!dialog) return '';
      const title = dialog.querySelector('[role="heading"], h1, h2, h3, .modal-title, .dialog-title');
      return title?.textContent?.trim() || '';
    }
    
    // Get card title  
    function getCardTitle(el) {
      const card = el.closest('[class*="card"], [role="article"]');
      if (!card) return '';
      const title = card.querySelector('[class*="card-title"], [class*="card-header"], h1, h2, h3, h4');
      return title?.textContent?.trim() || '';
    }
    
    // Get element text
    function getElementText(el) {
      if (el instanceof HTMLInputElement) {
        return el.value || el.placeholder || '';
      }
      if (el instanceof HTMLSelectElement) {
        const selectedOption = el.selectedOptions[0];
        return selectedOption?.textContent?.trim() || '';
      }
      return el.innerText || el.textContent || '';
    }
    
    // Get all data-* attributes
    const dataAttributes = {};
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-')) {
        dataAttributes[attr.name] = attr.value;
      }
    }
    
    const accessibleName = getAccessibleName(element);
    const parent = element.parentElement;
    
    return {
      tagName: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || '',
      accessibleName: accessibleName,
      text: getElementText(element),
      ariaLabel: element.getAttribute('aria-label') || '',
      labelText: accessibleName, // Use accessible name as label text
      placeholder: element.placeholder || '',
      inputType: element.type || '',
      selectedOptionText: element instanceof HTMLSelectElement ? element.selectedOptions[0]?.text || '' : '',
      name: element.name || '',
      id: element.id || '',
      dataAttributes: dataAttributes,
      nearbyHeading: getNearbyHeading(element),
      parentContainerText: parent?.textContent?.trim()?.slice(0, 100) || '',
      previousSiblingText: element.previousElementSibling?.textContent?.trim()?.slice(0, 50) || '',
      nextSiblingText: element.nextElementSibling?.textContent?.trim()?.slice(0, 50) || '',
      parentTagName: parent?.tagName?.toLowerCase() || '',
      parentRole: parent?.getAttribute('role') || '',
      parentAccessibleName: parent ? getAccessibleName(parent) : '',
      parentText: parent?.textContent?.trim()?.slice(0, 100) || '',
      formTitle: getFormTitle(element),
      dialogTitle: getDialogTitle(element),
      cardTitle: getCardTitle(element),
      url: window.location.href,
      path: window.location.pathname
    };
  }

  /**
   * Find matching captured field based on element metadata (uses Scout's weighted scoring)
   */
  function findMatchingCapturedField(elementMetadata, capturedData) {
    console.log('🔍 Attempting to match highlighted control...');
    console.log('   Element metadata:', {
      tagName: elementMetadata.tagName,
      inputType: elementMetadata.inputType,
      accessibleName: elementMetadata.accessibleName || '(none)',
      labelText: elementMetadata.labelText || '(none)',
      placeholder: elementMetadata.placeholder || '(none)',
      ariaLabel: elementMetadata.ariaLabel || '(none)',
      formTitle: elementMetadata.formTitle || '(none)',
      nearbyHeading: elementMetadata.nearbyHeading || '(none)'
    });

    // Weights for different types of matches (matches Scout's ruleBasedMatcher)
    const MATCH_WEIGHTS = {
      text: 25,
      role: 20,
      ariaLabel: 20,
      labelText: 18,
      tagName: 15,
      placeholder: 12,
      accessibleName: 15,
      nearbyHeading: 10,
      parentContext: 8,
      formTitle: 8,
      dialogTitle: 8,
      cardTitle: 8,
      inputType: 10,
      name: 12,
      id: 10
    };

    // Text similarity function (fuzzy matching)
    function textSimilarity(a, b) {
      if (!a || !b) return 0;
      
      const normalize = str => String(str).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9\s]/g, '').trim();
      const normA = normalize(a);
      const normB = normalize(b);
      
      if (!normA || !normB) return 0;
      if (normA === normB) return 1.0;
      
      // Check if one contains the other
      if (normA.includes(normB) || normB.includes(normA)) {
        return 0.8;
      }
      
      // Calculate word overlap
      const wordsA = normA.split(' ');
      const wordsB = normB.split(' ');
      const intersection = wordsA.filter(word => wordsB.includes(word));
      
      if (intersection.length === 0) return 0;
      
      const union = new Set([...wordsA, ...wordsB]);
      return intersection.length / union.size;
    }

    let bestScore = 0;
    let bestMatch = null;
    let bestFieldName = '';
    const scores = {};

    for (const [fieldName, fieldData] of Object.entries(capturedData)) {
      console.log(`   Checking against captured field: "${fieldName}"`);
      console.log(`     Captured label: ${fieldData.label}`);
      
      const capturedMetadata = fieldData.metadata?.elementIdentity || {};
      console.log(`     Captured metadata:`, {
        tagName: capturedMetadata.tagName || '(none)',
        labelText: capturedMetadata.labelText || '(none)',
        placeholder: capturedMetadata.placeholder || '(none)',
        accessibleName: capturedMetadata.accessibleName || '(none)',
        formTitle: capturedMetadata.formTitle || '(none)',
        nearbyHeading: capturedMetadata.nearbyHeading || '(none)'
      });
      
      let score = 0;
      const matchedBy = [];

      // Tag name match (required baseline)
      if (elementMetadata.tagName && capturedMetadata.tagName === elementMetadata.tagName) {
        score += MATCH_WEIGHTS.tagName;
        matchedBy.push('tagName');
      }

      // Input type match
      if (elementMetadata.inputType && capturedMetadata.inputType === elementMetadata.inputType) {
        score += MATCH_WEIGHTS.inputType;
        matchedBy.push('inputType');
      }

      // Accessible name / label text (highest priority for form fields)
      if (elementMetadata.accessibleName && capturedMetadata.accessibleName) {
        const similarity = textSimilarity(elementMetadata.accessibleName, capturedMetadata.accessibleName);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.accessibleName;
          matchedBy.push(`accessibleName(${Math.round(similarity * 100)}%)`);
        }
      }
      
      if (elementMetadata.labelText && capturedMetadata.labelText) {
        const similarity = textSimilarity(elementMetadata.labelText, capturedMetadata.labelText);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.labelText;
          matchedBy.push(`labelText(${Math.round(similarity * 100)}%)`);
        }
      }

      // Placeholder match
      if (elementMetadata.placeholder && capturedMetadata.placeholder) {
        const similarity = textSimilarity(elementMetadata.placeholder, capturedMetadata.placeholder);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.placeholder;
          matchedBy.push(`placeholder(${Math.round(similarity * 100)}%)`);
        }
      }

      // Aria label match
      if (elementMetadata.ariaLabel && capturedMetadata.ariaLabel) {
        const similarity = textSimilarity(elementMetadata.ariaLabel, capturedMetadata.ariaLabel);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.ariaLabel;
          matchedBy.push(`ariaLabel(${Math.round(similarity * 100)}%)`);
        }
      }

      // Nearby heading match (context)
      if (elementMetadata.nearbyHeading && capturedMetadata.nearbyHeading) {
        const similarity = textSimilarity(elementMetadata.nearbyHeading, capturedMetadata.nearbyHeading);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.nearbyHeading;
          matchedBy.push(`nearbyHeading(${Math.round(similarity * 100)}%)`);
        }
      }

      // Form title match (context)
      if (elementMetadata.formTitle && capturedMetadata.formTitle) {
        const similarity = textSimilarity(elementMetadata.formTitle, capturedMetadata.formTitle);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.formTitle;
          matchedBy.push(`formTitle(${Math.round(similarity * 100)}%)`);
        }
      }

      // Dialog title match (context)
      if (elementMetadata.dialogTitle && capturedMetadata.dialogTitle) {
        const similarity = textSimilarity(elementMetadata.dialogTitle, capturedMetadata.dialogTitle);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.dialogTitle;
          matchedBy.push(`dialogTitle(${Math.round(similarity * 100)}%)`);
        }
      }

      // Card title match (context)
      if (elementMetadata.cardTitle && capturedMetadata.cardTitle) {
        const similarity = textSimilarity(elementMetadata.cardTitle, capturedMetadata.cardTitle);
        if (similarity > 0.5) {
          score += similarity * MATCH_WEIGHTS.cardTitle;
          matchedBy.push(`cardTitle(${Math.round(similarity * 100)}%)`);
        }
      }

      // Name attribute exact match
      if (elementMetadata.name && capturedMetadata.name && elementMetadata.name === capturedMetadata.name) {
        score += MATCH_WEIGHTS.name;
        matchedBy.push('name');
      }

      // ID exact match
      if (elementMetadata.id && capturedMetadata.id && elementMetadata.id === capturedMetadata.id) {
        score += MATCH_WEIGHTS.id;
        matchedBy.push('id');
      }

      // Role match
      if (elementMetadata.role && capturedMetadata.role && elementMetadata.role === capturedMetadata.role) {
        score += MATCH_WEIGHTS.role;
        matchedBy.push('role');
      }

      console.log(`     Matched by: ${matchedBy.join(', ') || '(none)'}`);
      console.log(`     Total score: ${score}`);
      scores[fieldName] = score;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = fieldData;
        bestFieldName = fieldName;
      }
    }

    const MIN_THRESHOLD = 50; // Minimum score to accept a match (Scout's default)
    console.log(`   Best match: "${bestFieldName}" with score ${bestScore} (threshold: ${MIN_THRESHOLD})`);

    // Only return match if score meets threshold
    return bestScore >= MIN_THRESHOLD ? bestMatch : null;
  }

  /**
   * Poll for element to appear on page
   * @param {string} selector - CSS selector
   * @param {number} timeoutMs - Max time to wait
   * @returns {Promise<HTMLElement|null>}
   */
  async function pollForElement(selector, timeoutMs = 7000) {
    const startTime = Date.now();
    const pollInterval = 50;
    
    console.log(`🔍 Polling for element: ${selector} (timeout: ${timeoutMs}ms)`);
    
    while (Date.now() - startTime < timeoutMs) {
      const element = document.querySelector(selector);
      // Check if element exists and is visible
      if (element && element.offsetParent !== null) {
        console.log(`✅ Element found: ${selector}`);
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    console.warn(`⚠️ Element not found after ${timeoutMs}ms: ${selector}`);
    return null;
  }

  /**
   * Extract value from element based on data type
   * @param {HTMLElement} element 
   * @param {string} dataType - 'text' | 'number' | 'date'
   * @returns {string|number|null}
   */
  function extractValue(element, dataType) {
    let value = null;
    
    // Try different ways to get the value
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') {
      value = element.value;
    } else {
      value = element.textContent || element.innerText;
    }
    
    // Clean up whitespace
    value = value ? value.trim() : '';
    
    // Convert based on data type
    switch (dataType) {
      case 'number':
        // Extract numeric value (remove currency symbols, commas, etc.)
        const numMatch = value.match(/[\d,]+\.?\d*/);
        if (numMatch) {
          const cleaned = numMatch[0].replace(/,/g, '');
          return parseFloat(cleaned);
        }
        return null;
      
      case 'date':
        // Return as-is, let consumer parse
        return value || null;
      
      case 'text':
      default:
        return value || null;
    }
  }

  /**
   * Show modal prompt for missing required field
   * @param {string} fieldName 
   * @param {string} selector 
   * @returns {Promise<string|null>} - User input or null if cancelled
   */
  async function showManualPrompt(fieldName, selector) {
    return new Promise((resolve) => {
      // Create modal overlay
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 99999;
        font-family: system-ui, -apple-system, sans-serif;
      `;
      
      const modal = document.createElement('div');
      modal.style.cssText = `
        background: white;
        padding: 24px;
        border-radius: 8px;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
        max-width: 500px;
        width: 90%;
      `;
      
      modal.innerHTML = `
        <h3 style="margin: 0 0 16px; font-size: 18px; font-weight: 600; color: #1e293b;">
          Field Not Found
        </h3>
        <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">
          Could not find field <strong>${fieldName}</strong> using selector:
        </p>
        <code style="
          display: block;
          background: #f1f5f9;
          padding: 8px 12px;
          border-radius: 4px;
          font-size: 13px;
          color: #334155;
          margin-bottom: 16px;
          word-break: break-all;
        ">${selector}</code>
        <p style="margin: 0 0 16px; color: #475569; font-size: 14px;">
          Would you like to enter the value manually, or skip this field?
        </p>
        <input
          type="text"
          id="manual-input-field"
          placeholder="Enter ${fieldName}..."
          style="
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #cbd5e1;
            border-radius: 6px;
            font-size: 14px;
            margin-bottom: 16px;
            box-sizing: border-box;
          "
        />
        <div style="display: flex; gap: 12px; justify-content: flex-end;">
          <button
            id="cancel-btn"
            style="
              padding: 8px 16px;
              border: 1px solid #cbd5e1;
              background: white;
              color: #475569;
              border-radius: 6px;
              font-size: 14px;
              cursor: pointer;
              font-weight: 500;
            "
          >
            Skip
          </button>
          <button
            id="submit-btn"
            style="
              padding: 8px 16px;
              border: none;
              background: #3b82f6;
              color: white;
              border-radius: 6px;
              font-size: 14px;
              cursor: pointer;
              font-weight: 500;
            "
          >
            Submit
          </button>
        </div>
      `;
      
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      
      const input = document.getElementById('manual-input-field');
      const submitBtn = document.getElementById('submit-btn');
      const cancelBtn = document.getElementById('cancel-btn');
      
      // Focus input
      input.focus();
      
      // Handle submit
      const handleSubmit = () => {
        const value = input.value.trim();
        document.body.removeChild(overlay);
        resolve(value || null);
      };
      
      // Handle cancel
      const handleCancel = () => {
        document.body.removeChild(overlay);
        resolve(null);
      };
      
      submitBtn.addEventListener('click', handleSubmit);
      cancelBtn.addEventListener('click', handleCancel);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSubmit();
        if (e.key === 'Escape') handleCancel();
      });
    });
  }

  /**
   * Capture workflow outputs after workflow completes
   * @param {Array} outputMapping - Array of {fieldName, selector, dataType, required}
   * @returns {Promise<Object>} - Captured outputs
   */
  async function captureWorkflowOutputs(outputMapping) {
    // Handle missing or old format (object instead of array)
    if (!outputMapping || !Array.isArray(outputMapping) || outputMapping.length === 0) {
      if (outputMapping && !Array.isArray(outputMapping)) {
        console.warn('⚠️ Output mapping is in old format (object). Please reconfigure in designer.');
      } else {
        console.log('ℹ️ No output mapping configured');
      }
      return {};
    }
    
    console.log(`📤 Capturing ${outputMapping.length} workflow output(s)...`);
    const results = {};
    
    for (const field of outputMapping) {
      const { fieldName, selector, dataType, required } = field;
      console.log(`🔍 Capturing field: ${fieldName} (${selector})`);
      
      // Poll for element
      const element = await pollForElement(selector, 7000);
      
      if (element) {
        // Extract value
        const value = extractValue(element, dataType);
        results[fieldName] = value;
        console.log(`✅ Captured ${fieldName} = ${value}`);
      } else {
        // Element not found
        console.warn(`⚠️ Field not found: ${fieldName}`);
        
        if (required) {
          // Show manual prompt
          console.log(`⚠️ Field is required - prompting user...`);
          const manualValue = await showManualPrompt(fieldName, selector);
          results[fieldName] = manualValue;
          console.log(`${manualValue ? '✅' : '⏭️'} User ${manualValue ? 'entered' : 'skipped'}: ${fieldName}`);
        } else {
          // Optional field - set to null
          results[fieldName] = null;
          console.log(`⏭️ Optional field skipped: ${fieldName}`);
        }
      }
    }
    
    console.log(`📤 Output capture complete:`, results);
    return results;
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
      console.log('📊 Context keys:', Object.keys(context));
      
      // Filter context to only include captured data fields (objects with value/metadata)
      for (const [key, value] of Object.entries(context)) {
        console.log(`   Checking context field "${key}":`, typeof value, value);
        if (value && typeof value === 'object' && 'value' in value && 'metadata' in value) {
          capturedData[key] = value;
          console.log(`   ✅ Added to capturedData: "${key}" = "${value.value}"`);
        } else {
          console.log(`   ⏭️ Skipped (not captured data format)`);
        }
      }
      
      console.log(`📋 Final capturedData:`, capturedData);
      console.log(`📋 Fields available for auto-fill:`, Object.keys(capturedData));
      
      if (Object.keys(capturedData).length === 0) {
        console.log('⚠️ No captured data found in context - auto-fill will not work!');
      }
    } else {
      console.log('ℹ️ Auto-fill disabled for this workflow');
      console.log(`   autoFillFromDataCapture: ${workflowConfig.autoFillFromDataCapture}`);
      console.log(`   context exists: ${!!context}`);
    }
    
    // Set up unified monitor (tracks elements + auto-fills if data exists)
    setupUnifiedScoutMonitor(capturedData, step.workflowId, workflowConfig);

    // Start the workflow using the handle (same as chatbot)
    console.log(`▶️ Starting workflow: ${step.workflowId}`);
    handle.play(step.workflowId);

    return new Promise((resolve, reject) => {
      console.log(`⏳ Waiting for workflow completion via event...`);
      
      // Fallback timeout (safety net for very old workflows without event support)
      const fallbackTimeout = setTimeout(() => {
        console.warn(`⚠️ Workflow completion event timeout after 5 minutes - forcing completion`);
        window.removeEventListener('scout-workflow-complete', completionHandler);
        window.removeEventListener('scout-workflow-cancelled', cancellationHandler);
        resolve({});
      }, 300000); // 5 minutes
      
      // Listen for workflow completion event
      const completionHandler = async (event) => {
        console.log(`📨 Received workflow-complete event - workflowId: ${event.detail.workflowId}, expected: ${step.workflowId}`);
        if (event.detail.workflowId === step.workflowId) {
          console.log(`✅ Workflow completed: ${step.label}`);
          
          // Clear fallback timeout
          clearTimeout(fallbackTimeout);
          
          // Clean up event listeners
          window.removeEventListener('scout-workflow-complete', completionHandler);
          window.removeEventListener('scout-workflow-cancelled', cancellationHandler);
          
          // Clean up auto-fill data and observer
          delete window.__scoutWorkflowAutoFillData;
          if (window.__scoutUnifiedObserver) {
            window.__scoutUnifiedObserver.disconnect();
            delete window.__scoutUnifiedObserver;
            delete window.__scoutWorkflowId;
            console.log('🧹 Cleaned up unified monitor');
          }
          
          // Capture workflow outputs if configured
          const outputs = await captureWorkflowOutputs(workflowConfig.outputMapping);
          
          resolve(outputs);
        } else {
          console.log(`⏭️ Ignoring completion event for different workflow (not for us)`);
        }
      };
      
      // Listen for workflow cancellation event
      const cancellationHandler = (event) => {
        if (event.detail.workflowId === step.workflowId) {
          console.log(`❌ Workflow cancelled by user: ${step.label}`);
          
          // Clear fallback timeout
          clearTimeout(fallbackTimeout);
          
          // Clean up event listeners
          window.removeEventListener('scout-workflow-complete', completionHandler);
          window.removeEventListener('scout-workflow-cancelled', cancellationHandler);
          
          // Clean up auto-fill data and observer
          delete window.__scoutWorkflowAutoFillData;
          if (window.__scoutUnifiedObserver) {
            window.__scoutUnifiedObserver.disconnect();
            delete window.__scoutUnifiedObserver;
            delete window.__scoutWorkflowId;
            console.log('🧹 Cleaned up unified monitor');
          }
          
          // Reject with cancellation error
          reject(new Error('Workflow cancelled by user'));
        }
      };
      
      window.addEventListener('scout-workflow-complete', completionHandler);
      window.addEventListener('scout-workflow-cancelled', cancellationHandler);
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
        console.log(`   📝 Storing field: "${field.name}" = "${field.value}" (label: "${field.label}")`);
        // Store full field object with metadata (not just value)
        capturedData[field.name] = {
          value: field.value,
          label: field.label,
          type: field.type,
          element: field.element,
          metadata: field.metadata,
        };
      }
      
      console.log(`✅ Stored ${Object.keys(capturedData).length} fields in capturedData object`);
    } else {
      console.log('⚠️ No guide data available, skipping data capture');
      console.log('⚠️ step.guideData:', step.guideData);
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
    console.log(`   Tracked elements:`, trackedElements.map(el => `${el.tagName}[${el.type || 'no-type'}]`).join(', '));
    
    if (trackedElements.length === 0) {
      console.warn('⚠️ No elements were tracked during workflow execution!');
      return fields;
    }
    
    // Capture data from each tracked element
    for (let i = 0; i < trackedElements.length; i++) {
      const element = trackedElements[i];
      console.log(`\n📝 Capturing element ${i + 1}/${trackedElements.length}:`, element.tagName, element.type, element.name || element.id || '(no name/id)');
      
      if (!element || !['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName)) {
        console.log(`   ⏭️ Skipping - not an input element`);
        continue;
      }
      
      try {
        // Extract full metadata FIRST (Scout's comprehensive element identification)
        const fullMetadata = extractElementMetadata(element);
        
        // Use Scout's metadata for label (most reliable)
        let label = fullMetadata.accessibleName || fullMetadata.labelText || fullMetadata.placeholder || '';
        
        // Clean up label (remove extra whitespace, control text from compound labels)
        if (label) {
          label = label.trim();
          // Remove common noise patterns like "Create new target app" when we just want "Target app"
          if (label.includes('Create new') && label.length > 20) {
            label = label.replace(/Create new (target app)?/gi, '').trim();
          }
          // Remove duplicate text (e.g., "Target appCreate new target appCRS" → "Target app")
          const words = label.split(/\s+/);
          if (words.length > 3 && words[0] === words[words.length - 1]) {
            label = words.slice(0, Math.ceil(words.length / 2)).join(' ');
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
        
        // Last resort: generate unique field name
        if (!name) {
          name = `field_${fields.length}`;
        }
        
        // If we still don't have a good label, try to find something better
        if (!label || label === name) {
          label = element.name || element.id || fullMetadata.text || name;
        }
        
        // Ensure unique name (prevent duplicate keys from overwriting)
        const originalName = name;
        let counter = 2;
        while (fields.some(f => f.name === name)) {
          name = `${originalName}_${counter}`;
          counter++;
        }
        if (name !== originalName) {
          console.log(`   ⚠️ Duplicate name detected, renamed: "${originalName}" → "${name}"`);
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
            elementIdentity: fullMetadata // Store full Scout-compatible metadata
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

      const allowEdit = config.allowEdit !== false; // enabled by default
      const editedData = { ...capturedData }; // Store edited values

      let tableHTML = '<thead><tr><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Field</th><th style="text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb;">Value</th></tr></thead><tbody>';
      
      for (const [key, value] of Object.entries(capturedData)) {
        // Extract actual value from object structure { value, label, type, metadata }
        const actualValue = (value && typeof value === 'object' && 'value' in value) ? value.value : value;
        const fieldLabel = (value && typeof value === 'object' && 'label' in value) ? value.label : key;
        const displayValue = typeof actualValue === 'boolean' ? (actualValue ? 'Yes' : 'No') : String(actualValue);
        
        // Get output variable name from config (default: capturedData)
        const outputVar = config.outputVariable || 'capturedData';
        const variablePath = `{{${outputVar}.${key}.value}}`;
        const varPathId = `varpath_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
        
        // Field label cell with collapsible variable name
        const fieldCell = `<div style="line-height: 1.4;">
          <div style="font-weight: 500; color: #1e293b;">${escapeHtml(fieldLabel)}</div>
          <div style="margin-top: 2px;">
            <span id="${varPathId}_toggle" style="cursor: pointer; font-size: 10px; color: #64748b; user-select: none;" onclick="
              const content = document.getElementById('${varPathId}_content');
              const toggle = document.getElementById('${varPathId}_toggle');
              if (content.style.display === 'none') {
                content.style.display = 'inline-flex';
                toggle.textContent = '−';
              } else {
                content.style.display = 'none';
                toggle.textContent = '+';
              }
            ">+</span>
            <div id="${varPathId}_content" style="display: none; align-items: center; gap: 4px; margin-top: 2px;">
              <code style="font-size: 10px; color: #64748b; font-family: monospace; background: #f1f5f9; padding: 2px 4px; border-radius: 2px;">${escapeHtml(variablePath)}</code>
              <button onclick="
                navigator.clipboard.writeText('${variablePath.replace(/'/g, "\\'")}')
                  .then(() => {
                    const btn = event.target;
                    const orig = btn.textContent;
                    btn.textContent = '✓';
                    btn.style.color = '#10b981';
                    setTimeout(() => { btn.textContent = orig; btn.style.color = '#64748b'; }, 1000);
                  })
              " style="cursor: pointer; font-size: 10px; border: none; background: none; color: #64748b; padding: 0 2px;" title="Copy to clipboard">📋</button>
            </div>
          </div>
        </div>`;
        
        if (allowEdit) {
          const inputId = `edit_${key.replace(/[^a-zA-Z0-9]/g, '_')}`;
          if (typeof actualValue === 'boolean') {
            tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fieldCell}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><input type="checkbox" id="${inputId}" ${actualValue ? 'checked' : ''} style="width: 20px; height: 20px; cursor: pointer;"></td></tr>`;
          } else {
            tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fieldCell}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><input type="text" id="${inputId}" value="${escapeHtml(displayValue)}" style="width: 100%; padding: 6px; border: 1px solid #d1d5db; border-radius: 4px;"></td></tr>`;
          }
        } else {
          tableHTML += `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${fieldCell}</td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${escapeHtml(displayValue)}</td></tr>`;
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
   * Execute server-side node (API call, notification, condition, variable, etc.)
   */
  async function executeServerSideNode(executionId, nodeIndex, step, context) {
    console.log(`🔄 Executing server-side node: ${step.nodeType}`);
    console.log(`📤 Sending context to server:`, context);

    const response = await fetch(`${config.apiBaseUrl}/api/orchestrations/execute/${executionId}/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeIndex: nodeIndex,
        step: step,  // Include step config for server execution
        context: context,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server-side execution failed: ${response.statusText}`);
    }

    const result = await response.json();
    console.log(`📥 Server response:`, result);
    
    if (result.output) {
      console.log(`📊 Output details:`, JSON.stringify(result.output, null, 2));
      
      // For condition nodes, show what was evaluated
      if (step.nodeType === 'condition' && result.output.outputHandle) {
        console.log(`\n🔀 [SERVER RESULT] Condition evaluated to: ${result.output.outputHandle.toUpperCase()}`);
        console.log(`   Success: ${result.output.success}`);
        if (result.output.error) {
          console.error(`   ❌ Error: ${result.output.error}`);
        }
      }
    }
    
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
      console.log(`   🔍 Resolving: ${match}`);
      
      // Support nested access like {{trigger.input.name}}
      const parts = trimmedName.split('.');
      let value = context;
      for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
          console.log(`      ✓ Found '${part}':`, value);
        } else {
          console.log(`      ❌ '${part}' not found in:`, Object.keys(value || {}));
          return match; // Keep original if not found
        }
      }
      
      console.log(`   ✅ Resolved to:`, value);
      return value !== undefined ? value : match;
    });
  }

  /**
   * Escape HTML for safe display
   */
  function escapeHtml(text) {
    if (typeof text !== 'string') return text;
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
