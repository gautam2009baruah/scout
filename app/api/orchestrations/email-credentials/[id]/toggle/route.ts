// Toggle Email Credential Active Status
// Enable or disable credentials without deletion

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * PATCH /api/orchestrations/email-credentials/[id]/toggle
 * Toggle is_active status (enable/disable)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const { id: credentialId } = await params;
    const companyId = session.user.tenantId;

    const pool = getPool();

    // Check if credential exists and belongs to this company
    const checkResult = await pool.query(
      `SELECT is_active FROM email_credentials
       WHERE id = $1 AND company_id = $2`,
      [credentialId, companyId]
    );

    if (checkResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Credential not found or access denied" },
        { status: 404 }
      );
    }

    const currentStatus = checkResult.rows[0].is_active;

    // Toggle the status
    const result = await pool.query(
      `UPDATE email_credentials
       SET is_active = $1, updated_at = NOW(), updated_by_email = $2
       WHERE id = $3
       RETURNING id, is_active`,
      [!currentStatus, session.user.email, credentialId]
    );

    return NextResponse.json({
      success: true,
      credential: result.rows[0],
      message: `Credential ${!currentStatus ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error: any) {
    console.error("[API] Error toggling email credential status:", error);
    return NextResponse.json(
      { success: false, error: "Unable to toggle credential status" },
      { status: 500 }
    );
  }
}
