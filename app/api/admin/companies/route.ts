// Companies API
// Fetch all active companies (no user filtering)

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * GET /api/admin/companies
 * Returns list of all active companies
 */
export async function GET() {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const pool = getPool();
    
    // Fetch all active companies
    const result = await pool.query(
      `SELECT 
        id,
        name,
        slug,
        status
       FROM companies
       WHERE deleted_at IS NULL
       ORDER BY name ASC`
    );

    return NextResponse.json({
      success: true,
      companies: result.rows,
    });
  } catch (error: any) {
    console.error("[API] Error fetching companies:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve companies" },
      { status: 500 }
    );
  }
}
