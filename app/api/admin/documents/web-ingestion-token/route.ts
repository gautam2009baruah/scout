import { NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { DocumentError, ensureFolderAccess } from "@/lib/admin/documents";
import { mintWebIngestionToken } from "@/lib/admin/web-ingestion";

export const runtime = "nodejs";

/**
 * POST /api/admin/documents/web-ingestion-token
 * Mint a short-lived pairing token for the Scout Web Ingestor browser
 * extension, scoped to one folder of the caller's current company.
 */
export async function POST(request: Request) {
  const session = await getCurrentAdminSession();
  if (!session) {
    return NextResponse.json({ message: "Authentication required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const folderId = String(body?.folderId ?? "").trim();
  const ttlHours = Number(body?.ttlHours) || 24;

  if (!folderId) {
    return NextResponse.json({ message: "A folder is required." }, { status: 400 });
  }

  const companyId = session.user.tenantId;

  try {
    await ensureFolderAccess(companyId, folderId, session);
  } catch (error) {
    if (error instanceof DocumentError) {
      return NextResponse.json({ message: error.message }, { status: error.statusCode });
    }
    throw error;
  }

  const { token, expiresAt } = mintWebIngestionToken({
    companyId,
    folderId,
    userId: session.user.id,
    ttlHours
  });

  const scoutBaseUrl = process.env.APP_BASE_URL || new URL(request.url).origin;

  return NextResponse.json({ token, expiresAt, scoutBaseUrl });
}
