// Email Credential Management API (Single Credential)
// Delete or update individual email credentials

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * DELETE /api/orchestrations/email-credentials/[id]
 * Delete an email credential
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getCurrentAdminSession();
    
    if (!session) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
    }

    const credentialId = params.id;
    const companyId = session.user.tenantId;

    const pool = getPool();

    // Check if credential exists and belongs to this company
    const checkResult = await pool.query(
      `SELECT id FROM email_credentials
       WHERE id = $1 AND company_id = $2`,
      [credentialId, companyId]
    );

    if (checkResult.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Credential not found or access denied" },
        { status: 404 }
      );
    }

    // Check if credential is being used in any active triggers
    const triggerCheck = await pool.query(
      `SELECT COUNT(*) as count
       FROM orchestration_triggers
       WHERE trigger_type = 'email'
       AND config->>'emailCredentialId' = $1
       AND is_active = true`,
      [credentialId]
    );

    if (parseInt(triggerCheck.rows[0].count) > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Cannot delete: This credential is being used by active email triggers. Deactivate those triggers first." 
        },
        { status: 400 }
      );
    }

    // Delete the credential
    await pool.query(
      `DELETE FROM email_credentials
       WHERE id = $1`,
      [credentialId]
    );

    return NextResponse.json({
      success: true,
      message: "Email credential deleted successfully",
    });
  } catch (error: any) {
    console.error("[API] Error deleting email credential:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
