import { NextResponse } from "next/server";
import { ingestWebPageFromToken, WebIngestionError } from "@/lib/admin/web-ingestion";

export const runtime = "nodejs";

// The browser extension posts cross-origin with a bearer capability token (not
// cookies), so a permissive CORS reflection is safe here — the token is the
// only thing that authorizes the write.
function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Scout-Ingest-Token",
    Vary: "Origin"
  };
}

export function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin") || "*") });
}

/**
 * POST /api/admin/documents/ingest-html
 * Store a single authenticated web page (captured in the admin's browser by the
 * Scout Web Ingestor extension) as a managed document, then queue processing.
 */
export async function POST(request: Request) {
  const headers = corsHeaders(request.headers.get("origin") || "*");
  const token = request.headers.get("x-scout-ingest-token") || "";

  try {
    const body = await request.json().catch(() => null);
    const result = await ingestWebPageFromToken(token, {
      url: String(body?.url ?? ""),
      title: typeof body?.title === "string" ? body.title : undefined,
      html: String(body?.html ?? "")
    });
    return NextResponse.json({ success: true, ...result }, { headers });
  } catch (error) {
    if (error instanceof WebIngestionError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode, headers });
    }
    console.error("[web-ingest] Failed to ingest page", error);
    return NextResponse.json({ success: false, message: "Unable to ingest page." }, { status: 500, headers });
  }
}
