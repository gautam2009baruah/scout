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
  const body = await request.json().catch(() => null);
  const events = Array.isArray(body?.events) ? body.events as WorkflowAnalyticsEventInput[] : [];

  if (events.length === 0) {
    return NextResponse.json({ recorded: 0 }, { headers });
  }

  const result = await recordWorkflowAnalyticsEvents(events.slice(0, 50));
  return NextResponse.json(result, { headers });
}
