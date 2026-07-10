import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession, switchCompanyContext } from "@/lib/admin/session";

/**
 * GET /api/session/available-companies
 * Returns all companies the current user has access to
 */
export async function GET() {
  const session = await getCurrentAdminSession();

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const response = NextResponse.json({
    currentCompanyId: session.user.tenantId,
    currentCompanyName: session.tenant.name,
    availableCompanies: session.availableCompanies.map(company => ({
      id: company.companyId,
      name: company.companyName,
      slug: company.companySlug,
      roleId: company.roleId,
      roleName: company.roleName,
      isPrimary: company.isPrimary
    }))
  });

  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");

  return response;
}
