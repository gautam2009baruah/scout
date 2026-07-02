// AI Extraction node executor
// Uses the active AI provider to extract structured data

import type { AIExtractionNodeConfig } from "@/shared/orchestrationTypes";
import { evaluateExpression, resolveVariablePath, setVariablePath } from "../expression-evaluator";
import { getLLMProvider } from "@/lib/llm/providers";

/**
 * Extract structured data from input using AI
 * Supports extracting from email, documents, text, or context variables
 */
export async function executeAIExtractionNode(
  config: AIExtractionNodeConfig,
  context: Record<string, unknown>
): Promise<{
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}> {
  try {
    // Get input data
    const inputData = resolveVariablePath(config.inputSource, context);

    if (!inputData) {
      throw new Error(`Input source "${config.inputSource}" not found in context`);
    }

    // Prepare input text based on type
    let inputText: string;
    if (typeof inputData === "string") {
      inputText = inputData;
    } else {
      inputText = JSON.stringify(inputData, null, 2);
    }

    // Build extraction prompt
    const systemPrompt = buildExtractionSystemPrompt(config);
    const userPrompt = buildExtractionUserPrompt(inputText, config);

    // Call AI provider
    const provider = await getLLMProvider();
    const aiResponse = await provider.generate_answer(systemPrompt, userPrompt, "");

    // Parse JSON response
    const extractedData = parseExtractionResponse(aiResponse, config);

    // Validate against schema if provided
    if (config.schema && Object.keys(config.schema).length > 0) {
      validateAgainstSchema(extractedData, config.schema);
    }

    // Store extracted data in output variable
    const output: Record<string, unknown> = {};
    setVariablePath(config.outputVariable, extractedData, output);

    return { success: true, output };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: errorMessage };
  }
}

/**
 * Build system prompt for extraction
 */
function buildExtractionSystemPrompt(config: AIExtractionNodeConfig): string {
  const schemaDescription = Object.keys(config.schema)
    .map((key) => {
      const field = config.schema[key];
      if (typeof field === "object" && field !== null) {
        const type = (field as any).type || "any";
        const description = (field as any).description || "";
        return `- ${key} (${type})${description ? ": " + description : ""}`;
      }
      return `- ${key}`;
    })
    .join("\n");

  return [
    "You are a data extraction specialist.",
    "Your task is to extract structured data from the provided input.",
    "Return ONLY valid JSON that matches the requested schema.",
    "Do not include any explanations, markdown formatting, or additional text.",
    "If a field cannot be extracted, omit it or set it to null.",
    "",
    "Expected output schema:",
    schemaDescription,
  ].join("\n");
}

/**
 * Build user prompt for extraction
 */
function buildExtractionUserPrompt(
  inputText: string,
  config: AIExtractionNodeConfig
): string {
  const customPrompt = config.prompt || "Extract the following data from the input:";

  return [
    customPrompt,
    "",
    "Input:",
    inputText,
    "",
    "Extract data as JSON matching the schema provided in the system prompt.",
  ].join("\n");
}

/**
 * Parse AI response and extract JSON
 */
function parseExtractionResponse(
  response: string,
  config: AIExtractionNodeConfig
): Record<string, unknown> {
  try {
    // Try to find JSON in response (handle markdown code blocks)
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonText = jsonMatch ? jsonMatch[1].trim() : response.trim();

    // Parse JSON
    const parsed = JSON.parse(jsonText);

    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Extracted data is not a valid object");
    }

    return parsed as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Failed to parse AI extraction response as JSON: ${error instanceof Error ? error.message : "Unknown error"}. Response: ${response.substring(0, 200)}...`
    );
  }
}

/**
 * Validate extracted data against schema
 */
function validateAgainstSchema(
  data: Record<string, unknown>,
  schema: Record<string, unknown>
): void {
  // Basic validation - check required fields
  for (const key of Object.keys(schema)) {
    const fieldDef = schema[key];
    if (typeof fieldDef === "object" && fieldDef !== null) {
      const required = (fieldDef as any).required === true;
      if (required && !(key in data)) {
        throw new Error(`Required field "${key}" is missing from extracted data`);
      }
    }
  }
}
