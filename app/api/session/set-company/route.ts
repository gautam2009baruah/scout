import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession, switchCompanyContext } from "@/lib/admin/session";

/**
 * POST /api/session/set-company
 * Switches the user's current company context
 * Body: { companyId: string }
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await req.json();

  if (!companyId) {
    return NextResponse.json({ error: "companyId is required" }, { status: 400 });
  }

  // Check if user has access to this company
  const hasAccess = session.availableCompanies.some(c => c.companyId === companyId);

  if (!hasAccess) {
    return NextResponse.json({ error: "No access to this company" }, { status: 403 });
  }

  // Switch company context
  const success = await switchCompanyContext(session.user.id, companyId);

  if (!success) {
    return NextResponse.json({ error: "Failed to switch company" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: "Company context switched successfully"
  });
}
