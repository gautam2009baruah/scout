import { NextResponse } from "next/server";
import { downloadConnectorFile } from "@/lib/document-processing/connectors";
import { ConnectorError } from "@/lib/document-processing/connectors/types";

export const runtime = "nodejs";

/**
 * POST /api/internal/connector-file
 * Internal-only: the document worker calls this (with a shared secret) to fetch
 * a Google Drive / SharePoint file's bytes at processing time. Keeping the
 * download here means the OAuth/credential logic lives in one place (TypeScript)
 * and the worker never handles provider secrets directly.
 */
export async function POST(request: Request) {
  const secret = process.env.DOCUMENT_WORKER_INTERNAL_SECRET || "";
  const provided = request.headers.get("x-scout-internal-secret") || "";
  if (!secret || provided !== secret) {
    return NextResponse.json({ message: "Unauthorized." }, { status: 401 });
  }

  let body: {
    companyId?: string;
    connector?: {
      provider?: string;
      credential_reference?: string;
      item_id?: string;
      drive_id?: string;
      download_mime?: string;
    };
  } | null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body." }, { status: 400 });
  }

  const companyId = String(body?.companyId ?? "");
  const connector = body?.connector;
  if (!companyId || !connector || (connector.provider !== "google_drive" && connector.provider !== "sharepoint") || !connector.credential_reference || !connector.item_id) {
    return NextResponse.json({ message: "Missing or invalid connector reference." }, { status: 400 });
  }

  try {
    const buffer = await downloadConnectorFile(companyId, {
      provider: connector.provider,
      credential_reference: String(connector.credential_reference),
      item_id: String(connector.item_id),
      drive_id: connector.drive_id ? String(connector.drive_id) : undefined,
      download_mime: connector.download_mime ? String(connector.download_mime) : undefined
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(buffer.byteLength)
      }
    });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    console.error("[connector-file] download failed", error);
    return NextResponse.json({ message: "Unable to download connector file." }, { status: 500 });
  }
}
