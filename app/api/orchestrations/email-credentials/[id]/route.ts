// Email Credential Management API (Single Credential)
// Delete or update individual email credentials

import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db/pool";
import { getCurrentAdminSession } from "@/lib/admin/session";

/**
 * GET /api/orchestrations/email-credentials/[id]
 * Get full details of a single email credential (for editing)
 */
export async function GET(
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

    // Fetch credential details with target apps (excluding password for security)
    const result = await pool.query(
      `SELECT 
        ec.id,
        ec.company_id,
        ec.provider,
        ec.name,
        ec.email_address,
        ec.imap_host,
        ec.imap_port,
        ec.imap_tls,
        ec.is_active,
        ec.last_tested_at,
        ec.last_test_status,
        ec.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ta.id,
              'name', ta.name
            )
            ORDER BY ta.name
          ) FILTER (WHERE ta.id IS NOT NULL),
          '[]'
        ) as target_apps
       FROM email_credentials ec
       LEFT JOIN email_credential_target_apps ecta ON ec.id = ecta.email_credential_id
       LEFT JOIN guided_workflow_target_apps ta ON ecta.target_app_id = ta.id
       WHERE ec.id = $1
       GROUP BY ec.id`,
      [credentialId]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        { success: false, error: "Credential not found or access denied" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      credential: result.rows[0],
    });
  } catch (error: any) {
    console.error("[API] Error fetching email credential:", error);
    return NextResponse.json(
      { success: false, error: "Unable to retrieve credential details" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/orchestrations/email-credentials/[id]
 * Delete an email credential
 */
export async function DELETE(
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

    const pool = getPool();

    // Check if credential exists
    const checkResult = await pool.query(
      `SELECT id FROM email_credentials
       WHERE id = $1`,
      [credentialId]
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
       AND status = 'active'`,
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
      { success: false, error: "Unable to delete credential" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/orchestrations/email-credentials/[id]
 * Update an email credential
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
    const updatedBy = session.user.email;

    const body = await request.json();
    const {
      name,
      emailAddress,
      imapHost,
      imapPort,
      imapPassword,
      imapTls,
      isActive,
      targetAppIds,
    } = body;

    const pool = getPool();
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if credential exists
      const checkResult = await client.query(
        `SELECT provider FROM email_credentials
         WHERE id = $1`,
        [credentialId]
      );

      if (checkResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          { success: false, error: "Credential not found or access denied" },
          { status: 404 }
        );
      }

      const provider = checkResult.rows[0].provider;

      // Build update query dynamically based on provided fields
    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }

    if (emailAddress !== undefined) {
      updates.push(`email_address = $${paramIndex++}`);
      values.push(emailAddress);
    }

    if (provider === "imap") {
      if (imapHost !== undefined) {
        updates.push(`imap_host = $${paramIndex++}`);
        values.push(imapHost);
      }

      if (imapPort !== undefined) {
        updates.push(`imap_port = $${paramIndex++}`);
        values.push(imapPort);
      }

      if (imapPassword !== undefined && imapPassword !== "") {
        // Only update password if provided
        const encryptedPassword = `encrypted:${imapPassword}`;
        updates.push(`imap_password = $${paramIndex++}`);
        values.push(encryptedPassword);
      }

      if (imapTls !== undefined) {
        updates.push(`imap_tls = $${paramIndex++}`);
        values.push(imapTls);
      }
    }

    if (isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(isActive);
    }

    if (updates.length === 0 && !targetAppIds) {
      await client.query('ROLLBACK');
      client.release();
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    let result;
    if (updates.length > 0) {
      updates.push(`updated_by_email = $${paramIndex++}`);
      values.push(updatedBy);
      values.push(credentialId);

      result = await client.query(
        `UPDATE email_credentials
         SET ${updates.join(", ")}, updated_at = NOW()
         WHERE id = $${paramIndex}
         RETURNING id, provider, name, email_address, is_active`,
        values
      );
    }

    // Update target app assignments if provided
    if (targetAppIds !== undefined && Array.isArray(targetAppIds)) {
      // Delete existing assignments
      await client.query(
        `DELETE FROM email_credential_target_apps WHERE email_credential_id = $1`,
        [credentialId]
      );

      // Insert new assignments
      if (targetAppIds.length > 0) {
        const appAssignments = targetAppIds.map((appId: string) => 
          client.query(
            `INSERT INTO email_credential_target_apps (email_credential_id, target_app_id, created_by_email)
             VALUES ($1, $2, $3)
             ON CONFLICT (email_credential_id, target_app_id) DO NOTHING`,
            [credentialId, appId, updatedBy]
          )
        );
        await Promise.all(appAssignments);
      }
    }

    await client.query('COMMIT');

    return NextResponse.json({
      success: true,
      credential: result ? result.rows[0] : { id: credentialId },
      message: "Email credential updated successfully",
    });
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error: any) {
    console.error("[API] Error updating email credential:", error);
    return NextResponse.json(
      { success: false, error: "Unable to update credential" },
      { status: 500 }
    );
  }
}
