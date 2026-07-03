/**
 * API endpoint for single orchestration operations
 * DELETE: Delete an orchestration
 */

import { NextRequest, NextResponse } from "next/server";
import { deleteOrchestration } from "@/lib/orchestrations/db";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await deleteOrchestration(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting orchestration:", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to delete orchestration" },
      { status: 500 }
    );
  }
}
