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

  // State
  let overlayElement = null;
  let currentExecution = null;
  let scoutPlayerLoaded = false;

  // Configuration (can be overridden via window.ScoutOrchestrationConfig)
  const config = window.ScoutOrchestrationConfig || {
    apiBaseUrl: window.location.origin,
    scoutPlayerUrl: '/scout-adoption-player.js',
  };

  /**
   * Initialize orchestration player
   */
  function init() {
    console.log('🎬 Initializing Scout Orchestration Player');
    
    // Register message listener
    window.addEventListener('message', handleMessage);
    
    // Inject styles
    injectStyles();
    
    // Send ready message to chatbot iframes
    setTimeout(() => {
      sendMessageToChatbot({
        type: 'SCOUT_PLAYER_READY',
        payload: { ready: true },
      });
    }, 1000);
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

    console.log('📨 Received message:', message.type);

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
    const { executionId, orchestrationId, orchestrationName, triggerData, context } = payload;

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
          // Check if this is a workflow step
          if (step.workflowId && step.guideData) {
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

            // Execute workflow
            await executeWorkflowStep(step);
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
  async function executeWorkflowStep(step) {
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

    // Create and start player
    const player = new window.AdoptionPlayer(guide);

    return new Promise((resolve, reject) => {
      const checkCompletion = setInterval(() => {
        const progressKey = `scout-adoption-progress:${guide.id}:main`;
        const progress = localStorage.getItem(progressKey);

        if (progress) {
          try {
            const progressData = JSON.parse(progress);
            const totalSteps = guide.recordedActions.length;

            if (progressData.currentIndex >= totalSteps - 1) {
              clearInterval(checkCompletion);
              console.log(`✅ Workflow completed: ${step.label}`);
              resolve();
            }
          } catch (e) {
            // Continue checking
          }
        }
      }, 500);

      setTimeout(() => {
        clearInterval(checkCompletion);
        reject(new Error('Workflow execution timeout'));
      }, 60000);

      player.start();
    });
  }

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
