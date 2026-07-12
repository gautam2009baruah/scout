// Target Apps API
// Fetch available target apps for email credential assignment

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { listGuidedWorkflowTargetApps } from "@/lib/admin/guided-workflows";

/**
 * GET /api/orchestrations/target-apps?companyId=xxx
 * List all target apps for specified company (or current user's company if not specified)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const companyId = searchParams.get("companyId") || session.user.tenantId;

    const targetApps = (await listGuidedWorkflowTargetApps(session))
      .filter((app) => app.companyId === companyId);

    return NextResponse.json({
      success: true,
      targetApps: targetApps.map((app) => ({
        id: app.id,
        name: app.name,
        base_url: app.baseUrl,
        created_at: app.createdAt,
      })),
    });
  } catch (error: any) {
    console.error("[API] Error fetching target apps:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve target apps" },
      { status: 500 }
    );
  }
}
