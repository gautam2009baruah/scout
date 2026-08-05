import { NextResponse } from "next/server";

export const runtime = "nodejs";

function targetBaseUrl() {
  return (process.env.RECORDER_SYNC_API_URL || "http://localhost:4301").replace(/\/$/, "");
}

async function proxyRequest(request: Request) {
  const origin = request.headers.get("origin") || "*";
  const internalSecret = process.env.RECORDER_SYNC_INTERNAL_SECRET?.trim();
  if (!internalSecret) {
    return new Response(JSON.stringify({ message: "Recorder service authentication is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  const response = await fetch(`${targetBaseUrl()}/v1/recorder/actions`, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("content-type") || "application/json",
      "origin": origin,
      "x-scout-internal-secret": internalSecret,
    },
    body: request.method === "OPTIONS" ? undefined : await request.text(),
    cache: "no-store"
  });

  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    }
  });
}

export async function OPTIONS(request: Request) {
  try {
    return await proxyRequest(request);
  } catch {
    return NextResponse.json({ message: "Recorder sync API is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    return await proxyRequest(request);
  } catch {
    return NextResponse.json({ message: "Recorder sync API is unavailable." }, { status: 503 });
  }
}
