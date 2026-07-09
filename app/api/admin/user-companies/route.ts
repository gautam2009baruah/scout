// User Companies API
// Fetch companies that the current user has access to

import { NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * GET /api/admin/user-companies
 * Returns list of companies the current user has access to
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

    const userId = session.user.id;
    const pool = getPool();
    
    // Fetch companies user has access to via user_company_roles
    const result = await pool.query(
      `SELECT DISTINCT 
        c.id,
        c.name,
        c.slug
       FROM companies c
       INNER JOIN user_company_roles ucr ON c.id = ucr.company_id
       WHERE ucr.user_id = $1
         AND ucr.deleted_at IS NULL
         AND c.deleted_at IS NULL
       ORDER BY c.name ASC`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      companies: result.rows,
    });
  } catch (error: any) {
    console.error("[API] Error fetching user companies:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve companies" },
      { status: 500 }
    );
  }
}
