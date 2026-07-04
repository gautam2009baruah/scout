'use client';

import React, { useEffect, useState, useCallback } from 'react';
import type {
  OrchestrationPlayerMessage,
  StartExecutionMessage,
  ExecutionOverlayState,
  ExecutionStep,
} from '@/shared/orchestrationPlayerTypes';

/**
 * Scout Orchestration Player
 * 
 * Embedded in parent window to receive postMessage from chatbot iframe
 * and execute orchestrations in-context (current tab) with visual overlay.
 * 
 * Usage: Add to your app layout or main page component
 */
export function ScoutOrchestrationPlayer() {
  const [overlayState, setOverlayState] = useState<ExecutionOverlayState | null>(null);

  // Handle incoming messages from chatbot iframe
  const handleMessage = useCallback(async (event: MessageEvent<OrchestrationPlayerMessage>) => {
    // Security: Only accept messages from same origin or trusted chatbot origin
    // TODO: Configure trusted origins based on deployment
    
    const message = event.data;
    
    if (message.type === 'SCOUT_START_EXECUTION') {
      await handleStartExecution(message);
    }
  }, []);

  // Start orchestration execution
  const handleStartExecution = async (message: StartExecutionMessage) => {
    const { executionId, orchestrationId, orchestrationName, triggerData, context } = message.payload;

    console.log('🎬 Starting in-context execution:', { executionId, orchestrationName });

    try {
      // Fetch execution plan
      const response = await fetch(`/api/orchestrations/execute/${executionId}`, {
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
      const executionPlan = result.executionPlan as ExecutionStep[];

      console.log(`📋 Execution plan loaded: ${executionPlan.length} steps`);

      // Initialize overlay with execution plan
      setOverlayState({
        visible: true,
        executionId,
        orchestrationName,
        status: 'running',
        completedSteps: 0,
        totalSteps: executionPlan.length,
        steps: executionPlan,
      });

      // Load Scout Player if not already loaded
      await loadScoutPlayer();

      // Execute steps sequentially
      let completedCount = 0;
      const matchedPhrase = triggerData.matchedPhrase as string;
      const matchedIntent = triggerData.matchedIntent as string;

      for (let i = 0; i < executionPlan.length; i++) {
        const step = executionPlan[i];
        
        console.log(`▶️ Executing step ${i + 1}/${executionPlan.length}: ${step.label}`);

        // Update overlay - mark step as running
        setOverlayState(prev => prev ? {
          ...prev,
          currentStep: step.label,
          steps: prev.steps.map(s => 
            s.id === step.id ? { ...s, status: 'running', startedAt: new Date().toISOString() } : s
          ),
        } : null);

        try {
          // Check if this is a workflow step
          const stepWithWorkflow = step as any;
          if (stepWithWorkflow.workflowId && stepWithWorkflow.guideData) {
            // Check phrase matching
            if (stepWithWorkflow.matchRequired && stepWithWorkflow.triggerPhrases) {
              const phrases = stepWithWorkflow.triggerPhrases as string[];
              const matches = phrases.some((phrase: string) => 
                phrase.toLowerCase() === matchedPhrase?.toLowerCase() ||
                phrase.toLowerCase().includes(matchedIntent?.toLowerCase())
              );

              if (!matches) {
                console.log(`⏭️ Skipping step "${step.label}" - phrase didn't match`);
                
                // Mark as skipped
                setOverlayState(prev => prev ? {
                  ...prev,
                  steps: prev.steps.map(s => 
                    s.id === step.id ? { ...s, status: 'skipped', completedAt: new Date().toISOString() } : s
                  ),
                } : null);
                
                continue;
              }
            }

            // Execute workflow using Scout Player
            await executeWorkflowStep(stepWithWorkflow);
          }

          // Mark step as completed
          completedCount++;
          setOverlayState(prev => prev ? {
            ...prev,
            completedSteps: completedCount,
            steps: prev.steps.map(s => 
              s.id === step.id ? { ...s, status: 'completed', completedAt: new Date().toISOString() } : s
            ),
          } : null);

          console.log(`✅ Step completed: ${step.label}`);

        } catch (stepError) {
          console.error(`❌ Step failed: ${step.label}`, stepError);

          // Mark step as error
          setOverlayState(prev => prev ? {
            ...prev,
            steps: prev.steps.map(s => 
              s.id === step.id ? { 
                ...s, 
                status: 'error', 
                error: stepError instanceof Error ? stepError.message : 'Unknown error',
                completedAt: new Date().toISOString()
              } : s
            ),
          } : null);

          // Continue with next step (don't fail entire orchestration)
        }
      }

      // Update overlay with completion
      setOverlayState(prev => prev ? {
        ...prev,
        status: 'completed',
        message: '✅ Orchestration completed successfully',
      } : null);

      // Send completion message back to chatbot
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

      // Auto-hide overlay after 5 seconds
      setTimeout(() => {
        setOverlayState(null);
      }, 5000);

    } catch (error) {
      console.error('❌ Execution error:', error);

      // Update overlay with error
      setOverlayState(prev => prev ? {
        ...prev,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      } : null);

      // Send error message back to chatbot
      sendMessageToChatbot({
        type: 'SCOUT_EXECUTION_ERROR',
        payload: {
          executionId,
          error: error instanceof Error ? error.message : 'Unknown error',
          completedSteps: 0,
          totalSteps: 0,
        },
      });
    }
  };

  // Send message to chatbot iframe
  const sendMessageToChatbot = (message: OrchestrationPlayerMessage) => {
    // Find chatbot iframe
    const chatbotIframe = document.querySelector('iframe[data-scout-chatbot]') as HTMLIFrameElement;
    if (chatbotIframe?.contentWindow) {
      chatbotIframe.contentWindow.postMessage(message, '*'); // TODO: Use specific origin
    }
  };

  // Load Scout Player script
  const loadScoutPlayer = async (): Promise<void> => {
    // Check if already loaded
    if ((window as any).AdoptionPlayer) {
      console.log('✅ Scout Player already loaded');
      return;
    }

    console.log('📦 Loading Scout Player...');

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/scout-adoption-player.js';
      script.async = true;
      script.onload = () => {
        console.log('✅ Scout Player loaded successfully');
        resolve();
      };
      script.onerror = () => {
        console.error('❌ Failed to load Scout Player');
        reject(new Error('Failed to load Scout Player'));
      };
      document.head.appendChild(script);
    });
  };

  // Execute a workflow step using Scout Player
  const executeWorkflowStep = async (step: any): Promise<void> => {
    console.log(`🎮 Executing workflow: ${step.label}`);

    const AdoptionPlayer = (window as any).AdoptionPlayer;
    if (!AdoptionPlayer) {
      throw new Error('Scout Player not loaded');
    }

    // Navigate to target URL if specified
    if (step.targetUrl && !window.location.href.includes(step.targetUrl)) {
      console.log(`🧭 Navigating to: ${step.targetUrl}`);
      window.location.href = step.targetUrl;
      
      // Wait for navigation
      await new Promise(resolve => {
        window.addEventListener('load', resolve, { once: true });
      });
    }

    // Create guide object from recorded actions
    const guide = {
      id: step.workflowId,
      name: step.label,
      description: step.description || '',
      recordedActions: step.guideData,
      preWorkflowConfirmationEnabled: false,
    };

    // Create player instance
    const player = new AdoptionPlayer(guide);

    // Start playback
    return new Promise((resolve, reject) => {
      // Set up completion handler
      const checkCompletion = setInterval(() => {
        // Check if player has finished
        // Scout Player doesn't have a built-in completion event, so we check localStorage
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
          } catch {
            // Continue checking
          }
        }
      }, 500);

      // Timeout after 60 seconds
      setTimeout(() => {
        clearInterval(checkCompletion);
        reject(new Error('Workflow execution timeout'));
      }, 60000);

      // Start player
      player.start();
    });
  };

  // Register message listener
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    
    // Send ready message to chatbot
    setTimeout(() => {
      sendMessageToChatbot({
        type: 'SCOUT_PLAYER_READY',
        payload: { ready: true },
      });
    }, 1000);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  // Don't render anything if overlay is not visible
  if (!overlayState?.visible) {
    return null;
  }

  return (
    <ExecutionOverlay state={overlayState} onClose={() => setOverlayState(null)} />
  );
}

/**
 * Execution Status Overlay
 * Shows progress of orchestration execution
 */
function ExecutionOverlay({ 
  state, 
  onClose 
}: { 
  state: ExecutionOverlayState; 
  onClose: () => void;
}) {
  const getStatusColor = () => {
    switch (state.status) {
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      case 'paused': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (state.status) {
      case 'running': return '⚡';
      case 'completed': return '✅';
      case 'error': return '❌';
      case 'paused': return '⏸️';
      default: return '⏺️';
    }
  };

  const progress = state.totalSteps > 0 
    ? (state.completedSteps / state.totalSteps) * 100 
    : 0;

  return (
    <div className="fixed top-4 right-4 z-[99999] w-96 bg-white rounded-lg shadow-2xl border border-gray-200">
      {/* Header */}
      <div className={`${getStatusColor()} text-white p-4 rounded-t-lg flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getStatusIcon()}</span>
          <div>
            <div className="font-semibold">Scout Orchestration</div>
            <div className="text-sm opacity-90">{state.orchestrationName}</div>
          </div>
        </div>
        {state.status === 'completed' && (
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 rounded px-2 py-1 text-sm"
          >
            Close
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {state.totalSteps > 0 && (
        <div className="px-4 pt-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Progress</span>
            <span>{state.completedSteps} / {state.totalSteps} steps</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`${getStatusColor()} h-2 rounded-full transition-all duration-300`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Current Step */}
      {state.currentStep && state.status === 'running' && (
        <div className="px-4 pt-3">
          <div className="text-sm text-gray-600">Current Step:</div>
          <div className="font-medium text-gray-900">{state.currentStep}</div>
        </div>
      )}

      {/* Steps List */}
      {state.steps.length > 0 && (
        <div className="px-4 py-3 max-h-64 overflow-y-auto">
          <div className="space-y-2">
            {state.steps.map((step) => (
              <div key={step.id} className="flex items-start gap-2">
                <div className="mt-0.5">
                  {step.status === 'completed' && <span className="text-green-500">✓</span>}
                  {step.status === 'running' && <span className="text-blue-500">⚡</span>}
                  {step.status === 'error' && <span className="text-red-500">✗</span>}
                  {step.status === 'skipped' && <span className="text-gray-400">○</span>}
                  {step.status === 'pending' && <span className="text-gray-300">○</span>}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{step.label}</div>
                  {step.description && (
                    <div className="text-xs text-gray-500">{step.description}</div>
                  )}
                  {step.error && (
                    <div className="text-xs text-red-600 mt-1">{step.error}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Message / Error */}
      {(state.message || state.error) && (
        <div className="px-4 pb-4">
          <div className={`text-sm p-3 rounded ${
            state.error ? 'bg-red-50 text-red-800' : 'bg-blue-50 text-blue-800'
          }`}>
            {state.error || state.message}
          </div>
        </div>
      )}

      {/* Execution ID (for debugging) */}
      <div className="px-4 pb-3 text-xs text-gray-400">
        Execution ID: {state.executionId.slice(0, 8)}...
      </div>
    </div>
  );
}
