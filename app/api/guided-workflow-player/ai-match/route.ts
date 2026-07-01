import { NextRequest, NextResponse } from "next/server";
import { getLLMProvider } from "@/lib/llm/providers";
import { getAIProviderConfig } from "@/lib/ai/config";
import type { ElementIdentity } from "@/shared/guideTypes";

type AIMatchRequest = {
  recordedControl: ElementIdentity;
  candidateControls: Array<{
    index: number;
    tagName: string;
    text: string;
    role?: string;
    ariaLabel?: string;
    accessibleName?: string;
    placeholder?: string;
    id?: string;
    name?: string;
    ruleScore?: number;
  }>;
  pageContext: {
    url: string;
    title: string;
    path: string;
  };
  stepIntent: string;
};

type AIMatchResponse = {
  bestMatchIndex: number | null;
  confidence: number;
  reason: string;
  provider: string;
  model: string;
};

export async function POST(request: NextRequest) {
  try {
    const body: AIMatchRequest = await request.json();

    const { recordedControl, candidateControls, pageContext, stepIntent } = body;

    if (!recordedControl || !candidateControls || candidateControls.length === 0) {
      return NextResponse.json(
        { error: "Invalid request: missing recordedControl or candidateControls" },
        { status: 400 }
      );
    }

    const llmProvider = await getLLMProvider();
    const config = await getAIProviderConfig();

    const systemPrompt = `You are an expert at matching UI controls in web applications for workflow automation.
Your task is to identify which candidate control best matches the originally recorded control.

Consider:
- Text content similarity
- Element role and type
- Accessible names and labels
- Position in the page hierarchy
- Rule-based scores if provided
- The intended action for the step

Return a JSON response with:
- bestMatchIndex: the index of the best matching candidate (or null if no good match)
- confidence: a score from 0-100 indicating match confidence
- reason: brief explanation of why this is the best match

Be conservative - only return high confidence (>90) if you're very certain.
If no candidate is a good match, return null for bestMatchIndex with low confidence.`;

    const userPrompt = `Originally Recorded Control:
- Tag: ${recordedControl.tagName || "unknown"}
- Text: ${recordedControl.text || ""}
- Role: ${recordedControl.role || ""}
- Aria Label: ${recordedControl.ariaLabel || ""}
- Accessible Name: ${recordedControl.accessibleName || ""}
- Label: ${recordedControl.labelText || ""}
- Placeholder: ${recordedControl.placeholder || ""}
- ID: ${recordedControl.id || ""}
- Name: ${recordedControl.name || ""}
- Form Title: ${recordedControl.formTitle || ""}
- Dialog Title: ${recordedControl.dialogTitle || ""}
- Card Title: ${recordedControl.cardTitle || ""}
- Nearby Heading: ${recordedControl.nearbyHeading || ""}

Current Page Context:
- URL: ${pageContext.url}
- Title: ${pageContext.title}
- Path: ${pageContext.path}

Step Intent: ${stepIntent}

Candidate Controls:
${candidateControls
  .map(
    (c, i) => `
[${i}] ${c.tagName}
  Text: ${c.text || "(empty)"}
  Role: ${c.role || "(none)"}
  Aria Label: ${c.ariaLabel || "(none)"}
  Accessible Name: ${c.accessibleName || "(none)"}
  Placeholder: ${c.placeholder || "(none)"}
  ID: ${c.id || "(none)"}
  Name: ${c.name || "(none)"}
  Rule Score: ${c.ruleScore !== undefined ? c.ruleScore.toFixed(1) : "N/A"}
`
  )
  .join("\n")}

Which candidate best matches the recorded control? Return JSON only.`;

    const answer = await llmProvider.generate_answer(systemPrompt, userPrompt, "");

    // Parse the JSON response
    let result: AIMatchResponse;
    try {
      // Try to extract JSON from the response
      const jsonMatch = answer.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          bestMatchIndex: parsed.bestMatchIndex ?? null,
          confidence: Math.min(100, Math.max(0, parsed.confidence ?? 0)),
          reason: parsed.reason || "No reason provided",
          provider: config.llm_provider,
          model: config.llm_model,
        };
      } else {
        // Fallback: try to parse the entire answer
        result = {
          bestMatchIndex: null,
          confidence: 0,
          reason: "Could not parse AI response",
          provider: config.llm_provider,
          model: config.llm_model,
        };
      }
    } catch (parseError) {
      console.error("[AI Matcher] Failed to parse AI response:", answer);
      result = {
        bestMatchIndex: null,
        confidence: 0,
        reason: "Failed to parse AI response",
        provider: config.llm_provider,
        model: config.llm_model,
      };
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[AI Matcher API] Error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
