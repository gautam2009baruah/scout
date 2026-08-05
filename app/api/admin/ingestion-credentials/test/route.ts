import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { ConnectorError, normalizeConnectorCredential } from "@/lib/document-processing/connectors/types";
import { testGoogleDriveConnection } from "@/lib/document-processing/connectors/google-drive";
import { testSharePointConnection } from "@/lib/document-processing/connectors/sharepoint";

export const runtime = "nodejs";

/**
 * POST /api/admin/ingestion-credentials/test
 * Validate Google Drive / SharePoint connection credentials with a minimal live
 * API call, before they are saved. Requires an admin session; the credentials
 * under test are supplied inline by the same admin, so there is no cross-company
 * data involved.
 */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ success: false, message: "Authentication required." }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => null);
    const credential = normalizeConnectorCredential(body);

    const result =
      credential.provider === "google_drive"
        ? await testGoogleDriveConnection(credential)
        : await testSharePointConnection(credential);

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    if (error instanceof ConnectorError) {
      return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
    }
    const message = error instanceof Error ? error.message : "Unable to test the connection.";
    console.error("[ingestion-credentials/test] failed", error);
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
