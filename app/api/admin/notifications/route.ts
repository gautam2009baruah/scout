/**
 * API route for internal notifications
 * GET /api/admin/notifications - Get user's notifications
 * PUT /api/admin/notifications/:id - Mark notification as read
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentAdminSession } from "@/lib/admin/session";
import { getPool } from "@/lib/db/pool";

export async function GET(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const limit = Number(searchParams.get("limit")) || 50;

    const pool = getPool();

    let query = `
      SELECT 
        id, user_id, title, message, read, type, metadata, created_at, read_at
      FROM internal_notifications
      WHERE user_id = $1
    `;

    if (unreadOnly) {
      query += " AND read = FALSE";
    }

    query += " ORDER BY created_at DESC LIMIT $2";

    const result = await pool.query(query, [session.user.email, limit]);

    const notifications = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      title: row.title,
      message: row.message,
      read: row.read,
      type: row.type,
      metadata: row.metadata,
      createdAt: row.created_at,
      readAt: row.read_at,
    }));

    // Get unread count
    const countResult = await pool.query(
      "SELECT COUNT(*) as count FROM internal_notifications WHERE user_id = $1 AND read = FALSE",
      [session.user.email]
    );

    return NextResponse.json({
      notifications,
      unreadCount: Number(countResult.rows[0]?.count || 0),
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getCurrentAdminSession();
    if (!session) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId, read } = body;

    if (!notificationId) {
      return NextResponse.json(
        { message: "Missing required field: notificationId" },
        { status: 400 }
      );
    }

    const pool = getPool();

    // Verify notification belongs to user
    const checkResult = await pool.query(
      "SELECT id FROM internal_notifications WHERE id = $1 AND user_id = $2",
      [notificationId, session.user.email]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { message: "Notification not found" },
        { status: 404 }
      );
    }

    // Update read status
    await pool.query(
      `UPDATE internal_notifications 
       SET read = $1, read_at = CASE WHEN $1 = TRUE THEN NOW() ELSE NULL END 
       WHERE id = $2`,
      [read !== false, notificationId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating notification:", error);
    return NextResponse.json(
      { message: "Failed to update notification" },
      { status: 500 }
    );
  }
}
