import { NextResponse } from "next/server";
import { appendRecordedActionByToken, GuidedWorkflowError } from "@/lib/admin/guided-workflows";

export const runtime = "nodejs";

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "*";

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return NextResponse.json({ message: "Recorder payload is required." }, { status: 400, headers: corsHeaders(request) });
  }

  try {
    const result = await appendRecordedActionByToken(
      String(body.recorderToken ?? body.recorder_token ?? ""),
      body.action,
      request.headers.get("origin") ?? undefined
    );

    return NextResponse.json(result, { headers: corsHeaders(request) });
  } catch (error) {
    if (error instanceof GuidedWorkflowError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode, headers: corsHeaders(request) });
    }

    throw error;
  }
}
