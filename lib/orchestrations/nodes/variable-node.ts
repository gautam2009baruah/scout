// Variable node executor
// Set one or more variables with literal values or expressions

import type { VariableNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression, setVariablePath } from "../expression-evaluator";

export async function executeVariableNode(
  config: VariableNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    console.log('📊 [VARIABLE NODE] Starting execution...');
    console.log('📊 [VARIABLE NODE] Config:', JSON.stringify(config, null, 2));
    console.log('📊 [VARIABLE NODE] Context keys:', Object.keys(context));
    
    const output: Record<string, unknown> = {};

    if (!config.variables || config.variables.length === 0) {
      throw new Error("At least one variable is required");
    }

    // Process each variable
    for (const variable of config.variables) {
      console.log(`\n📊 [VAR ${variable.name}] Processing...`);
      console.log(`   Name: "${variable.name}"`);
      console.log(`   Value (raw): "${variable.value}"`);
      console.log(`   Value type: ${typeof variable.value}`);
      
      if (!variable.name) {
        throw new Error("Variable name is required");
      }
      if (variable.value === undefined || variable.value === "") {
        console.error(`❌ [VAR ${variable.name}] Empty value!`);
        throw new Error(`Value is required for variable: ${variable.name}`);
      }

      // Check if value contains variable expressions or math operators
      const valueStr = String(variable.value);
      const hasExpression = valueStr.includes('{{') || /[+\-*/()]/.test(valueStr);

      console.log(`   Has expression: ${hasExpression}`);

      if (hasExpression) {
        // Evaluate as expression
        console.log(`   🔄 Evaluating expression: "${valueStr}"`);
        const evaluatedValue = evaluateExpression(valueStr, context);
        console.log(`   ✅ Evaluated to:`, evaluatedValue);
        setVariablePath(variable.name, evaluatedValue, output);
      } else {
        // Store as literal value
        console.log(`   📝 Storing literal value: "${variable.value}"`);
        setVariablePath(variable.name, variable.value, output);
      }
      
      console.log(`   ✅ Stored in output:`, output);
    }

    console.log('\n📊 [VARIABLE NODE] Final output:', JSON.stringify(output, null, 2));
    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ [VARIABLE NODE] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
