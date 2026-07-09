// Target Apps API
// Fetch available target apps for email credential assignment

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

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

    const pool = getPool();
    
    const result = await pool.query(
      `SELECT 
        id,
        name,
        base_url,
        created_at
       FROM guided_workflow_target_apps
       WHERE company_id = $1
       ORDER BY name ASC`,
      [companyId]
    );

    return NextResponse.json({
      success: true,
      targetApps: result.rows,
    });
  } catch (error: any) {
    console.error("[API] Error fetching target apps:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve target apps" },
      { status: 500 }
    );
  }
}
