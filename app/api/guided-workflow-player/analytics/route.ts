import { NextResponse } from "next/server";
import { recordWorkflowAnalyticsEvents, type WorkflowAnalyticsEventInput } from "@/lib/guided-workflows/analytics";

export const runtime = "nodejs";

function corsHeaders(request: Request) {
  // navigator.sendBeacon (the primary delivery path for this endpoint) always
  // sends credentials, so the browser requires a real Allow-Credentials response
  // and forbids a wildcard Allow-Origin whenever one is present.
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Api-Key, Authorization",
    ...(origin ? { "Access-Control-Allow-Credentials": "true" } : {}),
    "Vary": "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const headers = corsHeaders(request);

  // This is called via navigator.sendBeacon/fetch from arbitrary customer
  // origins. If recordWorkflowAnalyticsEvents throws (e.g. a malformed or
  // stale event referencing a workflowId that no longer exists), letting it
  // propagate uncaught would make Next.js return its default 500 response —
  // which has no CORS headers at all. The browser then reports that as a CORS
  // policy violation, masking the real server error. Keep every response,
  // success or failure, on the same headers so the browser can actually see
  // the real status instead.
  try {
    const body = await request.json().catch(() => null);
    const events = Array.isArray(body?.events) ? body.events as WorkflowAnalyticsEventInput[] : [];

    if (events.length === 0) {
      return NextResponse.json({ recorded: 0 }, { headers });
    }

    const result = await recordWorkflowAnalyticsEvents(events.slice(0, 50));
    return NextResponse.json(result, { headers });
  } catch (error) {
    console.error("[GuidedWorkflowAnalyticsRoute] recordWorkflowAnalyticsEvents failed", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to record analytics events." },
      { status: 500, headers }
    );
  }
}
