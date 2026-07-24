import http from "node:http";
import { URL } from "node:url";
import { getPool } from "@/lib/db/pool";
import type { ElementIdentity, SelectorCandidate, TargetElement } from "@/shared/guideTypes";

type SaveSuggestionRequest = {
  workflowId: string;
  stepId: string;
  stepOrder: number;
  originalIdentity: ElementIdentity;
  proposedElementIdentity?: ElementIdentity;
  proposedTarget?: TargetElement;
  proposedSelectorCandidates: SelectorCandidate[];
  confidenceScore: number;
  healingSource: "rule-based" | "ai-assisted";
  healingReason: string;
  aiProvider?: string;
  aiModel?: string;
  pageUrl: string;
  pageTitle: string;
};

const host = process.env.SMART_FINDER_API_HOST || "0.0.0.0";
const port = Number(process.env.SMART_FINDER_API_PORT || 4302);

function setCorsHeaders(request: http.IncomingMessage, response: http.ServerResponse) {
  const origin = request.headers.origin || "*";
  response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Vary", "Origin");
}

function sendJson(request: http.IncomingMessage, response: http.ServerResponse, status: number, body: unknown) {
  setCorsHeaders(request, response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function saveSuggestion(body: SaveSuggestionRequest) {
  const {
    workflowId,
    stepId,
    stepOrder,
    originalIdentity,
    proposedElementIdentity,
    proposedTarget,
    proposedSelectorCandidates,
    confidenceScore,
    healingSource,
    healingReason,
    aiProvider,
    aiModel,
    pageUrl,
    pageTitle,
  } = body;

  if (!workflowId || !stepId || !originalIdentity || !proposedSelectorCandidates) {
    return { status: 400, body: { error: "Missing required fields" } };
  }

  const workflowResult = await getPool().query(
    `SELECT id FROM guided_workflow_guides WHERE id = $1`,
    [workflowId]
  );

  if (workflowResult.rows.length === 0) {
    return { status: 404, body: { error: "Workflow not found" } };
  }

  const existingResult = await getPool().query(
    `SELECT id FROM guided_workflow_healing_suggestions
     WHERE workflow_id = $1 AND step_id = $2 AND status = 'pending' AND deleted_at IS NULL`,
    [workflowId, stepId]
  );

  if (existingResult.rows.length > 0) {
    await getPool().query(
      `UPDATE guided_workflow_healing_suggestions
       SET
         playback_attempt_count = playback_attempt_count + 1,
         last_playback_attempt_at = now(),
         confidence_score = $1,
         healing_source = $2,
         healing_reason = $3,
         proposed_selector_candidates = $4,
         proposed_element_identity = $5,
         ai_provider = $6,
         ai_model = $7,
         page_url = $8,
         page_title = $9,
         updated_at = now()
       WHERE id = $10`,
      [
        confidenceScore,
        healingSource,
        healingReason,
        JSON.stringify(proposedSelectorCandidates),
        proposedTarget ? JSON.stringify(proposedTarget) : proposedElementIdentity ? JSON.stringify(proposedElementIdentity) : null,
        aiProvider || null,
        aiModel || null,
        pageUrl,
        pageTitle || null,
        existingResult.rows[0].id,
      ]
    );

    await getPool().query(
      `INSERT INTO guided_workflow_healing_audit
       (workflow_id, step_id, event_type, healing_source, confidence_score, attempted_selector_candidates, success, page_url)
       VALUES ($1, $2, 'attempt', $3, $4, $5, true, $6)`,
      [workflowId, stepId, healingSource, confidenceScore, JSON.stringify(proposedSelectorCandidates), pageUrl]
    );

    return { status: 200, body: { success: true, suggestionId: existingResult.rows[0].id } };
  }

  const insertResult = await getPool().query(
    `INSERT INTO guided_workflow_healing_suggestions
     (workflow_id, step_id, step_order, original_selector_candidates, original_element_identity,
      proposed_selector_candidates, proposed_element_identity, confidence_score, healing_source, healing_reason,
      ai_provider, ai_model, page_url, page_title, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'pending')
     RETURNING id`,
    [
      workflowId,
      stepId,
      stepOrder,
      JSON.stringify(originalIdentity.selectorCandidates || []),
      JSON.stringify(originalIdentity),
      JSON.stringify(proposedSelectorCandidates),
      proposedTarget ? JSON.stringify(proposedTarget) : proposedElementIdentity ? JSON.stringify(proposedElementIdentity) : null,
      confidenceScore,
      healingSource,
      healingReason,
      aiProvider || null,
      aiModel || null,
      pageUrl,
      pageTitle || null,
    ]
  );

  const suggestionId = insertResult.rows[0].id;

  await getPool().query(
    `INSERT INTO guided_workflow_healing_audit
     (workflow_id, step_id, event_type, healing_source, confidence_score, attempted_selector_candidates, success, page_url)
     VALUES ($1, $2, 'attempt', $3, $4, $5, true, $6)`,
    [workflowId, stepId, healingSource, confidenceScore, JSON.stringify(proposedSelectorCandidates), pageUrl]
  );

  return { status: 200, body: { success: true, suggestionId } };
}

const server = http.createServer(async (request, response) => {
  try {
    const method = request.method?.toUpperCase() || "GET";
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/health") {
      return sendJson(request, response, 200, { ok: true, service: "smart-finder-api" });
    }

    if (url.pathname !== "/v1/healing-suggestions") {
      return sendJson(request, response, 404, { message: "Not found." });
    }

    if (method === "OPTIONS") {
      setCorsHeaders(request, response);
      response.statusCode = 204;
      response.end();
      return;
    }

    if (method !== "POST") {
      return sendJson(request, response, 405, { message: "Method not allowed." });
    }

    const body = await readJsonBody(request);
    if (!body || typeof body !== "object") {
      return sendJson(request, response, 400, { error: "Request body is required." });
    }

    const result = await saveSuggestion(body as SaveSuggestionRequest);
    return sendJson(request, response, result.status, result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return sendJson(request, response, 500, { error: "Internal server error", message });
  }
});

server.listen(port, host, () => {
  console.log(`[smart-finder-api] listening on http://${host}:${port}`);
});
