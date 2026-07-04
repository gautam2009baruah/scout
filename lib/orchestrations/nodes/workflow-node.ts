// Workflow node executor
// Executes an existing Scout guided workflow

import type { WorkflowNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression } from "../expression-evaluator";
import {
  executeGuidedWorkflow,
  waitForWorkflowCompletion,
  type WorkflowExecutionMode,
} from "@/lib/guided-workflows/executor";
import { executeBrowserWorkflow } from "../browser-executor";
import { getGuidedWorkflowById } from "@/lib/admin/guided-workflows";
import { getPool } from "@/lib/db/pool";

export async function executeWorkflowNode(
  config: WorkflowNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
  skipped?: boolean;
}> {
  try {
    // Check trigger phrase matching (for chatbot triggers)
    if (config.triggerPhrases && config.triggerPhrases.length > 0) {
      const matchedPhrase = context.matchedPhrase as string | undefined;
      const matchedIntent = context.matchedIntent as string | undefined;
      
      // If trigger phrases are specified, check if current phrase matches
      if (matchedPhrase && !config.triggerPhrases.includes(matchedPhrase)) {
        console.log(`[WorkflowNode] Skipping - matched phrase "${matchedPhrase}" not in trigger phrases: ${config.triggerPhrases.join(", ")}`);
        return { success: true, skipped: true };
      }
      
      // Also check matched intent if available
      if (matchedIntent && !config.triggerPhrases.some(p => p.toLowerCase().includes(matchedIntent.toLowerCase()))) {
        console.log(`[WorkflowNode] Skipping - matched intent "${matchedIntent}" not in trigger phrases`);
        return { success: true, skipped: true };
      }
      
      console.log(`[WorkflowNode] ✅ Phrase match confirmed: "${matchedPhrase || matchedIntent}" in ${config.triggerPhrases.join(", ")}`);
    }

    if (!config.workflowId) {
      throw new Error("Workflow ID is required");
    }

    // Evaluate workflow ID (can be dynamic expression)
    const workflowId =
      typeof config.workflowId === "string"
        ? config.workflowId
        : String(evaluateExpression(config.workflowId, context));

    // Debug logging
    console.log("[WorkflowNode] Evaluation:", {
      configWorkflowId: config.workflowId,
      evaluatedWorkflowId: workflowId,
      contextKeys: Object.keys(context),
      contextSample: JSON.stringify(context).substring(0, 200),
    });

    // Validate workflowId is not empty after evaluation
    if (!workflowId || workflowId.trim() === "") {
      throw new Error(
        `Workflow ID evaluated to empty value. Config: ${JSON.stringify(config.workflowId)}, Context keys: ${Object.keys(context).join(", ")}`
      );
    }

    // Validate workflowId looks like a UUID (basic check)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(workflowId)) {
      throw new Error(
        `Invalid workflow ID format: "${workflowId}". Expected UUID format. Config: ${JSON.stringify(config.workflowId)}, Available context: ${Object.keys(context).join(", ")}`
      );
    }

    // Evaluate input mappings using expressions
    const workflowInputs: Record<string, unknown> = {};
    if (config.inputMapping) {
      console.log("\n" + "=".repeat(80));
      console.log("🔧 WORKFLOW NODE - EVALUATING INPUT MAPPINGS");
      console.log("=".repeat(80));
      console.log("📋 Available context keys:", Object.keys(context));
      console.log("📋 Context data:", JSON.stringify(context, null, 2).substring(0, 500) + "...");
      console.log("\n💼 Input mapping config:", config.inputMapping);
      
      for (const [key, expression] of Object.entries(config.inputMapping)) {
        const evaluatedValue = evaluateExpression(expression, context);
        workflowInputs[key] = evaluatedValue;
        
        if (!evaluatedValue || evaluatedValue === "") {
          console.log(`❌ ${key}: "${expression}" => EMPTY or NULL`);
          console.log(`   🔍 Debugging: trying to resolve "${expression}"`);
          
          // Try to manually resolve to show what went wrong
          const pathMatch = expression.match(/\{\{([^}]+)\}\}/);
          if (pathMatch) {
            const path = pathMatch[1].trim();
            const parts = path.split(".");
            console.log(`   Path parts: [${parts.join(", ")}]`);
            
            let current: any = context;
            for (let i = 0; i < parts.length; i++) {
              const part = parts[i];
              console.log(`   Step ${i + 1}: Looking for "${part}" in`, typeof current);
              if (current && typeof current === "object" && part in current) {
                current = current[part];
                console.log(`   ✅ Found: ${typeof current === "object" ? JSON.stringify(current).substring(0, 100) : current}`);
              } else {
                console.log(`   ❌ Not found! Available keys:`, current && typeof current === "object" ? Object.keys(current) : "N/A");
                break;
              }
            }
          }
        } else {
          console.log(`✅ ${key}: "${expression}" => "${evaluatedValue}"`);
        }
      }
      
      console.log("\n📦 FINAL WORKFLOW INPUTS:", workflowInputs);
      console.log("=".repeat(80) + "\n");
    } else {
      console.log("\n⚠️  WARNING: No input mapping configured for workflow node\n");
    }

    // Evaluate target URL if provided
    const targetUrl = config.targetUrl
      ? String(evaluateExpression(config.targetUrl, context))
      : undefined;

    // Determine user ID from context if available
    const userId = context.userId ? String(context.userId) : undefined;

    // **BROWSER AUTOMATION MODE** - If target URL is provided, use automated browser execution
    if (targetUrl) {
      // Get session for workflow access - query user from database
      const systemContext = context._system as { triggeredBy?: string } | undefined;
      const triggeredByEmail = systemContext?.triggeredBy || "admin@example.com";
      
      const pool = getPool();
      const userResult = await pool.query(
        `SELECT u.id, u.email, u.company_id, r.is_admin_role
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.email = $1 AND u.status = 'active'
         LIMIT 1`,
        [triggeredByEmail]
      );
      
      if (userResult.rows.length === 0) {
        throw new Error(`User not found or inactive: ${triggeredByEmail}`);
      }

      const user = userResult.rows[0];
      const session = {
        user: {
          id: user.id,
          email: user.email,
          isAdminRole: user.is_admin_role,
          tenantId: user.company_id,
        },
      } as any;

      // Get workflow details to access recorded steps
      const workflow = await getGuidedWorkflowById(workflowId, session);
      
      if (!workflow) {
        throw new Error(`Workflow not found: ${workflowId}`);
      }

      if (workflow.status !== "published") {
        throw new Error(`Workflow is not published: ${workflow.status}`);
      }

      // Execute workflow in automated browser
      const browserResult = await executeBrowserWorkflow({
        workflowId,
        targetUrl,
        steps: workflow.recordedActions || [],
        parameters: workflowInputs,
        timeout: config.timeout || 300000,
        headless: false, // Always visible so user can login if needed
        closeBrowserAfter: config.closeBrowserAfter !== false, // Default true, can be set to false for data capture
      });

      if (!browserResult.success) {
        if (config.continueOnFailure) {
          return {
            success: true,
            output: {
              error: browserResult.error,
              status: browserResult.status,
              failed: true,
            },
          };
        }
        return { success: false, error: browserResult.error };
      }

      // Map browser execution output
      const output = mapWorkflowOutput(
        {
          executionId: browserResult.executionId,
          workflowId,
          workflowTitle: workflow.title,
          status: browserResult.status,
          output: browserResult.output,
        },
        config.outputMapping
      );

      // Include browser page reference if kept open
      if (browserResult.page) {
        output._browserPage = browserResult.page;
      }

      return { success: true, output };
    }

    // **STANDARD MODE** - No target URL, use existing execution method
    // Execute the guided workflow
    const executionResult = await executeGuidedWorkflow({
      workflowId,
      userId,
      executionMode: (config.executionMode as WorkflowExecutionMode) || "auto",
      parameters: workflowInputs,
      targetUrl,
      timeout: config.timeout,
      notifyUser: config.notifyUser !== false,
    });

    // If configured to wait for completion, poll for status
    if (config.waitForCompletion && executionResult.status === "initiated") {
      const timeout = config.timeout || 300000; // 5 minutes default
      const completionResult = await waitForWorkflowCompletion(
        executionResult.executionId,
        timeout
      );

      // Map completion result outputs
      const output = mapWorkflowOutput(completionResult, config.outputMapping);

      if (completionResult.status === "completed") {
        return { success: true, output };
      }

      if (completionResult.status === "timeout") {
        if (config.continueOnFailure) {
          return {
            success: true,
            output: {
              ...output,
              timeout: true,
              message: "Workflow execution timeout",
            },
          };
        }
        return { success: false, error: "Workflow execution timeout" };
      }

      if (config.continueOnFailure) {
        return {
          success: true,
          output: {
            ...output,
            error: completionResult.error,
            failed: true,
          },
        };
      }

      return { success: false, error: completionResult.error || "Workflow failed" };
    }

    // Not waiting for completion - return immediately with execution info
    const output = mapWorkflowOutput(executionResult, config.outputMapping);
    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    if (config.continueOnFailure) {
      return {
        success: true,
        output: { error: errorMessage, failed: true },
      };
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Map workflow execution result to output variables based on outputMapping config
 */
function mapWorkflowOutput(
  executionResult: {
    executionId: string;
    workflowId: string;
    workflowTitle: string;
    status: string;
    steps?: number;
    duration?: number;
    output?: Record<string, unknown>;
  },
  outputMapping?: Record<string, string>
): Record<string, unknown> {
  const defaultOutput = {
    executionId: executionResult.executionId,
    workflowId: executionResult.workflowId,
    workflowTitle: executionResult.workflowTitle,
    status: executionResult.status,
    steps: executionResult.steps,
    duration: executionResult.duration,
    ...executionResult.output,
  };

  if (!outputMapping || Object.keys(outputMapping).length === 0) {
    return defaultOutput;
  }

  // Map specific output fields to context variables
  const mappedOutput: Record<string, unknown> = {};
  for (const [contextVar, workflowVar] of Object.entries(outputMapping)) {
    const value = defaultOutput[workflowVar as keyof typeof defaultOutput];
    if (value !== undefined) {
      mappedOutput[contextVar] = value;
    }
  }

  // Include unmapped default fields
  return { ...defaultOutput, ...mappedOutput };
}
