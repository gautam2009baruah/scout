// Condition node executor
// Evaluates conditions and routes accordingly

import type { ConditionNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateCondition } from "../expression-evaluator";

export async function executeConditionNode(
  config: ConditionNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  outputHandle?: string;
  error?: string;
}> {
  try {
    console.log('🔀 [CONDITION NODE] Starting evaluation...');
    console.log('📊 [CONDITION NODE] Available context keys:', Object.keys(context));
    console.log('📦 [CONDITION NODE] Full context:', JSON.stringify(context, null, 2));
    
    if (!config.conditions || config.conditions.length === 0) {
      console.error('❌ [CONDITION NODE] No conditions defined');
      return { success: false, error: "No conditions defined" };
    }

    console.log(`🧪 [CONDITION NODE] Evaluating ${config.conditions.length} condition(s)...`);
    
    // Evaluate conditions with individual logic operators
    // Start with first condition result
    console.log(`\n🔍 [CONDITION 1/${config.conditions.length}]`, {
      variable: config.conditions[0].variable,
      operator: config.conditions[0].operator,
      expectedValue: config.conditions[0].value,
    });
    
    let finalResult = evaluateCondition(
      config.conditions[0].variable,
      config.conditions[0].operator,
      config.conditions[0].value,
      context,
      config.conditions[0].caseSensitive !== false // default true if not specified
    );
    
    console.log(`  ➜ Result: ${finalResult}`);

    // Apply logic operators between conditions (left-to-right evaluation)
    for (let i = 0; i < config.conditions.length - 1; i++) {
      const currentCondition = config.conditions[i];
      const nextCondition = config.conditions[i + 1];
      const logicOperator = currentCondition.logicAfter || "and"; // Default to AND

      console.log(`\n🔗 [LOGIC] ${finalResult} ${logicOperator.toUpperCase()}`);
      console.log(`🔍 [CONDITION ${i + 2}/${config.conditions.length}]`, {
        variable: nextCondition.variable,
        operator: nextCondition.operator,
        expectedValue: nextCondition.value,
      });

      const nextResult = evaluateCondition(
        nextCondition.variable,
        nextCondition.operator,
        nextCondition.value,
        context,
        nextCondition.caseSensitive !== false // default true if not specified
      );
      
      console.log(`  ➜ Result: ${nextResult}`);

      // Apply the logic operator
      if (logicOperator === "and") {
        finalResult = finalResult && nextResult;
      } else {
        finalResult = finalResult || nextResult;
      }
      
      console.log(`  ➜ Combined Result: ${finalResult}`);
    }

    console.log(`\n✅ [CONDITION NODE] Final result: ${finalResult ? 'TRUE ✓' : 'FALSE ✗'}`);
    console.log(`🎯 [CONDITION NODE] Output handle: "${finalResult ? "true" : "false"}"`);

    return {
      success: true,
      outputHandle: finalResult ? "true" : "false",
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error('❌ [CONDITION NODE] Error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
